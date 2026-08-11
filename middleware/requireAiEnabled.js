// middleware/requireAiEnabled.js
//
// Account-level "AI features" kill switch (Settings > AI Features, see
// migrations/016_ai_toggle.sql and lib/userSettingsRepo.js). Hiding the
// buttons client-side (archive/js/render.js's applyAiEnabledGating) is
// just a UX nicety -- this is the real gate, since someone could still
// hit an /api route directly and rack up real Claude/Gemini spend with
// the buttons hidden.
//
// Applied to every route that spends an AI call: the 8 /generate-X
// content routes (same insertion point as enforceGenerationCap/
// enforceEntryCapOnGenerate, runs first so an AI-off account never even
// reaches the points check), /field-assist, the portrait /generate-image
// route, World Art (mood board + faction banners), the dungeon/battle
// map generate route, Campaign Arc/Quest generation (routes/campaignArc.js,
// routes/campaignModule.js), and every wizard */generate-*` route
// (routes/wizard*.js -- those aren't gated by enforceGenerationCap, since
// wizard generation stays free of the points/cap system by design, but
// still must respect this account-level toggle). Deliberately NOT
// applied to manual-entry save (/confirm-entry), /generate-procedural,
// or /upload-image -- none of those call an AI model, and Manual Mode +
// Roll Randomly + Upload must keep working with AI turned off (see the
// scope addendum).
const { getAiEnabled } = require("../lib/userSettingsRepo");

async function requireAiEnabled(req, res, next) {
  try {
    const aiEnabled = await getAiEnabled(req.userId);
    if (!aiEnabled) {
      return res.status(403).json({
        error: "ai_disabled",
        message: "AI features are turned off for this account -- enable them in Settings to use this."
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAiEnabled };
