// routes/wizardGenericSystem.js
//
// Multi-ruleset genericization -- Generic ruleset wizard step. Mirrors
// routes/wizardStatSystem.js's shape (GET current / POST generate-for-me
// / POST save), but for world_config.generic_system_json instead of
// stat_system_json -- see lib/rulesets/generic/statFormulas.js's header
// comment for why this is a small formula engine rather than a
// hardcoded table the way every other ruleset's stat file is.
//
// Only meaningful for ruleset === "generic" worlds; the frontend
// (archive/wizard-stats.html) only shows this step's UI when that's the
// world's ruleset, but these routes don't themselves check ruleset --
// same pattern as wizardStatSystem.js, which likewise doesn't check
// that ruleset === "echoes" before letting a save through. Worth noting
// as a soft gap, not a security one: worldConfigRepo scopes everything
// to req.worldId already, so the worst a wrong-ruleset call could do is
// write data this world's own generation routes will simply never read.
const express = require("express");
const { callClaudeExpectingJson } = require("../lib/claude");
const { getDraft, getGenericSystem, saveGenericSystem } = require("../lib/worldConfigRepo");
const { getLoreContext } = require("../lib/loreContext");
const { buildWizardGenericSystemPrompt } = require("../prompts/wizardGenericSystemPrompt");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");

const router = express.Router();

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

function validateGenericSystem(genericSystem) {
  if (!genericSystem || typeof genericSystem !== "object") return "Request body must include a 'genericSystem' object.";
  if (!Array.isArray(genericSystem.attributes) || genericSystem.attributes.length === 0) {
    return "genericSystem.attributes must be a non-empty array.";
  }
  const seenKeys = new Set();
  for (const attr of genericSystem.attributes) {
    if (!attr || !attr.key || !attr.label) return "Every attribute needs both a key and a label.";
    if (!KEY_PATTERN.test(attr.key)) return `Attribute key '${attr.key}' must be lower_snake_case.`;
    if (seenKeys.has(attr.key)) return `Duplicate attribute key '${attr.key}'.`;
    seenKeys.add(attr.key);
  }
  if (genericSystem.useFormula) {
    if (!Array.isArray(genericSystem.derivedStats)) return "genericSystem.derivedStats must be an array when useFormula is true.";
    for (const stat of genericSystem.derivedStats) {
      if (!stat || !stat.key || !stat.label || !stat.attributeKey) return "Every derived stat needs a key, label, and attributeKey.";
      if (!seenKeys.has(stat.attributeKey)) return `Derived stat '${stat.key}' references unknown attribute '${stat.attributeKey}'.`;
      if (typeof stat.coefficient !== "number" || typeof stat.base !== "number") return `Derived stat '${stat.key}' needs numeric coefficient and base.`;
    }
  }
  return null;
}

router.get("/wizard/generic-system", async (req, res) => {
  try {
    const genericSystem = await getGenericSystem(req.worldId);
    res.json({ genericSystem });
  } catch (err) {
    console.error("Loading generic system failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// requireAiEnabled, not enforceGenerationCap -- wizard generation stays
// free of the points/cap system by design (same as every other wizard
// "generate for me" endpoint).
router.post("/wizard/generate-generic-system", requireAiEnabled, async (req, res) => {
  try {
    const draft = await getDraft(req.worldId);
    const step1 = draft["1"] || {};
    const loreContext = await getLoreContext(req.worldId, {});

    const systemPrompt = buildWizardGenericSystemPrompt({ step1, loreContext });
    const genericSystem = await callClaudeExpectingJson({
      systemPrompt,
      userMessage: "Design the attribute system now.",
      maxTokens: 1200
    });
    // Model-proposed data still goes through the same validation a
    // manual save would -- a malformed AI response (e.g. a derivedStats
    // entry pointing at an attributeKey it forgot to define) shouldn't
    // silently reach the frontend as if it were trustworthy.
    const validationError = validateGenericSystem(genericSystem);
    if (validationError) {
      return res.status(502).json({ error: `Generated system failed validation: ${validationError}` });
    }
    res.json({ genericSystem });
  } catch (err) {
    console.error("Generic system generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/save-generic-system", async (req, res) => {
  try {
    const { genericSystem } = req.body || {};
    const validationError = validateGenericSystem(genericSystem);
    if (validationError) return res.status(400).json({ error: validationError });

    const saved = await saveGenericSystem(req.worldId, genericSystem);
    res.json({ genericSystem: saved });
  } catch (err) {
    console.error("Saving generic system failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
