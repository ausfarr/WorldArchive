// lib/billingTier.js
//
// Bug batch 1, Phase 2 (session_addendum_bug_batch_1.md): the single
// place that decides which billing tier a subscriptions row puts an
// account in, plus the pure builders /api/billing/status uses to report
// it. Pure functions only -- no Supabase, no Stripe -- so
// scripts/testBillingTier.js can exercise every branch with plain
// fixtures.
//
// Why this exists: middleware/enforceGenerationCap.js used to branch on
// `if (subscription)`, so ANY subscriptions row -- including one Stripe
// had long since canceled -- sent the account down the subscription RPC
// path. Those RPCs zero the monthly quota for any status other than
// 'active', and the free-tier branch (monthly free allowance) was never
// reached, so a canceled subscriber had no free generations at all and
// Settings showed "44 of 50 remaining... Renews <past date>". Decision 1
// of the batch: a lapsed subscriber falls back to the free tier, and
// purchased credits still work.

const {
  POINTS_PER_GENERATION, FREE_MONTHLY_GENERATION_CAP, FREE_MONTHLY_IMAGE_CAP
} = require("./worldConfigRepo");

// Stripe statuses that put an account back on the free tier. canceled/
// unpaid/incomplete_expired mean Stripe has given up collecting.
// past_due joined them in the Phase 2 follow-up (Austin's call: a failed
// renewal is effectively an automatic cancel) -- before, it stayed on the
// subscription path with the quota zeroed, which left a past_due account
// strictly worse off than a canceled one (no quota AND no free
// allowance). If Stripe's retry succeeds, invoice.payment_succeeded flips
// the row back to 'active' with fresh usage, so nothing extra is needed
// to restore the paid path.
const LAPSED_SUBSCRIPTION_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired", "past_due"]);

// 'free'       -- no subscriptions row at all
// 'lapsed'     -- a row whose status is in LAPSED_SUBSCRIPTION_STATUSES
// 'subscribed' -- any other row (active, trialing, ...), same path every
//                 row took before this fix
function billingTierFor(subscription) {
  if (!subscription) return "free";
  if (LAPSED_SUBSCRIPTION_STATUSES.has(subscription.status)) return "lapsed";
  return "subscribed";
}

// Unlimited entries / regenerate access are active-only perks
// (middleware/enforceEntryCap.js, lib/regenerateGate.js). Kept separate
// from billingTierFor(): a status that is neither 'active' nor lapsed
// (e.g. trialing, which this app never writes today) stays on the
// subscription quota path but doesn't get the unlimited-entries perk.
function isActiveSubscription(subscription) {
  return !!(subscription && subscription.status === "active");
}

// Mirrors Postgres's `timestamptz + interval '1 month'` (Supabase runs in
// UTC): same day-of-month next month, clamped to that month's last day
// (Jan 31 -> Feb 28/29). reset_free_cycle_if_elapsed (migrations/029)
// fires once `free_cycle_reset_at <= now() - interval '1 month'`, so this
// is the exact moment the next request resets the counters. The previous
// JS `setMonth(getMonth() + 1)` rolled Jan 31 over into early March and
// ran in the server's local timezone, so Settings could promise a reset
// date days after the real one.
function addOneMonthLikePostgres(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = month % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return new Date(Date.UTC(
    targetYear, targetMonth, day,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()
  ));
}

// Points -> whole generations for display. Floors so Settings never
// implies a full generation is available when only field-assist points
// are left (same reasoning as the original helper in routes/billing.js).
function pointsToGenerations(points) {
  return Math.floor((points || 0) / POINTS_PER_GENERATION);
}

// The free-allowance fields shared by the 'free' and 'lapsed' payloads.
// `config` is the world_config row AFTER resetFreeCycleIfElapsed() ran,
// so the counters and free_cycle_reset_at are for the current cycle.
function buildFreeAllowanceFields(config, creditBalancePoints) {
  const freeUsedPoints = config.generation_count || 0;
  const freeImageUsed = config.image_generation_count || 0;
  const nextResetAt = addOneMonthLikePostgres(config.free_cycle_reset_at);
  return {
    freeUsed: pointsToGenerations(freeUsedPoints),
    freeCap: pointsToGenerations(FREE_MONTHLY_GENERATION_CAP),
    freeRemaining: pointsToGenerations(Math.max(0, FREE_MONTHLY_GENERATION_CAP - freeUsedPoints)),
    freeImageUsed,
    freeImageCap: FREE_MONTHLY_IMAGE_CAP,
    freeImageRemaining: Math.max(0, FREE_MONTHLY_IMAGE_CAP - freeImageUsed),
    nextResetAt: nextResetAt ? nextResetAt.toISOString() : null,
    creditBalance: pointsToGenerations(creditBalancePoints),
    fieldAssistsRemaining: Math.max(0, FREE_MONTHLY_GENERATION_CAP - freeUsedPoints) + (creditBalancePoints || 0)
  };
}

