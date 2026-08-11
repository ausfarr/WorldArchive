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

// Beta-period trial cap -- separate constant from the (now-retired as a
// hard limit) beta GENERATION_CAP in worldConfigRepo.js. Trial users
// reuse that same world_config.generation_count + RPC machinery, just
// pointed at this lower number. No card required to use up the trial.
//
// v0.9 Manual Mode, Piece 2 -- now in POINTS, not raw generations, same
// unit switch as GENERATION_CAP (see migrations/015_field_assist_points.sql).
// 10 -> 50 preserves the same real generosity.
const TRIAL_CAP = 50;

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

async function getCreditBalance(userId) {
  const { data, error } = await supabase.from("credit_ledger").select("amount").eq("user_id", userId);
  if (error) throw new Error(`getCreditBalance failed: ${error.message}`);
  return (data || []).reduce((sum, row) => sum + row.amount, 0);
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

// Upsert called from the Stripe webhook on checkout.session.completed
// (subscription mode) and again on customer.subscription.updated -- both
// pass the full current state from Stripe rather than a partial patch,
// since Stripe's webhook payloads are the source of truth and this
// avoids any drift between what we think a field is and what Stripe
// actually has.
async function upsertSubscription({ userId, planId, stripeCustomerId, stripeSubscriptionId, status, currentPeriodStart, currentPeriodEnd, resetUsage }) {
  const existing = await getSubscription(userId);
  const usedThisCycle = resetUsage ? 0 : (existing ? existing.used_this_cycle : 0);

  const { data, error } = await supabase
    .from("subscriptions")
    .upsert({
      user_id: userId,
      plan_id: planId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      status,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      used_this_cycle: usedThisCycle,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" })
    .select("*")
    .single();

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
  TRIAL_CAP,
  DEFAULT_PLAN_ID,
  getPlan,
  getPlanByStripePriceId,
  getSubscription,
  getSubscriptionByStripeId,
  getCreditBalance,
  spendSubscriptionGeneration,
  refundSubscriptionGeneration,
  upsertSubscription,
  setSubscriptionStatus,
  addCredits,
  claimWebhookEvent,
  releaseWebhookEventClaim
};
