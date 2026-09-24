// scripts/testFreeTierAllowance.js
//
// Bug batch 1, Phase 2 (session_addendum_bug_batch_1.md): proves the
// recurring monthly free allowance (migrations/029) actually works
// against REAL Supabase -- the reset_free_cycle_if_elapsed RPC's
// `interval '1 month'` arithmetic and the FOR UPDATE-locked counters are
// the part no in-memory fake can vouch for. Also walks a lapsed
// subscriber through the free -> credits fallback and a resubscribe.
//
// Calls the middleware/RPC layer and the real /billing/status route only
// -- never a generator, so no Claude/Gemini call is ever made. No Stripe
// call either (STRIPE_SECRET_KEY is only needed so lib/stripeClient.js
// loads; the billing routes exercised here never reach Stripe).
//
// Needs SUPABASE_URL/SUPABASE_SECRET_KEY. Creates a disposable throwaway
// user + world and deletes both, plus every subscriptions/credit_ledger
// row it wrote for that user, in a finally block -- same pattern as
// scripts/testTenantIsolation.js. Never touches any other user's rows.
//
// Usage: node scripts/testFreeTierAllowance.js

process.env.BILLING_ENABLED = "true";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_not_real";

const express = require("express");
const { supabase } = require("../lib/supabaseClient");
const { getOrCreateWorldId } = require("../middleware/resolveTenant");
const { enforceGenerationCap, enforceImageGenerationCap } = require("../middleware/enforceGenerationCap");
const { FREE_MONTHLY_GENERATION_CAP, FREE_MONTHLY_IMAGE_CAP, POINTS_PER_GENERATION } = require("../lib/worldConfigRepo");
const { upsertSubscription } = require("../lib/billingRepo");
const { addOneMonthLikePostgres } = require("../lib/billingTier");
const billingRouter = require("../routes/billing");

const FREE_GENS = FREE_MONTHLY_GENERATION_CAP / POINTS_PER_GENERATION;
const DAY_MS = 24 * 60 * 60 * 1000;

const failures = [];
function check(label, condition, detail) {
  console.log(`  ${condition ? "PASS" : "FAIL"} - ${label}${!condition && detail !== undefined ? `  (${JSON.stringify(detail)})` : ""}`);
  if (!condition) failures.push(label);
}

function runMiddleware(mw, ids) {
  return new Promise((resolve) => {
    const req = { ...ids };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ allowed: false, status: this.statusCode, body, req }); return this; }
    };
    mw(req, res, (err) => resolve({ allowed: !err, body: err ? { error: err.message } : null, req }));
  });
}

async function readConfig(worldId) {
  const { data, error } = await supabase.from("world_config")
    .select("generation_count, image_generation_count, free_cycle_reset_at").eq("world_id", worldId).single();
  if (error) throw new Error(`read world_config failed: ${error.message}`);
  return data;
}

async function setResetAt(worldId, date) {
  const { error } = await supabase.from("world_config").update({ free_cycle_reset_at: date.toISOString() }).eq("world_id", worldId);
  if (error) throw new Error(`set free_cycle_reset_at failed: ${error.message}`);
}

async function setCounters(worldId, generationCount, imageCount) {
  const { error } = await supabase.from("world_config")
    .update({ generation_count: generationCount, image_generation_count: imageCount }).eq("world_id", worldId);
  if (error) throw new Error(`set counters failed: ${error.message}`);
}

async function getStatus(port) {
  const res = await fetch(`http://127.0.0.1:${port}/api/billing/status`);
  return res.json();
}

const sameInstant = (a, b) => a && b && new Date(a).getTime() === new Date(b).getTime();

