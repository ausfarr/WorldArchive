// middleware/enforceGenerationCap.js
//
// Gates the 7 non-wizard content-generation routes (/generate-npc,
// -enemy, -item, -survivor, -log, -class, -faction) behind usage limits.
//
// BILLING_ENABLED env var is the kill switch for the entire Phase 5
// billing system:
//   - unset or "false" (default): LEGACY beta behavior -- flat 25-
//     generation lifetime cap, no trial/subscription/credit concepts at
//     all. This is deliberately the default so re-deploying this code
//     doesn't retroactively lock out existing beta testers who already
//     used more than the new 10-generation trial cap under the old
//     25-cap system -- see session_addendum_billing_toggle.md.
//   - "true": full Phase 5 behavior -- trial (10, no card) then
//     subscription monthly quota then rollover credits. See
//     lib/billingRepo.js and migrations/012_billing.sql.
//
// Flip BILLING_ENABLED=true in Render (env var, no code change, no
// redeploy needed beyond the restart Render does automatically) when
// ready to actually turn billing on for everyone.
//
// Must run BEFORE any Claude/Gemini call in the route it guards -- the
// point is preventing spend, not reporting it after the fact. Apply as
// route-level middleware, e.g.:
//   router.post("/generate-npc", enforceGenerationCap, async (req, res) => {...
const { checkAndIncrementGenerationCount, GENERATION_CAP } = require("../lib/worldConfigRepo");
const { getSubscription, spendSubscriptionGeneration, TRIAL_CAP } = require("../lib/billingRepo");

// TODO(Austin): swap in a real contact address before beta testers see this.
const CONTACT_EMAIL = "ausfarr@gmail.com";

const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

async function enforceGenerationCap(req, res, next) {
  try {
    if (!BILLING_ENABLED) {
      // Legacy beta flow -- same behavior as before Phase 5 existed.
      const { allowed, count } = await checkAndIncrementGenerationCount(req.worldId, GENERATION_CAP);
      if (!allowed) {
        return res.status(403).json({
          error: "generation_cap_reached",
          message: `You've used all ${GENERATION_CAP} generations included in this beta -- thanks for putting it through its paces! Email ${CONTACT_EMAIL} if you'd like more.`,
          cap: GENERATION_CAP
        });
      }
      req.generationCount = count;
      return next();
    }

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

module.exports = { enforceGenerationCap, BILLING_ENABLED };
