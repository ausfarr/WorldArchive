// middleware/enforceGenerationCap.js
//
// Gates the 7 non-wizard content-generation routes (/generate-npc,
// -enemy, -item, -survivor, -log, -class, -faction) behind real usage
// limits. Phase 5 replaced the flat 25-generation beta stopgap with:
//   - Trial (no subscriptions row for this user): 10 lifetime
//     generations, no card required. Reuses the existing
//     world_config.generation_count + check_and_increment_generation_count
//     machinery from 006_generation_usage_cap.sql -- see
//     lib/billingRepo.js's TRIAL_CAP.
//   - Subscribed (has a subscriptions row): monthly quota (resets each
//     billing cycle) then rollover credit balance -- see
//     migrations/012_billing.sql's check_and_spend_subscription_generation.
//     This path applies even if status is past_due/canceled -- those
//     users just get 0 effective monthly quota and fall straight to
//     credits, per session_addendum_phase5_billing_scope.md.
//
// Deliberately NOT applied to any /api/wizard/* route -- same reasoning
// as before Phase 5: wizard "generate for me" calls are a bounded,
// one-time setup cost per world, not the open-ended per-action risk this
// cap exists to bound.
//
// Must run BEFORE any Claude/Gemini call in the route it guards -- the
// point is preventing spend, not reporting it after the fact. Apply as
// route-level middleware, e.g.:
//   router.post("/generate-npc", enforceGenerationCap, async (req, res) => {...
const { checkAndIncrementGenerationCount } = require("../lib/worldConfigRepo");
const { getSubscription, spendSubscriptionGeneration, TRIAL_CAP } = require("../lib/billingRepo");

// TODO(Austin): swap in a real contact address before beta testers see this.
const CONTACT_EMAIL = "ausfarr@gmail.com";

async function enforceGenerationCap(req, res, next) {
  try {
    const subscription = await getSubscription(req.userId);

    if (subscription) {
      const result = await spendSubscriptionGeneration(req.userId);
      if (!result.allowed) {
        return res.status(403).json({
          error: "generation_limit_reached",
          message: `You've used this cycle's included generations and have no credits left. Buy more credits or wait for your plan to renew.`,
          usedThisCycle: result.usedThisCycle,
          creditBalance: result.creditBalance
        });
      }
      req.generationSource = result.source; // 'quota' | 'credit'
      return next();
    }

    // No subscriptions row -- trial user.
    const { allowed, count } = await checkAndIncrementGenerationCount(req.worldId, TRIAL_CAP);
    if (!allowed) {
      return res.status(403).json({
        error: "trial_cap_reached",
        message: `You've used all ${TRIAL_CAP} free trial generations. Subscribe to keep creating, or email ${CONTACT_EMAIL} with questions.`,
        cap: TRIAL_CAP
      });
    }
    req.generationCount = count;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { enforceGenerationCap };
