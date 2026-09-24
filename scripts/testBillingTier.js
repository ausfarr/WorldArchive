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
const { db } = fake;

const {
  billingTierFor, isActiveSubscription, addOneMonthLikePostgres,
  buildBillingStatusPayload, stripePeriodFields
} = require("../lib/billingTier");
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
    status: "active", current_period_start: "2026-08-01T00:00:00.000Z", current_period_end: "2026-09-01T00:00:00.000Z",
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
  check("past_due stays subscribed (unchanged by decision)", billingTierFor({ status: "past_due" }) === "subscribed");
  for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
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

  // Free account: 10 gens then blocked; credits NOT spendable (known,
  // deferred gap -- asserted so a future fix has to update this test).
  resetDb();
  seedWorld("w-free");
  grantCredits("u-free", 50);
  let last;
  for (let i = 0; i < FREE_GENS; i++) last = await runMiddleware(enforceGenerationCap, { userId: "u-free", worldId: "w-free" });
  check("free: 10th generation allowed from the free allowance", last.allowed && last.req.generationSource === "free");
  last = await runMiddleware(enforceGenerationCap, { userId: "u-free", worldId: "w-free" });
  check("free: 11th blocked with free_cap_reached", !last.allowed && last.body.error === "free_cap_reached");
  check("free: purchased credits untouched (deferred gap, Phase 5)", db.credit_ledger.length === 1);

  // Lapsed subscriber: free allowance first, then credits, then blocked.
  for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
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

  // past_due: unchanged (subscription path, quota paused, credits only).
  resetDb();
  seedWorld("w-pd");
  seedSubscription("u-pd", { status: "past_due" });
  const pd = await runMiddleware(enforceGenerationCap, { userId: "u-pd", worldId: "w-pd" });
  check("past_due: unchanged -- blocked with generation_limit_reached when no credits",
    !pd.allowed && pd.body.error === "generation_limit_reached" && db.world_config[0].generation_count === 0);

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

  // subscription.updated: portal cancel -> still active, flag + period synced.
  resetDb();
  seedSubscription("u-wh", { stripe_subscription_id: "sub_wh", used_this_cycle: 40 });
  await handlers.handleSubscriptionUpdated({
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
  await handlers.handleSubscriptionUpdated({ id: "sub_wh", status: "past_due" });
  row = db.subscriptions[0];
  check("updated (no period in payload): status synced, period kept, flag kept",
    row.status === "past_due" && row.current_period_end === "2026-10-02T00:00:00.000Z" && row.cancel_at_period_end === true);

  // Unknown subscription id -> no-op.
  await handlers.handleSubscriptionUpdated({ id: "sub_unknown", status: "canceled" });
  check("updated: unknown subscription id is a no-op", db.subscriptions.length === 1 && db.subscriptions[0].status === "past_due");

  // subscription.deleted: immediate cancel mid-period -> end clamped to ended_at.
  resetDb();
  seedSubscription("u-del", { stripe_subscription_id: "sub_del", cancel_at_period_end: true });
  await handlers.handleSubscriptionDeleted({
    id: "sub_del", status: "canceled", ended_at: 1789000000, current_period_start: 1788220800, current_period_end: 1790899200
  });
  row = db.subscriptions[0];
  check("deleted: status canceled, cancel flag cleared", row.status === "canceled" && row.cancel_at_period_end === false);
  check("deleted: immediate cancel clamps period end to ended_at", row.current_period_end === new Date(1789000000 * 1000).toISOString());
  check("deleted: tier now lapsed", billingTierFor(row) === "lapsed");

  // subscription.deleted at period end: ended_at == period end.
  resetDb();
  seedSubscription("u-del2", { stripe_subscription_id: "sub_del2" });
  await handlers.handleSubscriptionDeleted({ id: "sub_del2", status: "canceled", ended_at: 1790899200, current_period_end: 1790899200 });
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
    await handlers.handleSubscriptionDeleted({ id: "sub_old", status: "canceled", ended_at: 1788000000 });
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
  const rejected = await withMissingCancelColumn(() => handlers.handleSubscriptionUpdated({
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

  console.warn = origWarn;
}

(async () => {
  console.log("== Billing tier test (fakeSupabase, BILLING_ENABLED=true) ==");
  try {
    testPure();
    await testMiddleware();
    await testWebhooks();
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