async function main() {
  console.log("== Free-tier allowance test (LIVE Supabase, BILLING_ENABLED=true) ==\n");
  let userId, worldId, server;
  try {
    const email = `free-tier-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@worldforge.test`;
    const { data, error } = await supabase.auth.admin.createUser({ email, password: "throwaway-test-password-1", email_confirm: true });
    if (error) throw new Error(`Failed to create test user: ${error.message}`);
    userId = data.user.id;
    worldId = await getOrCreateWorldId(userId);
    const ids = { userId, worldId };

    const app = express();
    app.use(express.json());
    app.use("/api", (req, res, next) => { req.userId = userId; req.worldId = worldId; next(); });
    app.use("/api", billingRouter);
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const port = server.address().port;

    // ---- (5a) status before any spend ----
    console.log("-- fresh free world --");
    let status = await getStatus(port);
    let cfg = await readConfig(worldId);
    check("status: state free, 10 of 10 generations + 1 of 1 image",
      status.state === "free" && status.freeRemaining === FREE_GENS && status.freeCap === FREE_GENS
      && status.freeImageRemaining === FREE_MONTHLY_IMAGE_CAP, status);
    check("status: nextResetAt = free_cycle_reset_at + 1 month (Postgres semantics)",
      sameInstant(status.nextResetAt, addOneMonthLikePostgres(cfg.free_cycle_reset_at)), { nextResetAt: status.nextResetAt, resetAt: cfg.free_cycle_reset_at });
    const untilReset = new Date(status.nextResetAt).getTime() - Date.now();
    check("status: nextResetAt is 28-31 days out", untilReset > 27 * DAY_MS && untilReset <= 31 * DAY_MS, untilReset / DAY_MS);

    // ---- (1) exactly 10 generations, then free_cap_reached ----
    let allowedCount = 0;
    let last;
    for (let i = 0; i < FREE_GENS + 1; i++) {
      last = await runMiddleware(enforceGenerationCap, ids);
      if (last.allowed) allowedCount++;
    }
    check(`exactly ${FREE_GENS} generations allowed`, allowedCount === FREE_GENS, allowedCount);
    check("11th blocked with free_cap_reached", !last.allowed && last.body.error === "free_cap_reached", last.body);
    cfg = await readConfig(worldId);
    check("generation_count sits at the cap", cfg.generation_count === FREE_MONTHLY_GENERATION_CAP, cfg);

    // ---- (2) 1 image, then free_image_cap_reached ----
    const img1 = await runMiddleware(enforceImageGenerationCap, ids);
    const img2 = await runMiddleware(enforceImageGenerationCap, ids);
    check("1 image allowed", img1.allowed);
    check("2nd image blocked with free_image_cap_reached", !img2.allowed && img2.body.error === "free_image_cap_reached", img2.body);

    status = await getStatus(port);
    check("status after spend: 0 generations / 0 images remaining",
      status.freeRemaining === 0 && status.freeImageRemaining === 0 && status.freeUsed === FREE_GENS, status);

    // ---- (4) cycle under a month old: no reset ----
    console.log("\n-- cycle under a month old --");
    const underMonth = new Date(Date.now() - 27 * DAY_MS);
    await setResetAt(worldId, underMonth);
    const stillBlocked = await runMiddleware(enforceGenerationCap, ids);
    const stillBlockedImg = await runMiddleware(enforceImageGenerationCap, ids);
    cfg = await readConfig(worldId);
    check("27-day-old cycle: generation still blocked", !stillBlocked.allowed && stillBlocked.body.error === "free_cap_reached");
    check("27-day-old cycle: image still blocked", !stillBlockedImg.allowed && stillBlockedImg.body.error === "free_image_cap_reached");
    check("27-day-old cycle: counters and reset_at untouched",
      cfg.generation_count === FREE_MONTHLY_GENERATION_CAP && cfg.image_generation_count === FREE_MONTHLY_IMAGE_CAP
      && sameInstant(cfg.free_cycle_reset_at, underMonth), cfg);
    status = await getStatus(port);
    check("status (27 days in): still 0 remaining, nextResetAt = that reset_at + 1 month",
      status.freeRemaining === 0 && sameInstant(status.nextResetAt, addOneMonthLikePostgres(underMonth)), status);

    // ---- (3) cycle over a month old: next request resets both ----
    console.log("\n-- cycle over a month old --");
    await setResetAt(worldId, new Date(Date.now() - 32 * DAY_MS));
    const before = Date.now();
    const afterReset = await runMiddleware(enforceGenerationCap, ids);
    cfg = await readConfig(worldId);
    check("32-day-old cycle: next generation allowed", afterReset.allowed, afterReset.body);
    check("reset zeroed BOTH counters (generation now 1 spend, image 0)",
      cfg.generation_count === POINTS_PER_GENERATION && cfg.image_generation_count === 0, cfg);
    check("free_cycle_reset_at moved to ~now", new Date(cfg.free_cycle_reset_at).getTime() >= before - 60 * 1000, cfg.free_cycle_reset_at);
    const imgAfterReset = await runMiddleware(enforceImageGenerationCap, ids);
    check("image allowed again after reset", imgAfterReset.allowed);

    // ---- (5b) status after the reset ----
    status = await getStatus(port);
    check("status after reset: 9 of 10 generations, 0 of 1 image",
      status.freeRemaining === FREE_GENS - 1 && status.freeImageRemaining === 0, status);
    check("status after reset: nextResetAt = new reset_at + 1 month",
      sameInstant(status.nextResetAt, addOneMonthLikePostgres(cfg.free_cycle_reset_at)), { nextResetAt: status.nextResetAt, resetAt: cfg.free_cycle_reset_at });

    // ---- free account + purchased credits (migrations/038) ----
    console.log("\n-- free account with purchased credits --");
    // Probe with an amount nobody can afford: no side effects if the
    // function exists, PGRST202 if migration 038 hasn't been run yet.
    const probe = await supabase.rpc("check_and_spend_credits", { p_user_id: userId, p_amount: 1e9 });
    const has038 = !probe.error;
    const { error: freeCreditErr } = await supabase.from("credit_ledger").insert({ user_id: userId, amount: POINTS_PER_GENERATION, reason: "purchase" });
    if (freeCreditErr) throw new Error(`insert test credits failed: ${freeCreditErr.message}`);
    await setCounters(worldId, FREE_MONTHLY_GENERATION_CAP, FREE_MONTHLY_IMAGE_CAP);
    const origWarn = console.warn;
    console.warn = () => {};
    const freeCredit = await runMiddleware(enforceGenerationCap, ids);
    const freeAfterCredit = await runMiddleware(enforceGenerationCap, ids);
    console.warn = origWarn;
    if (has038) {
      check("free + credits: generation past the cap spends a purchased credit",
        freeCredit.allowed && freeCredit.req.generationSource === "credit", freeCredit.body);
      check("free + credits: then blocked with creditBalance 0",
        !freeAfterCredit.allowed && freeAfterCredit.body.error === "free_cap_reached" && freeAfterCredit.body.creditBalance === 0, freeAfterCredit.body);
      await freeCredit.req.refundGeneration();
    } else {
      console.log("  NOTE - migrations/038 not applied yet: checking the fail-safe path instead");
      check("free + credits, 038 missing: blocked cleanly (403 free_cap_reached, not a 500)",
        !freeCredit.allowed && freeCredit.status === 403 && freeCredit.body.error === "free_cap_reached", freeCredit.body);
    }
    // Leave the ledger at exactly 0 for the lapsed section below.
    await supabase.from("credit_ledger").delete().eq("user_id", userId);

    // ---- lapsed subscriber: free -> credits, immediate reset, resubscribe ----
    console.log("\n-- lapsed subscriber (disposable subscriptions/credit_ledger rows) --");
    const periodEnd = new Date(Date.now() - 10 * DAY_MS);
    const { error: subErr } = await supabase.from("subscriptions").insert({
      user_id: userId, plan_id: "chronicled_monthly", stripe_customer_id: "cus_test_free_tier",
      stripe_subscription_id: `sub_test_${userId}`, status: "canceled",
      current_period_start: new Date(periodEnd.getTime() - 30 * DAY_MS).toISOString(),
      current_period_end: periodEnd.toISOString(), used_this_cycle: 30, used_images_this_cycle: 10
    });
    if (subErr) throw new Error(`insert test subscription failed: ${subErr.message}`);
    const { error: creditErr } = await supabase.from("credit_ledger").insert({ user_id: userId, amount: 2 * POINTS_PER_GENERATION, reason: "purchase" });
    if (creditErr) throw new Error(`insert test credits failed: ${creditErr.message}`);

    // Old free cycle (never reset while "subscribed") -> first fallback
    // request resets and spends a fresh free allowance.
    await setCounters(worldId, FREE_MONTHLY_GENERATION_CAP, FREE_MONTHLY_IMAGE_CAP);
    await setResetAt(worldId, new Date(Date.now() - 90 * DAY_MS));
    const lapsedFirst = await runMiddleware(enforceGenerationCap, ids);
    cfg = await readConfig(worldId);
    check("lapsed: stale cycle resets on first fallback request (fresh allowance)",
      lapsedFirst.allowed && lapsedFirst.req.generationSource === "free" && cfg.generation_count === POINTS_PER_GENERATION, { src: lapsedFirst.req.generationSource, cfg });

    status = await getStatus(port);
    check("lapsed status: state lapsed, free numbers, endedAt, 2 credits, no dead-plan fields",
      status.state === "lapsed" && status.status === "canceled" && status.freeRemaining === FREE_GENS - 1
      && sameInstant(status.endedAt, periodEnd) && status.creditBalance === 2
      && !("remainingThisCycle" in status) && !("currentPeriodEnd" in status), status);
    check("lapsed status: entry cap is capped, not unlimited", status.entryCap && status.entryCap.unlimited === false, status.entryCap);

    const lapsedImg = await runMiddleware(enforceImageGenerationCap, ids);
    const lapsedImg2 = await runMiddleware(enforceImageGenerationCap, ids);
    check("lapsed: 1 free image, then free_image_cap_reached (no credit fallback)",
      lapsedImg.allowed && !lapsedImg2.allowed && lapsedImg2.body.error === "free_image_cap_reached");

    for (let i = 1; i < FREE_GENS; i++) await runMiddleware(enforceGenerationCap, ids);
    const credit1 = await runMiddleware(enforceGenerationCap, ids);
    const credit2 = await runMiddleware(enforceGenerationCap, ids);
    const lapsedBlocked = await runMiddleware(enforceGenerationCap, ids);
    check("lapsed: after the free allowance, 2 generations spend purchased credits",
      credit1.allowed && credit1.req.generationSource === "credit" && credit2.allowed && credit2.req.generationSource === "credit");
    check("lapsed: then blocked with free_cap_reached, creditBalance 0",
      !lapsedBlocked.allowed && lapsedBlocked.body.error === "free_cap_reached" && lapsedBlocked.body.creditBalance === 0, lapsedBlocked.body);
    await credit2.req.refundGeneration();
    const { data: balance } = await supabase.rpc("get_credit_balance", { p_user_id: userId });
    check("lapsed: refunding a credit spend puts it back in the ledger", balance === POINTS_PER_GENERATION, balance);

    // Resubscribe -> paid path, both counters reset.
    await upsertSubscription({
      userId, planId: "chronicled_monthly", stripeCustomerId: "cus_test_free_tier",
      stripeSubscriptionId: `sub_test2_${userId}`, status: "active",
      currentPeriodStart: new Date().toISOString(), currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      cancelAtPeriodEnd: false, resetUsage: true
    });
    const paid = await runMiddleware(enforceGenerationCap, ids);
    const paidImg = await runMiddleware(enforceImageGenerationCap, ids);
    check("resubscribed: generation spends paid quota", paid.allowed && paid.req.generationSource === "quota", paid.req.generationSource);
    check("resubscribed: image quota reset (was 10 of 10 used before canceling)", paidImg.allowed);
    status = await getStatus(port);
    check("resubscribed status: state subscribed, 49 of 50, unlimited entries",
      status.state === "subscribed" && status.remainingThisCycle === 49 && status.remainingImagesThisCycle === 9
      && status.entryCap.unlimited === true, status);
  } finally {
    if (server) server.close();
    // Only ever this test's own disposable user/world, by exact id.
    if (userId) {
      await supabase.from("credit_ledger").delete().eq("user_id", userId);
      await supabase.from("subscriptions").delete().eq("user_id", userId);
    }
    if (worldId) {
      await supabase.from("world_config").delete().eq("world_id", worldId);
      await supabase.from("worlds").delete().eq("id", worldId);
    }
    if (userId) {
      await supabase.from("user_settings").delete().eq("user_id", userId);
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) console.warn(`  Warning: failed to delete test user ${userId}: ${error.message}`);
    }
  }

  if (failures.length) {
    console.log(`\nRESULT: ${failures.length} check(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("\nRESULT: all checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nTest crashed:", err);
  process.exit(1);
});
