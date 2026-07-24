// middleware/enforceGenerationCap.js
//
// Gates the 7 non-wizard content-generation routes (/generate-npc,
// -enemy, -item, -survivor, -log, -class, -faction) behind a lifetime
// per-world cap. Beta-period stopgap for not having real metering/
// billing (Phase 5) yet -- see multi_tenant_pivot_scope.md.
//
// Deliberately NOT applied to any /api/wizard/* route: wizard "generate
// for me" calls during onboarding are a bounded, one-time setup cost per
// world, not the open-ended per-action risk this cap exists to bound.
//
// Must run BEFORE any Claude/Gemini call in the route it guards -- the
// point is preventing spend, not reporting it after the fact. Apply as
// route-level middleware, e.g.:
//   router.post("/generate-npc", enforceGenerationCap, async (req, res) => {...
const { checkAndIncrementGenerationCount, GENERATION_CAP } = require("../lib/worldConfigRepo");

// TODO(Austin): swap in a real contact address before beta testers see this.
const CONTACT_EMAIL = "[email protected]";

async function enforceGenerationCap(req, res, next) {
  try {
    const { allowed, count } = await checkAndIncrementGenerationCount(req.worldId, GENERATION_CAP);
    if (!allowed) {
      return res.status(403).json({
        error: "generation_cap_reached",
        message: `You've used all ${GENERATION_CAP} generations included in this beta -- thanks for putting it through its paces! Email ${CONTACT_EMAIL} if you'd like more.`,
        cap: GENERATION_CAP
      });
    }
    req.generationCount = count;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { enforceGenerationCap };