// /api/billing/status payload for BILLING_ENABLED=true. `tier` comes from
// billingTierFor(); `plan` is only needed (and only read) for
// 'subscribed'; `config` only for 'free'/'lapsed'. entryCap/aiEnabled are
// computed by the route and passed through untouched.
//
// Lapsed payload deliberately carries NO monthlyQuota/remainingThisCycle/
// currentPeriodEnd fields -- the old UI rendered "N of 50 remaining...
// Renews <past date>" straight off those, and leaving them out means no
// stale render path can resurrect that line. endedAt is the subscription's
// last period end (routes/stripeWebhook.js clamps it to Stripe's ended_at
// on an immediate cancel), so "Your subscription ended on <date>" is
// accurate either way. For status 'past_due' the subscription hasn't
// ended -- a renewal payment failed -- so Settings words it as a payment
// problem instead and doesn't show endedAt.
function buildBillingStatusPayload({ tier, subscription, plan, config, creditBalancePoints, entryCap, aiEnabled }) {
  if (tier === "free") {
    return { state: "free", ...buildFreeAllowanceFields(config, creditBalancePoints), entryCap, aiEnabled };
  }

  if (tier === "lapsed") {
    return {
      state: "lapsed",
      status: subscription.status,
      endedAt: subscription.current_period_end || null,
      ...buildFreeAllowanceFields(config, creditBalancePoints),
      entryCap,
      aiEnabled
    };
  }

  const remainingThisCyclePoints = Math.max(0, plan.monthly_quota - subscription.used_this_cycle);
  const usedImagesThisCycle = subscription.used_images_this_cycle || 0;
  const monthlyQuotaImages = plan.monthly_quota_images || 0;
  return {
    state: "subscribed",
    status: subscription.status,
    planName: plan.name,
    monthlyQuota: pointsToGenerations(plan.monthly_quota),
    usedThisCycle: pointsToGenerations(subscription.used_this_cycle),
    remainingThisCycle: pointsToGenerations(remainingThisCyclePoints),
    monthlyQuotaImages,
    usedImagesThisCycle,
    remainingImagesThisCycle: Math.max(0, monthlyQuotaImages - usedImagesThisCycle),
    currentPeriodEnd: subscription.current_period_end,
    // Absent column (migration 037 not yet run) reads as undefined ->
    // false, i.e. the old "Renews <date>" label -- same as before.
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    creditBalance: pointsToGenerations(creditBalancePoints),
    fieldAssistsRemaining: remainingThisCyclePoints + (creditBalancePoints || 0),
    entryCap,
    aiEnabled
  };
}

// Period fields off a Stripe Subscription object, as ISO strings (or null
// when absent). The pinned Stripe API version (stripe@17 -> 2024-12-18)
// puts current_period_start/end on the subscription itself, which is
// what every handler in routes/stripeWebhook.js already reads; newer API
// versions moved them onto subscription items, so fall back to the first
// item rather than writing "Invalid Date" if the account's webhook
// version is ever bumped. Callers skip any field that comes back null
// instead of overwriting a good value with nothing.
function stripePeriodFields(stripeSubscription) {
  const sub = stripeSubscription || {};
  const item = sub.items && Array.isArray(sub.items.data) ? sub.items.data[0] : null;
  const toIso = (secs) => (typeof secs === "number" && Number.isFinite(secs) ? new Date(secs * 1000).toISOString() : null);
  return {
    currentPeriodStart: toIso(sub.current_period_start) || toIso(item && item.current_period_start),
    currentPeriodEnd: toIso(sub.current_period_end) || toIso(item && item.current_period_end)
  };
}

module.exports = {
  LAPSED_SUBSCRIPTION_STATUSES,
  billingTierFor,
  isActiveSubscription,
  addOneMonthLikePostgres,
  pointsToGenerations,
  buildFreeAllowanceFields,
  buildBillingStatusPayload,
  stripePeriodFields
};
