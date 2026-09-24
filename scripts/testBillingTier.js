// scripts/testBillingTier.js
//
// Bug batch 1, Phase 2 (session_addendum_bug_batch_1.md): canceled
// subscribers fall back to the free tier. No network, no Stripe, no paid
// AI -- runs entirely against scripts/lib/fakeSupabase.js.
//
// Covers:
//   1. lib/billingTier.js's pure pieces: tier selection, the
//      Postgres-matching "+1 month" used for nextResetAt, the
//      /billing/status payload builders, and Stripe period extraction.
//   2. middleware/enforceGenerationCap.js's tier routing (free, lapsed,
//      subscribed, past_due) with BILLING_ENABLED=true -- which counter
//      each request actually spends, and the lapsed free -> credits order.
//   3. routes/stripeWebhook.js's handlers fed fixture event objects (no
//      signature check, no Stripe API): subscription.updated syncs period
//      + cancel_at_period_end, subscription.deleted clamps the end date,
//      checkout (resubscribe) resets both usage counters, and every write
//      still lands when migrations/037's column doesn't exist yet.
//
// The real cycle-rollover SQL (reset_free_cycle_if_elapsed) is covered
// against live Supabase by scripts/testFreeTierAllowance.js instead.
//
// Usage: node scripts/testBillingTier.js

process.env.BILLING_ENABLED = "true";
// lib/stripeClient.js throws at require time without a key; nothing here
// ever calls Stripe (the handlers under test don't, and the two that do
// -- checkout/invoice -- get a stubbed stripe.subscriptions.retrieve).
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_not_real";

const fake = require("./lib/fakeSupabase");
fake.install();
const { db, disabledRpcs } = fake;

const {
  billingTierFor, isActiveSubscription, addOneMonthLikePostgres,
  buildBillingStatusPayload, stripePeriodFields, isStaleActive
} = require("../lib/billingTier");
const { getBillingOffer, formatMoney, _clearPriceCacheForTests } = require("../lib/billingOffer");
const { enforceGenerationCap, enforceImageGenerationCap } = require("../middleware/enforceGenerationCap");
const { checkEntryCap } = require("../middleware/enforceEntryCap");
const { FREE_MONTHLY_GENERATION_CAP, FREE_ENTRY_CAP } = require("../lib/worldConfigRepo");
const { stripe } = require("../lib/stripeClient");
const { supabase } = require("../lib/supabaseClient");
const { handlers } = require("../routes/stripeWebhook");

