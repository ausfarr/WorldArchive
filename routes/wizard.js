const express = require("express");
const { callClaudeExpectingJson } = require("../lib/claude");
const { getDraft, saveDraftStep, resetWorldConfig, getOrCreateWorldConfig, getRuleset, setRuleset } = require("../lib/worldConfigRepo");
const { clearLoreSections } = require("../lib/loreRepo");
const { buildWizardStep1SystemPrompt } = require("../prompts/wizardStep1Prompt");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { listRulesets, isValidRuleset } = require("../lib/rulesets");
const { isAdminEmail } = require("../lib/adminAccess");

const router = express.Router();

// Multi-ruleset genericization, Phase 1 -- see migrations/020_ruleset_foundation.sql.
// Ruleset options for Step 1's picker, filtered server-side (Echoes
// dropped for non-admins -- see lib/rulesets/index.js's listRulesets,
// the ONLY place that filter lives). `locked` tells the frontend whether
// the picker should be editable at all -- true once this world's setup
// is complete, since setRuleset() below refuses to write past that
// point anyway; surfacing it here lets the page disable the control
// instead of letting a user fill it in and then hit a confusing save
// error.
router.get("/wizard/ruleset-options", async (req, res) => {
  try {
    const [config, current] = await Promise.all([
      getOrCreateWorldConfig(req.worldId),
      getRuleset(req.worldId)
    ]);
    res.json({
      options: listRulesets(req.userEmail),
      current,
      locked: !!config.setup_completed_at
    });
  } catch (err) {
    console.error("Loading ruleset options failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Sets world_config.ruleset directly (NOT via draft_json/save-draft --
// this is a real, permanent commit from the moment it's first saved, not
// scratch state). isValidRuleset() rejects anything outside the 3 known
// values; the Echoes admin-only gate is re-checked here server-side too
// (never trust the frontend picker having filtered it out) so a crafted
// request can't set a non-admin world to 'echoes'. worldConfigRepo's
// setRuleset() is what actually enforces "permanent once setup is
// complete" -- see that function's comment.
router.post("/wizard/set-ruleset", async (req, res) => {
  try {
    const { ruleset } = req.body || {};
    if (!isValidRuleset(ruleset)) {
      return res.status(400).json({ error: `Invalid ruleset '${ruleset}'. Must be one of: echoes, 5e, generic.` });
    }
    if (ruleset === "echoes" && !isAdminEmail(req.userEmail)) {
      return res.status(403).json({ error: "The Echoes of the Neon ruleset is admin-only." });
    }
    const saved = await setRuleset(req.worldId, ruleset);
    res.json({ ruleset: saved });
  } catch (err) {
    console.error("Setting ruleset failed:", err);
    res.status(400).json({ error: err.message });
  }
});

// Wipes ALL wizard progress for this world -- draft_json, factions_json,
// lore_doc_ref (worldConfigRepo.resetWorldConfig) and every lore_sections
// row (loreRepo.clearLoreSections). Called two ways from the frontend
// (see archive/js/wizardSession.js): automatically at the start of a new
// browser session (sessionStorage flag absent), and on-demand via an
// explicit "Start Over" button. The auto trigger only ever wipes an
// in-progress (not yet setup_completed_at) world -- without this guard, a
// stale bookmark/back-button/reopened-tab visit to any wizard-*.html page
// for an already-live world would silently erase it with no confirmation,
// since sessionStorage (and thus the "continuing session" flag) doesn't
// survive a closed tab. "Start Over" passes force:true because that's an
// explicit, user-confirmed action (see wizardSession.js's confirm()) and
// is allowed to wipe a completed world same as Delete World is.
router.post("/wizard/reset", async (req, res) => {
  try {
    const force = req.body && req.body.force === true;
    if (!force) {
      const config = await getOrCreateWorldConfig(req.worldId);
      if (config.setup_completed_at) {
        return res.status(409).json({ error: "World setup already complete; refusing auto-reset.", setupCompletedAt: config.setup_completed_at });
      }
    }
    await resetWorldConfig(req.worldId);
    await clearLoreSections(req.worldId);
    res.json({ reset: true });
  } catch (err) {
    console.error("Wizard reset failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Returns the full in-progress draft (all steps saved so far), so the
// wizard page can pre-fill fields if the user left and came back.
router.get("/wizard/draft", async (req, res) => {
  try {
    const draft = await getDraft(req.worldId);
    res.json({ draft });
  } catch (err) {
    console.error("Loading wizard draft failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Autosave endpoint — merges the given fields into draft_json[step].
// Called on blur/change from the wizard page, not just on step-advance,
// so a closed tab mid-step doesn't lose already-typed field values.
router.post("/wizard/save-draft", async (req, res) => {
  try {
    const { step, fields } = req.body || {};
    if (!step || typeof fields !== "object" || fields === null) {
      return res.status(400).json({ error: "Request body must include a numeric 'step' and a 'fields' object." });
    }
    const draft = await saveDraftStep(req.worldId, step, fields);
    res.json({ draft });
  } catch (err) {
    console.error("Saving wizard draft failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Step 1's combined "generate for me" — takes whatever genre/scale/era/
// supernaturalSystem the user has already picked (may be partial or
// empty) and suggests coreTension, inspirations, and nonNegotiables.
// Does NOT save to the draft itself — the frontend fills the form fields
// with the suggestions, and the user's own edits get saved via
// /wizard/save-draft like any other field, same as manual entries.
// requireAiEnabled gates this like every other AI-spend route -- not
// enforceGenerationCap, though: wizard generation stays free of the
// points/cap system by design (setup-time AI assist shouldn't burn a
// new world's generation budget before it's even archived anything).
router.post("/wizard/generate-step1", requireAiEnabled, async (req, res) => {
  try {
    const { genre, scale, era, supernaturalSystem } = req.body || {};
    const systemPrompt = buildWizardStep1SystemPrompt({ genre, scale, era, supernaturalSystem });
    const suggestions = await callClaudeExpectingJson({
      systemPrompt,
      userMessage: "Generate the suggestions now.",
      maxTokens: 600
    });
    res.json(suggestions);
  } catch (err) {
    console.error("Wizard Step 1 generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
