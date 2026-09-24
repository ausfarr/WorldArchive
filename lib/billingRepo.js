// lib/billingRepo.js
//
// Data access layer for Phase 5 billing -- plans, subscriptions,
// credit_ledger. See migrations/012_billing.sql for schema and
// session_addendum_phase5_billing_scope.md for the decision record.
//
// Keyed by user_id throughout (not world_id) -- billing is an account-
// level concept that should survive a future multi-world feature or a
// "Delete World" action, neither of which should touch a subscription.

const { supabase } = require("./supabaseClient");

// Single plan at launch, id must match the row inserted by
// migrations/012_billing.sql.
const DEFAULT_PLAN_ID = "chronicled_monthly";

async function getPlan(planId) {
  const { data, error } = await supabase.from("plans").select("*").eq("id", planId).single();
  if (error) throw new Error(`getPlan(${planId}) failed: ${error.message}`);
  return data;
}

async function getPlanByStripePriceId(priceId) {
  const { data, error } = await supabase.from("plans").select("*").eq("stripe_price_id", priceId).maybeSingle();
  if (error) throw new Error(`getPlanByStripePriceId failed: ${error.message}`);
  return data;
}

// Returns null if the user has no subscriptions row at all -- that IS
// "on trial" as far as callers should treat it. A row existing with
// status 'past_due' or 'canceled' is a real subscription record, just
// not currently granting monthly-quota access (see the RPC in
// migrations/012_billing.sql).
async function getSubscription(userId) {
  const { data, error } = await supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`getSubscription failed: ${error.message}`);
  return data;
}

// Sums server-side via the get_credit_balance RPC (migrations/019)
// instead of fetching every credit_ledger row (every purchase AND every
// generation spend row -- append-only, never pruned) and reducing in JS
// -- that grows unbounded over a long-lived paid account for no reason,
// when Postgres can do the same SUM in one aggregate round trip.
async function getCreditBalance(userId) {
  const { data, error } = await supabase.rpc("get_credit_balance", { p_user_id: userId });
  if (error) throw new Error(`getCreditBalance failed: ${error.message}`);
  return data || 0;
}

// Atomic quota-then-credit spend for one generation (or, since v0.9
// Piece 2, one field assist). Callers MUST stop before any Claude/Gemini
// call if `allowed` comes back false -- same contract as
// checkAndIncrementGenerationCount in worldConfigRepo.js.
//
// `amount` is in points -- pass POINTS_PER_GENERATION (5) for a full
// generation or POINTS_PER_FIELD_ASSIST (1) for a field assist, both
// exported from worldConfigRepo.js (kept there since that's already
// where the parallel legacy-cap constants live, rather than duplicating
// them in this file too).
async function spendSubscriptionGeneration(userId, amount = 5) {
  const { data, error } = await supabase.rpc("check_and_spend_subscription_generation", { p_user_id: userId, p_amount: amount });
  if (error) throw new Error(`spendSubscriptionGeneration failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row.allowed, usedThisCycle: row.used_this_cycle, creditBalance: row.credit_balance, source: row.source };
}

// Reverses spendSubscriptionGeneration when the downstream Claude/Gemini
// call fails after points were already deducted. `source` must be
// whichever spendSubscriptionGeneration originally reported ('quota' or
// 'credit') -- see migrations/018_generation_refund.sql for why each
// refunds differently (decrement used_this_cycle vs. a positive
// credit_ledger row, since that ledger is append-only).
async function refundSubscriptionGeneration(userId, amount, source) {
  const { error } = await supabase.rpc("refund_subscription_generation", { p_user_id: userId, p_amount: amount, p_source: source });
  if (error) throw new Error(`refundSubscriptionGeneration failed: ${error.message}`);
}

// Credits-only spend for a FREE account (no subscriptions row) whose
// monthly free allowance is used up -- migrations/038. Same atomic
// check-then-insert as the subscription RPC's credit branch, serialized
// per user by an advisory lock since there's no subscriptions row to
// lock. Refund with refundSubscriptionGeneration(userId, amount, 'credit')
// -- that branch only writes credit_ledger and works without a
// subscriptions row.
//
// Fails safe until migration 038 has been run by hand: PostgREST answers
// PGRST202 ("could not find the function") and this returns
// { allowed: false, unavailable: true } -- exactly the pre-fix behavior
// (free accounts couldn't spend credits) instead of a 500 on every
// generation attempt past the free cap.
let warnedMissingSpendCredits = false;

async function spendCredits(userId, amount) {
  const { data, error } = await supabase.rpc("check_and_spend_credits", { p_user_id: userId, p_amount: amount });
  if (error) {
    const msg = error.message || "";
    if (error.code === "PGRST202" || (/check_and_spend_credits/.test(msg) && /could not find|does not exist/i.test(msg))) {
      // Once per process -- every capped free request lands here until
      // the migration is run, and one line says everything.
      if (!warnedMissingSpendCredits) {
        warnedMissingSpendCredits = true;
        console.warn("spendCredits: check_and_spend_credits is missing (migrations/038 not applied yet) -- free-account credits not spendable.");
      }
      return { allowed: false, unavailable: true, creditBalance: null };
    }
    throw new Error(`spendCredits failed: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row.allowed, creditBalance: row.credit_balance };
}