const failures = [];
function check(label, condition) {
  console.log(`  ${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) failures.push(label);
}

// ---------- helpers ----------

function resetDb() {
  for (const key of Object.keys(db)) db[key] = [];
}

// Runs one middleware call to completion. Resolves with
// { allowed, status, body, req } -- allowed means next() ran without an
// error.
function runMiddleware(mw, { userId, worldId }) {
  return new Promise((resolve) => {
    const req = { userId, worldId };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ allowed: false, status: this.statusCode, body, req }); return this; }
    };
    mw(req, res, (err) => resolve({ allowed: !err, status: err ? 500 : 200, body: err ? { error: err.message } : null, req }));
  });
}

function seedWorld(worldId, overrides = {}) {
  db.world_config.push({ world_id: worldId, generation_count: 0, image_generation_count: 0, free_cycle_reset_at: new Date().toISOString(), ...overrides });
}

function seedSubscription(userId, overrides = {}) {
  const row = {
    user_id: userId, plan_id: "chronicled_monthly", stripe_customer_id: "cus_test", stripe_subscription_id: `sub_${userId}`,
    status: "active", current_period_start: "2099-08-01T00:00:00.000Z", current_period_end: "2099-09-01T00:00:00.000Z",
    used_this_cycle: 0, used_images_this_cycle: 0, monthly_quota: 250, monthly_quota_images: 10, ...overrides
  };
  db.subscriptions.push(row);
  return row;
}

function grantCredits(userId, points) {
  db.credit_ledger.push({ user_id: userId, amount: points, reason: "purchase" });
}

// ---------- 1. pure pieces ----------

function testPure() {
  console.log("\n-- lib/billingTier.js (pure) --");

  check("no row -> free", billingTierFor(null) === "free");
  check("active -> subscribed", billingTierFor({ status: "active" }) === "subscribed");
  check("trialing stays subscribed", billingTierFor({ status: "trialing" }) === "subscribed");
  for (const status of ["canceled", "unpaid", "incomplete_expired", "past_due"]) {
    check(`${status} -> lapsed`, billingTierFor({ status }) === "lapsed");
  }
  check("isActiveSubscription only for 'active'",
    isActiveSubscription({ status: "active" }) && !isActiveSubscription({ status: "past_due" })
    && !isActiveSubscription({ status: "canceled" }) && !isActiveSubscription(null));

  const iso = (d) => d.toISOString();
  check("+1 month: mid-month keeps day and time",
    iso(addOneMonthLikePostgres("2026-03-15T10:20:30.000Z")) === "2026-04-15T10:20:30.000Z");
  check("+1 month: Jan 31 clamps to Feb 28 (Postgres semantics, not Mar 3)",
    iso(addOneMonthLikePostgres("2026-01-31T12:00:00.000Z")) === "2026-02-28T12:00:00.000Z");
  check("+1 month: leap year Jan 31 -> Feb 29",
    iso(addOneMonthLikePostgres("2028-01-31T00:00:00.000Z")) === "2028-02-29T00:00:00.000Z");
  check("+1 month: Dec rolls into next year",
    iso(addOneMonthLikePostgres("2026-12-31T23:59:59.000Z")) === "2027-01-31T23:59:59.000Z");
  check("+1 month: bad input -> null", addOneMonthLikePostgres("not a date") === null);

  const config = { generation_count: 15, image_generation_count: 1, free_cycle_reset_at: "2026-09-10T00:00:00.000Z" };
  const entryCap = { unlimited: false, count: 3, cap: 30, remaining: 27 };

  const free = buildBillingStatusPayload({ tier: "free", subscription: null, config, creditBalancePoints: 12, entryCap, aiEnabled: true });
  check("free payload: state/remaining/nextResetAt",
    free.state === "free" && free.freeUsed === 3 && free.freeCap === 10 && free.freeRemaining === 7
    && free.freeImageRemaining === 0 && free.nextResetAt === "2026-10-10T00:00:00.000Z");
  check("free payload: credits floor to generations, field assists count raw points",
    free.creditBalance === 2 && free.fieldAssistsRemaining === (FREE_MONTHLY_GENERATION_CAP - 15) + 12);

  const canceledSub = { status: "canceled", current_period_end: "2026-08-31T00:00:00.000Z", used_this_cycle: 30, plan_id: "chronicled_monthly" };
  const lapsed = buildBillingStatusPayload({ tier: "lapsed", subscription: canceledSub, config, creditBalancePoints: 25, entryCap, aiEnabled: true });
  check("lapsed payload: free-tier numbers + endedAt + credits",
    lapsed.state === "lapsed" && lapsed.status === "canceled" && lapsed.endedAt === "2026-08-31T00:00:00.000Z"
    && lapsed.freeRemaining === 7 && lapsed.creditBalance === 5 && lapsed.entryCap === entryCap);
  check("lapsed payload: no dead-plan fields (no 'N of 50', no Renews date)",
    !("monthlyQuota" in lapsed) && !("remainingThisCycle" in lapsed) && !("currentPeriodEnd" in lapsed) && !("planName" in lapsed));

  const plan = { name: "Chronicled Monthly", monthly_quota: 250, monthly_quota_images: 10 };
  const activeSub = { status: "active", used_this_cycle: 30, used_images_this_cycle: 2, current_period_end: "2026-10-01T00:00:00.000Z" };
  const sub = buildBillingStatusPayload({ tier: "subscribed", subscription: activeSub, plan, creditBalancePoints: 0, entryCap: { unlimited: true }, aiEnabled: true });
  check("subscribed payload unchanged: 44 of 50, 8 of 10 images, cancelAtPeriodEnd false when column absent",
    sub.state === "subscribed" && sub.remainingThisCycle === 44 && sub.monthlyQuota === 50
    && sub.remainingImagesThisCycle === 8 && sub.cancelAtPeriodEnd === false);
  const canceling = buildBillingStatusPayload({ tier: "subscribed", subscription: { ...activeSub, cancel_at_period_end: true }, plan, creditBalancePoints: 0, entryCap: { unlimited: true }, aiEnabled: true });
  check("subscribed + cancel_at_period_end -> cancelAtPeriodEnd true", canceling.cancelAtPeriodEnd === true);

  check("stripePeriodFields: top-level (pinned API shape)",
    stripePeriodFields({ current_period_start: 1788220800, current_period_end: 1790899200 }).currentPeriodEnd === "2026-10-02T00:00:00.000Z");
  check("stripePeriodFields: falls back to items[0] (newer API shape)",
    stripePeriodFields({ items: { data: [{ current_period_start: 1788220800, current_period_end: 1790899200 }] } }).currentPeriodStart === "2026-09-01T00:00:00.000Z");
  const none = stripePeriodFields({});
  check("stripePeriodFields: missing -> nulls, never Invalid Date", none.currentPeriodStart === null && none.currentPeriodEnd === null);
}

// ---------- 2. middleware tier routing ----------

async function testMiddleware() {
  console.log("\n-- middleware tier routing (BILLING_ENABLED=true) --");
  const FREE_GENS = FREE_MONTHLY_GENERATION_CAP / 5;

  // Free account: 10 gens, then purchased credits (migrations/038), then
  // blocked.
  resetDb();
  seedWorld("w-free");
  grantCredits("u-free", 10); // 2 generations' worth
  let last;
  for (let i = 0; i < FREE_GENS; i++) last = await runMiddleware(enforceGenerationCap, { userId: "u-free", worldId: "w-free" });
  check("free: 10th generation allowed from the free allowance", last.allowed && last.req.generationSource === "free");
  const fc1 = await runMiddleware(enforceGenerationCap, { userId: "u-free", worldId: "w-free" });
  const fc2 = await runMiddleware(enforceGenerationCap, { userId: "u-free", worldId: "w-free" });
  check("free: after 10 free, the next two spend purchased credits",
    fc1.allowed && fc1.req.generationSource === "credit" && fc2.allowed && fc2.req.generationSource === "credit");
  await fc2.req.refundGeneration();
  check("free: refunding a credit spend restores it", db.credit_ledger.reduce((sum, r) => sum + r.amount, 0) === 5);
  await runMiddleware(enforceGenerationCap, { userId: "u-free", worldId: "w-free" });
  last = await runMiddleware(enforceGenerationCap, { userId: "u-free", worldId: "w-free" });
  check("free: then blocked with free_cap_reached + creditBalance 0",
    !last.allowed && last.body.error === "free_cap_reached" && last.body.creditBalance === 0 && /buy credits/.test(last.body.message));
  check("free: no subscriptions row was ever created", db.subscriptions.length === 0);

  // Migration 038 not applied yet: fail safe to the old behavior.
  resetDb();
  seedWorld("w-free-nomig", { generation_count: FREE_MONTHLY_GENERATION_CAP });
  grantCredits("u-free-nomig", 50);
  disabledRpcs.add("check_and_spend_credits");
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const nomig = await runMiddleware(enforceGenerationCap, { userId: "u-free-nomig", worldId: "w-free-nomig" });
    check("free, 038 missing: blocked with free_cap_reached (not a 500), credits untouched",
      !nomig.allowed && nomig.status === 403 && nomig.body.error === "free_cap_reached" && db.credit_ledger.length === 1);
  } finally {
    disabledRpcs.delete("check_and_spend_credits");
    console.warn = origWarn;
  }

  // Lapsed subscriber: free allowance first, then credits, then blocked.
  for (const status of ["canceled", "unpaid", "incomplete_expired", "past_due"]) {
    resetDb();
    seedWorld("w-lapsed");
    seedSubscription("u-lapsed", { status, used_this_cycle: 30 });
    grantCredits("u-lapsed", 10); // 2 generations' worth
    const first = await runMiddleware(enforceGenerationCap, { userId: "u-lapsed", worldId: "w-lapsed" });
    check(`${status}: first generation spends the FREE allowance, not the dead plan`,
      first.allowed && first.req.generationSource === "free" && db.world_config[0].generation_count === 5
      && db.subscriptions[0].used_this_cycle === 30);
    for (let i = 1; i < FREE_GENS; i++) await runMiddleware(enforceGenerationCap, { userId: "u-lapsed", worldId: "w-lapsed" });
    const c1 = await runMiddleware(enforceGenerationCap, { userId: "u-lapsed", worldId: "w-lapsed" });
    const c2 = await runMiddleware(enforceGenerationCap, { userId: "u-lapsed", worldId: "w-lapsed" });
    check(`${status}: after 10 free, the next two spend purchased credits`,
      c1.allowed && c1.req.generationSource === "credit" && c2.allowed && c2.req.generationSource === "credit");
    const blocked = await runMiddleware(enforceGenerationCap, { userId: "u-lapsed", worldId: "w-lapsed" });
    check(`${status}: then blocked with free_cap_reached + creditBalance 0`,
      !blocked.allowed && blocked.body.error === "free_cap_reached" && blocked.body.creditBalance === 0
      && /Resubscribe/.test(blocked.body.message));
  }

  // Lapsed credit refund goes back to the ledger, not the free counter.
  resetDb();
  seedWorld("w-refund", { generation_count: FREE_MONTHLY_GENERATION_CAP });
  seedSubscription("u-refund", { status: "canceled" });
  grantCredits("u-refund", 5);
  const spent = await runMiddleware(enforceGenerationCap, { userId: "u-refund", worldId: "w-refund" });
  await spent.req.refundGeneration();
  const balance = db.credit_ledger.reduce((s, r) => s + r.amount, 0);
  check("lapsed: refund of a credit spend restores the credit", spent.req.generationSource === "credit" && balance === 5);

  // Lapsed field assist with 3 free points left uses free points first.
  resetDb();
  seedWorld("w-fa", { generation_count: FREE_MONTHLY_GENERATION_CAP - 3 });
  seedSubscription("u-fa", { status: "canceled" });
  const fa = await runMiddleware((req, res, next) => enforceGenerationCap(req, res, next, 1), { userId: "u-fa", worldId: "w-fa" });
  check("lapsed: field assist draws leftover free points", fa.allowed && fa.req.generationSource === "free");

  // Active subscriber: unchanged -- quota, never the free counter.
  resetDb();
  seedWorld("w-active");
  seedSubscription("u-active", { status: "active" });
  const active = await runMiddleware(enforceGenerationCap, { userId: "u-active", worldId: "w-active" });
  check("active: spends subscription quota, free counter untouched",
    active.allowed && active.req.generationSource === "quota" && db.subscriptions[0].used_this_cycle === 5
    && db.world_config[0].generation_count === 0);

  // past_due: free tier (Phase 2 follow-up), and a successful retry
  // (status back to active) returns it to the paid quota.
  resetDb();
  seedWorld("w-pd");
  const pdRow = seedSubscription("u-pd", { status: "past_due", used_this_cycle: 100 });
  const pd = await runMiddleware(enforceGenerationCap, { userId: "u-pd", worldId: "w-pd" });
  check("past_due: spends the free allowance", pd.allowed && pd.req.generationSource === "free" && db.world_config[0].generation_count === 5);
  pdRow.status = "active";
  const pdPaid = await runMiddleware(enforceGenerationCap, { userId: "u-pd", worldId: "w-pd" });
  check("past_due -> active: back on paid quota", pdPaid.allowed && pdPaid.req.generationSource === "quota");

  // Images: lapsed gets the free image allowance only.
  resetDb();
  seedWorld("w-img");
  seedSubscription("u-img", { status: "canceled", used_images_this_cycle: 7 });
  grantCredits("u-img", 100);
  const img1 = await runMiddleware(enforceImageGenerationCap, { userId: "u-img", worldId: "w-img" });
  const img2 = await runMiddleware(enforceImageGenerationCap, { userId: "u-img", worldId: "w-img" });
  check("lapsed image: 1 free image allowed", img1.allowed && db.world_config[0].image_generation_count === 1);
  check("lapsed image: 2nd blocked with free_image_cap_reached (no credit fallback)",
    !img2.allowed && img2.body.error === "free_image_cap_reached" && db.credit_ledger.length === 1);

  resetDb();
  seedWorld("w-img-active");
  seedSubscription("u-img-active", { status: "active" });
  const imgActive = await runMiddleware(enforceImageGenerationCap, { userId: "u-img-active", worldId: "w-img-active" });
  check("active image: spends subscription image quota",
    imgActive.allowed && db.subscriptions[0].used_images_this_cycle === 1 && db.world_config[0].image_generation_count === 0);

  // Entry cap: lapsed == free cap + purchased.
  resetDb();
  seedWorld("w-ec", { entries_purchased: 25 });
  seedSubscription("u-ec", { status: "canceled" });
  const ec = await checkEntryCap("w-ec", "u-ec");
  check("entry cap: lapsed gets FREE_ENTRY_CAP + purchased, not unlimited", !ec.unlimited && ec.cap === FREE_ENTRY_CAP + 25);
  resetDb();
  seedWorld("w-ec2");
  seedSubscription("u-ec2", { status: "active" });
  check("entry cap: active stays unlimited", (await checkEntryCap("w-ec2", "u-ec2")).unlimited === true);
}

// ---------- 3. webhook handlers with fixture events ----------

// Simulates migrations/037 not having been run: any subscriptions write
// naming cancel_at_period_end fails the way PostgREST does.
function withMissingCancelColumn(fn) {
  const originalFrom = supabase.from;
  let rejectedWrites = 0;
  supabase.from = function (table) {
    const q = originalFrom.call(this, table);
    if (table !== "subscriptions") return q;
    const flag = (payload) => { if (payload && "cancel_at_period_end" in payload) q._missingColumn = true; };
    const origUpdate = q.update.bind(q);
    const origUpsert = q.upsert.bind(q);
    q.update = (patch) => { flag(patch); return origUpdate(patch); };
    q.upsert = (row, opts) => { flag(row); return origUpsert(row, opts); };
    const origThen = q.then.bind(q);
    q.then = (resolve, reject) => {
      if (q._missingColumn) {
        rejectedWrites++;
        return setImmediate(() => resolve({ data: null, error: { code: "PGRST204", message: "Could not find the 'cancel_at_period_end' column of 'subscriptions' in the schema cache" } }));
      }
      return origThen(resolve, reject);
    };
    return q;
  };
  return fn().finally(() => { supabase.from = originalFrom; }).then(() => rejectedWrites);
}

async function testWebhooks() {
  console.log("\n-- routes/stripeWebhook.js handlers (fixture events, no Stripe) --");
  const origWarn = console.warn;
  console.warn = () => {}; // the missing-column fallback warns by design

  // Audit item 2: updated/deleted handlers re-read the subscription from
  // Stripe. Stub: STRIPE_STATE overrides what "Stripe" currently says;
  // otherwise it echoes the event that was just delivered (event == truth).
  const STRIPE_STATE = {};
  const echoed = new Map();
  const stubRetrieve = async (id) => {
    if (STRIPE_STATE[id] === "throw") throw new Error("Stripe unreachable");
    if (STRIPE_STATE[id]) return STRIPE_STATE[id];
    if (echoed.has(id)) return echoed.get(id);
    throw new Error(`No such subscription: ${id}`);
  };
  stripe.subscriptions.retrieve = stubRetrieve;
  const upd = (o) => { echoed.set(o.id, o); return handlers.handleSubscriptionUpdated(o); };
  const del = (o) => { echoed.set(o.id, o); return handlers.handleSubscriptionDeleted(o); };

  // subscription.updated: portal cancel -> still active, flag + period synced.
  resetDb();
  seedSubscription("u-wh", { stripe_subscription_id: "sub_wh", used_this_cycle: 40 });
  await upd({
    id: "sub_wh", status: "active", cancel_at_period_end: true,
    current_period_start: 1788220800, current_period_end: 1790899200
  });
  let row = db.subscriptions[0];
  check("updated: status stays active, cancel_at_period_end synced",
    row.status === "active" && row.cancel_at_period_end === true);
  check("updated: period synced from event",
    row.current_period_start === "2026-09-01T00:00:00.000Z" && row.current_period_end === "2026-10-02T00:00:00.000Z");
  check("updated: usage counters untouched", row.used_this_cycle === 40);

  // subscription.updated with no period fields must not null them out.
  await upd({ id: "sub_wh", status: "past_due" });
  row = db.subscriptions[0];
  check("updated (no period in payload): status synced, period kept, flag kept",
    row.status === "past_due" && row.current_period_end === "2026-10-02T00:00:00.000Z" && row.cancel_at_period_end === true);

  // Unknown subscription id -> no-op.
  await upd({ id: "sub_unknown", status: "canceled" });
  check("updated: unknown subscription id is a no-op", db.subscriptions.length === 1 && db.subscriptions[0].status === "past_due");

  // subscription.deleted: immediate cancel mid-period -> end clamped to ended_at.
  resetDb();
  seedSubscription("u-del", { stripe_subscription_id: "sub_del", cancel_at_period_end: true });
  await del({
    id: "sub_del", status: "canceled", ended_at: 1789000000, current_period_start: 1788220800, current_period_end: 1790899200
  });
  row = db.subscriptions[0];
  check("deleted: status canceled, cancel flag cleared", row.status === "canceled" && row.cancel_at_period_end === false);
  check("deleted: immediate cancel clamps period end to ended_at", row.current_period_end === new Date(1789000000 * 1000).toISOString());
  check("deleted: tier now lapsed", billingTierFor(row) === "lapsed");

  // subscription.deleted at period end: ended_at == period end.
  resetDb();
  seedSubscription("u-del2", { stripe_subscription_id: "sub_del2" });
  await del({ id: "sub_del2", status: "canceled", ended_at: 1790899200, current_period_end: 1790899200 });
  check("deleted at period end: end date is the period end", db.subscriptions[0].current_period_end === "2026-10-02T00:00:00.000Z");

  // Resubscribe: checkout.session.completed for a lapsed row resets
  // BOTH counters and returns the account to the paid path.
  resetDb();
  seedWorld("w-resub", { generation_count: FREE_MONTHLY_GENERATION_CAP });
  seedSubscription("u-resub", { stripe_subscription_id: "sub_old", status: "canceled", used_this_cycle: 250, used_images_this_cycle: 10, cancel_at_period_end: true });
  db.plans = [{ id: "chronicled_monthly", stripe_price_id: "price_monthly", monthly_quota: 250, monthly_quota_images: 10 }];
  const origRetrieve = stripe.subscriptions.retrieve;
  stripe.subscriptions.retrieve = async (id) => ({
    id, customer: "cus_test", status: "active", cancel_at_period_end: false,
    current_period_start: 1788220800, current_period_end: 1790899200,
    items: { data: [{ price: { id: "price_monthly" } }] }
  });
  try {
    await handlers.handleCheckoutCompleted({ id: "cs_1", mode: "subscription", subscription: "sub_new", customer: "cus_test", client_reference_id: "u-resub" });
    row = db.subscriptions[0];
    check("resubscribe: row now active on the new subscription id",
      db.subscriptions.length === 1 && row.status === "active" && row.stripe_subscription_id === "sub_new");
    check("resubscribe: used_this_cycle AND used_images_this_cycle reset to 0",
      row.used_this_cycle === 0 && row.used_images_this_cycle === 0);
    check("resubscribe: cancel_at_period_end reset to false", row.cancel_at_period_end === false);
    // Keep the fake's quota fields (the real RPC joins them from plans).
    Object.assign(row, { monthly_quota: 250, monthly_quota_images: 10 });
    const after = await runMiddleware(enforceGenerationCap, { userId: "u-resub", worldId: "w-resub" });
    check("resubscribe: next generation spends paid quota again", after.allowed && after.req.generationSource === "quota");

    // A late subscription.deleted for the OLD id must not cancel the new one.
    await del({ id: "sub_old", status: "canceled", ended_at: 1788000000 });
    check("resubscribe: late deleted event for the old sub id is a no-op", db.subscriptions[0].status === "active");

    // Renewal (invoice.payment_succeeded) also resets image usage now.
    db.subscriptions[0].used_images_this_cycle = 9;
    await handlers.handleInvoicePaymentSucceeded({ subscription: "sub_new" });
    check("renewal: used_images_this_cycle reset (was never reset before)", db.subscriptions[0].used_images_this_cycle === 0);
  } finally {
    stripe.subscriptions.retrieve = origRetrieve;
  }

  // Migration 037 not applied: writes retry without the column and land.
  resetDb();
  seedSubscription("u-nocol", { stripe_subscription_id: "sub_nocol" });
  delete db.subscriptions[0].cancel_at_period_end;
  const rejected = await withMissingCancelColumn(() => upd({
    id: "sub_nocol", status: "unpaid", cancel_at_period_end: true, current_period_end: 1790899200
  }));
  row = db.subscriptions[0];
  check("no column: first write rejected, retry without it succeeded",
    rejected === 1 && row.status === "unpaid" && row.current_period_end === "2026-10-02T00:00:00.000Z" && !("cancel_at_period_end" in row));

  resetDb();
  db.plans = [{ id: "chronicled_monthly", stripe_price_id: "price_monthly" }];
  stripe.subscriptions.retrieve = async (id) => ({
    id, customer: "cus_x", status: "active", cancel_at_period_end: false,
    current_period_start: 1788220800, current_period_end: 1790899200, items: { data: [{ price: { id: "price_monthly" } }] }
  });
  try {
    const rejectedUpsert = await withMissingCancelColumn(() => handlers.handleCheckoutCompleted({
      id: "cs_2", mode: "subscription", subscription: "sub_x", customer: "cus_x", client_reference_id: "u-nocol2"
    }));
    check("no column: checkout upsert still creates the subscription",
      rejectedUpsert === 1 && db.subscriptions.length === 1 && db.subscriptions[0].status === "active");
  } finally {
    stripe.subscriptions.retrieve = origRetrieve;
  }

  // ---- audit item 2: out-of-order / stale events ----
  stripe.subscriptions.retrieve = stubRetrieve;
  resetDb();
  seedSubscription("u-ooo", { stripe_subscription_id: "sub_ooo", status: "canceled" });
  STRIPE_STATE.sub_ooo = { id: "sub_ooo", status: "canceled", cancel_at_period_end: false, current_period_end: 1790899200 };
  await upd({ id: "sub_ooo", status: "active", cancel_at_period_end: false, current_period_end: 1790899200 });
  check("out-of-order: a late 'updated: active' after deletion does NOT reactivate (Stripe's current state wins)",
    db.subscriptions[0].status === "canceled");
  STRIPE_STATE.sub_ooo2 = "throw";
  resetDb();
  seedSubscription("u-ooo2", { stripe_subscription_id: "sub_ooo2", status: "active" });
  let threw = false;
  try { await handlers.handleSubscriptionUpdated({ id: "sub_ooo2", status: "past_due" }); } catch (_e) { threw = true; }
  check("updated: Stripe unreachable -> throws (delivery retried), row untouched", threw && db.subscriptions[0].status === "active");
  STRIPE_STATE.sub_ooo3 = "throw";
  resetDb();
  seedSubscription("u-ooo3", { stripe_subscription_id: "sub_ooo3", status: "active" });
  await handlers.handleSubscriptionDeleted({ id: "sub_ooo3", status: "canceled", ended_at: 1789000000 });
  check("deleted: Stripe unreachable -> falls back to the (terminal) event payload", db.subscriptions[0].status === "canceled");

  // ---- audit item 3: only real renewals reset usage ----
  resetDb();
  seedSubscription("u-inv", { stripe_subscription_id: "sub_inv", used_this_cycle: 120, used_images_this_cycle: 4 });
  db.plans = [{ id: "chronicled_monthly", stripe_price_id: "price_monthly", monthly_quota: 250, monthly_quota_images: 10 }];
  STRIPE_STATE.sub_inv = { id: "sub_inv", customer: "cus_test", status: "active", cancel_at_period_end: false, current_period_start: 1788220800, current_period_end: 1790899200, items: { data: [{ price: { id: "price_monthly" } }] } };
  await handlers.handleInvoicePaymentSucceeded({ subscription: "sub_inv", billing_reason: "subscription_update" });
  check("proration/plan-change invoice (subscription_update) does NOT reset usage",
    db.subscriptions[0].used_this_cycle === 120 && db.subscriptions[0].used_images_this_cycle === 4);
  await handlers.handleInvoicePaymentSucceeded({ subscription: "sub_inv", billing_reason: "manual" });
  check("one-off invoice (manual) does NOT reset usage", db.subscriptions[0].used_this_cycle === 120);
  await handlers.handleInvoicePaymentSucceeded({ subscription: "sub_inv", billing_reason: "subscription_cycle" });
  check("renewal invoice (subscription_cycle) resets both counters",
    db.subscriptions[0].used_this_cycle === 0 && db.subscriptions[0].used_images_this_cycle === 0);

  console.warn = origWarn;
}

// ---------- 4. bug batch 1 audit fixes ----------

async function testAuditFixes() {
  console.log("\n-- audit fixes: stale-active safety net, credit remainder, offer, subscribe guard --");
  const now = new Date("2026-09-24T00:00:00Z");
  const staleRow = { status: "active", current_period_end: "2026-09-10T00:00:00Z" };  // 14 days past
  const lateRow = { status: "active", current_period_end: "2026-09-21T00:00:00Z" };   // 3 days past (renewal webhook just delayed)
  check("stale 'active' row (period ended 14 days ago) is treated as lapsed", isStaleActive(staleRow, now) && billingTierFor(staleRow, now) === "lapsed" && !isActiveSubscription(staleRow, now));
  check("recently-ended period (3 days) still counts as subscribed -- grace for a delayed renewal", billingTierFor(lateRow, now) === "subscribed" && isActiveSubscription(lateRow, now));
  check("row without a period end is never considered stale", !isStaleActive({ status: "active" }, now));

  const payload = buildBillingStatusPayload({ tier: "free", subscription: null, config: { generation_count: 0, image_generation_count: 0, free_cycle_reset_at: "2026-09-01T00:00:00Z" }, creditBalancePoints: 13, entryCap: null, aiEnabled: true });
  check("credits: 13 points -> 2 credits + 3 extra field assists (not a silent '2')", payload.creditBalance === 2 && payload.creditExtraFieldAssists === 3);
  const tiny = buildBillingStatusPayload({ tier: "free", subscription: null, config: { free_cycle_reset_at: "2026-09-01T00:00:00Z" }, creditBalancePoints: 4, entryCap: null, aiEnabled: true });
  check("credits: 4 points -> 0 credits but 4 field assists shown", tiny.creditBalance === 0 && tiny.creditExtraFieldAssists === 4);

  check("formatMoney: $4.99, $2 (no .00)", formatMoney(499, "usd") === "$4.99" && formatMoney(200, "usd") === "$2");
  _clearPriceCacheForTests();
  let priceCalls = 0;
  const fakeStripe = { prices: { retrieve: async (id) => {
    priceCalls++;
    if (id === "price_broken") throw new Error("boom");
    return { price_monthly: { unit_amount: 499, currency: "usd", recurring: { interval: "month" } }, price_credit: { unit_amount: 200, currency: "usd" }, price_entry: { unit_amount: 500, currency: "usd" } }[id];
  } } };
  const plan = { name: "Chronicled Subscription", monthly_quota: 250, monthly_quota_images: 10, stripe_price_id: "price_monthly" };
  const offer = await getBillingOffer({ stripe: fakeStripe, plan, pointsPerGeneration: 5, creditPriceId: "price_credit", entryPackPriceId: "price_entry" });
  check("offer: plan quotas from the plans row + price from Stripe",
    offer.subscription.generationsPerMonth === 50 && offer.subscription.imagesPerMonth === 10 && offer.subscription.price === "$4.99" && offer.subscription.interval === "month");
  check("offer: pack sizes + unit prices", offer.creditPack.generationsPerUnit === 5 && offer.creditPack.unitAmount === 200 && offer.entryPack.entriesPerUnit === 25 && offer.entryPack.unitAmount === 500);
  await getBillingOffer({ stripe: fakeStripe, plan, pointsPerGeneration: 5, creditPriceId: "price_credit", entryPackPriceId: "price_entry" });
  check("offer: Stripe prices are cached (no second lookup)", priceCalls === 3);
  const broken = await getBillingOffer({ stripe: fakeStripe, plan: { ...plan, stripe_price_id: "price_broken" }, pointsPerGeneration: 5 });
  check("offer: a failed price lookup leaves price null instead of guessing", broken.subscription.price === null && broken.subscription.generationsPerMonth === 50);

  // Subscribe guard, over HTTP through the real router.
  const express = require("express");
  const billingRouter = require("../routes/billing");
  const app = express();
  app.use(express.json());
  let currentUser = "u-guard";
  app.use("/api", (req, _res, next) => { req.userId = currentUser; req.worldId = "w-guard"; req.userEmail = "dm@example.com"; next(); });
  app.use("/api", billingRouter);
  const server = await new Promise((resolve) => { const srv = app.listen(0, () => resolve(srv)); });
  const port = server.address().port;
  const subscribe = async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/billing/checkout/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return { status: res.status, body: await res.json() };
  };
  const origRetrieve = stripe.subscriptions.retrieve;
  const origCreate = stripe.checkout.sessions.create;
  let checkoutsCreated = 0;
  stripe.checkout.sessions.create = async () => { checkoutsCreated++; return { url: "https://checkout.test/session" }; };
  const live = {};
  stripe.subscriptions.retrieve = async (id) => { if (live[id] === "throw") throw new Error("down"); return live[id]; };
  const origErr = console.error;
  console.error = () => {};
  try {
    resetDb();
    db.plans = [{ id: "chronicled_monthly", name: "Chronicled Subscription", stripe_price_id: "price_monthly", monthly_quota: 250, monthly_quota_images: 10 }];
    seedSubscription("u-guard", { stripe_subscription_id: "sub_live", status: "active" });
    live.sub_live = { id: "sub_live", status: "active", cancel_at_period_end: false };
    let r = await subscribe();
    check("guard: active subscription -> 409 already_subscribed, no checkout created", r.status === 409 && r.body.error === "already_subscribed" && r.body.openPortal === true && checkoutsCreated === 0);
    live.sub_live = { id: "sub_live", status: "active", cancel_at_period_end: true };
    r = await subscribe();
    check("guard: set-to-cancel subscription -> 409 pointing at 'resume'", r.status === 409 && /resume/i.test(r.body.message));
    db.subscriptions[0].status = "past_due";
    live.sub_live = { id: "sub_live", status: "past_due", cancel_at_period_end: false };
    r = await subscribe();
    check("guard: past_due (still billing in Stripe) -> 409 'update your card'", r.status === 409 && /card/i.test(r.body.message));
    // Row says active, but Stripe says it's long canceled (missed webhook).
    db.subscriptions[0].status = "active";
    live.sub_live = { id: "sub_live", status: "canceled", current_period_end: 1790899200 };
    r = await subscribe();
    check("guard: Stripe reports canceled -> row self-heals to canceled and checkout proceeds",
      r.status === 200 && r.body.url && checkoutsCreated === 1 && db.subscriptions[0].status === "canceled");
    r = await subscribe();
    check("guard: an already-canceled row skips the Stripe check and proceeds", r.status === 200 && checkoutsCreated === 2);
    db.subscriptions[0].status = "active";
    live.sub_live = "throw";
    r = await subscribe();
    check("guard: Stripe unreachable -> 503, never a blind second checkout", r.status === 503 && checkoutsCreated === 2);
    currentUser = "u-guard-new";
    r = await subscribe();
    check("guard: an account with no subscription subscribes normally", r.status === 200 && checkoutsCreated === 3);

    // /billing/status end to end (it caught a missing import once): the
    // free payload plus the Stripe-priced offer.
    _clearPriceCacheForTests();
    const origPrices = stripe.prices.retrieve;
    stripe.prices.retrieve = async () => ({ unit_amount: 499, currency: "usd", recurring: { interval: "month" } });
    seedWorld("w-guard");
    const st = await fetch(`http://127.0.0.1:${port}/api/billing/status`).then((x) => x.json());
    stripe.prices.retrieve = origPrices;
    check("/billing/status: 200 free payload with offer (plan quotas + Stripe price)",
      st.state === "free" && st.offer && st.offer.subscription.generationsPerMonth === 50 && st.offer.subscription.price === "$4.99", st);
  } finally {
    console.error = origErr;
    stripe.subscriptions.retrieve = origRetrieve;
    stripe.checkout.sessions.create = origCreate;
    server.close();
  }
}

(async () => {
  console.log("== Billing tier test (fakeSupabase, BILLING_ENABLED=true) ==");
  try {
    testPure();
    await testMiddleware();
    await testWebhooks();
    await testAuditFixes();
  } catch (err) {
    console.error("\nUnexpected error:", err);
    failures.push(`threw: ${err.message}`);
  }
  if (failures.length) {
    console.log(`\nRESULT: ${failures.length} check(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("\nRESULT: all checks passed.");
  process.exit(0);
})();