// Image-quota counterpart to spendSubscriptionGeneration/
// refundSubscriptionGeneration -- see
// migrations/029_split_generation_quotas.sql. No credit_ledger fallback:
// unlike text generations, image spend never falls back to purchased
// credits (that product is text-only today), so there's no `source` to
// track or pass back to a refund call.
async function spendSubscriptionImageGeneration(userId, amount = 1) {
  const { data, error } = await supabase.rpc("check_and_spend_subscription_image_generation", { p_user_id: userId, p_amount: amount });
  if (error) throw new Error(`spendSubscriptionImageGeneration failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row.allowed, usedImagesThisCycle: row.used_images_this_cycle };
}

async function refundSubscriptionImageGeneration(userId, amount) {
  const { error } = await supabase.rpc("refund_subscription_image_generation", { p_user_id: userId, p_amount: amount });
  if (error) throw new Error(`refundSubscriptionImageGeneration failed: ${error.message}`);
}

// cancel_at_period_end arrives with migrations/037 (bug batch 1, Phase
// 2). Until that migration has been run by hand, PostgREST rejects any
// write naming the column (PGRST204 "could not find the column", or
// Postgres 42703 "column does not exist"). Webhook writes must never fail
// on that alone -- a failed customer.subscription.updated would also drop
// the status/period sync riding in the same write -- so the write is
// retried once without the column and a warning logged. Reads need no
// guard: select("*") simply omits an absent column, which every reader
// treats as false.
const OPTIONAL_SUBSCRIPTION_COLUMNS = ["cancel_at_period_end"];

function isMissingOptionalColumnError(error) {
  if (!error) return false;
  const text = `${error.message || ""} ${error.details || ""}`;
  return (error.code === "PGRST204" || error.code === "42703")
    && OPTIONAL_SUBSCRIPTION_COLUMNS.some((col) => text.includes(col));
}

function withoutOptionalColumns(row) {
  const copy = { ...row };
  for (const col of OPTIONAL_SUBSCRIPTION_COLUMNS) delete copy[col];
  return copy;
}

// Runs `write(row)` and, if it failed only because an optional column
// doesn't exist yet, runs it again without those columns.
async function writeWithOptionalColumns(row, write, label) {
  let result = await write(row);
  if (isMissingOptionalColumnError(result.error)) {
    console.warn(`${label}: subscriptions.cancel_at_period_end is missing (migrations/037 not applied yet) -- writing without it.`);
    result = await write(withoutOptionalColumns(row));
  }
  return result;
}

// Upsert called from the Stripe webhook on checkout.session.completed
// (subscription mode) and invoice.payment_succeeded -- both pass the full
// current state from Stripe rather than a partial patch, since Stripe's
// webhook payloads are the source of truth and this avoids any drift
// between what we think a field is and what Stripe actually has.
//
// resetUsage zeroes BOTH per-cycle counters. It used to reset only
// used_this_cycle; used_images_this_cycle (added by migrations/029) was
// never reset by anything, so a subscriber's 10 images/month were really
// 10 images ever, and a resubscriber came back with whatever images they
// had used before canceling. cancelAtPeriodEnd is optional -- omitted
// (undefined) leaves the stored value alone.
async function upsertSubscription({ userId, planId, stripeCustomerId, stripeSubscriptionId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, resetUsage }) {
  const existing = await getSubscription(userId);
  const usedThisCycle = resetUsage ? 0 : (existing ? existing.used_this_cycle : 0);
  const usedImagesThisCycle = resetUsage ? 0 : (existing ? (existing.used_images_this_cycle || 0) : 0);

  const row = {
    user_id: userId,
    plan_id: planId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    status,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    used_this_cycle: usedThisCycle,
    used_images_this_cycle: usedImagesThisCycle,
    updated_at: new Date().toISOString()
  };
  if (typeof cancelAtPeriodEnd === "boolean") row.cancel_at_period_end = cancelAtPeriodEnd;

  const { data, error } = await writeWithOptionalColumns(
    row,
    (r) => supabase.from("subscriptions").upsert(r, { onConflict: "user_id" }).select("*").single(),
    "upsertSubscription"
  );

  if (error) throw new Error(`upsertSubscription failed: ${error.message}`);
  return data;
}

async function setSubscriptionStatus(stripeSubscriptionId, status) {
  const { error } = await supabase
    .from("subscriptions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) throw new Error(`setSubscriptionStatus failed: ${error.message}`);
}

// Partial sync for customer.subscription.updated/deleted: status plus the
// period fields and cancel_at_period_end, each written only when the
// caller actually has a value (a missing Stripe field never overwrites a
// good stored one with null). Deliberately does NOT touch the usage
// counters -- only invoice.payment_succeeded (a real renewal) or a new
// checkout resets those, via upsertSubscription(resetUsage).
async function syncSubscriptionFromStripe(stripeSubscriptionId, { status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd }) {
  const patch = { updated_at: new Date().toISOString() };
  if (status) patch.status = status;
  if (currentPeriodStart) patch.current_period_start = currentPeriodStart;
  if (currentPeriodEnd) patch.current_period_end = currentPeriodEnd;
  if (typeof cancelAtPeriodEnd === "boolean") patch.cancel_at_period_end = cancelAtPeriodEnd;

  const { error } = await writeWithOptionalColumns(
    patch,
    (p) => supabase.from("subscriptions").update(p).eq("stripe_subscription_id", stripeSubscriptionId),
    "syncSubscriptionFromStripe"
  );
  if (error) throw new Error(`syncSubscriptionFromStripe failed: ${error.message}`);
}

async function getSubscriptionByStripeId(stripeSubscriptionId) {
  const { data, error } = await supabase.from("subscriptions").select("*").eq("stripe_subscription_id", stripeSubscriptionId).maybeSingle();
  if (error) throw new Error(`getSubscriptionByStripeId failed: ${error.message}`);
  return data;
}

// Called from the webhook on a credit-pack checkout.session.completed
// (payment mode). amount is always positive here -- generation spends
// (negative rows) only ever come from the RPC in migrations/012_billing.sql.
async function addCredits({ userId, amount, stripePaymentIntentId }) {
  const { error } = await supabase.from("credit_ledger").insert({
    user_id: userId,
    amount,
    reason: "purchase",
    stripe_payment_intent_id: stripePaymentIntentId
  });
  if (error) throw new Error(`addCredits failed: ${error.message}`);
}

// Idempotency guard for routes/stripeWebhook.js (see
// migrations/017_stripe_webhook_idempotency.sql) -- Stripe redelivers a
// webhook event whenever it doesn't get a fast 2xx, and without this,
// checkout.session.completed / invoice.payment_succeeded double-firing
// double-credits an account or resets used_this_cycle for free. Returns
// true if this event.id was successfully claimed (i.e. this is the first
// time it's being processed, safe to proceed), false if it was already
// claimed (a duplicate delivery -- caller should skip processing).
async function claimWebhookEvent(eventId, eventType) {
  const { error } = await supabase.from("stripe_webhook_events").insert({ event_id: eventId, event_type: eventType });
  if (error) {
    if (error.code === "23505") return false; // unique_violation -- already claimed
    throw new Error(`claimWebhookEvent failed: ${error.message}`);
  }
  return true;
}

// Releases a claim after the handler threw, so a genuine Stripe retry of
// the same event.id can claim it again instead of being silently
// swallowed as "already processed."
async function releaseWebhookEventClaim(eventId) {
  const { error } = await supabase.from("stripe_webhook_events").delete().eq("event_id", eventId);
  if (error) throw new Error(`releaseWebhookEventClaim failed: ${error.message}`);
}

module.exports = {
  DEFAULT_PLAN_ID,
  getPlan,
  getPlanByStripePriceId,
  getSubscription,
  getSubscriptionByStripeId,
  getCreditBalance,
  spendSubscriptionGeneration,
  refundSubscriptionGeneration,
  spendCredits,
  spendSubscriptionImageGeneration,
  refundSubscriptionImageGeneration,
  upsertSubscription,
  setSubscriptionStatus,
  syncSubscriptionFromStripe,
  addCredits,
  claimWebhookEvent,
  releaseWebhookEventClaim
};
