const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { getDraft, getSkillSystem, saveSkillSystem } = require("../lib/worldConfigRepo");
const { getLoreContext } = require("../lib/loreContext");
const { getStatLabels, formatStatLabelsForPrompt } = require("../lib/worldFlavor");
const { buildWizardSkillSystemPrompt, WEAPON_SKILL_KEYS } = require("../prompts/wizardSkillSystemPrompt");

const router = express.Router();

const WEAPON_SKILL_CANONICAL = Object.keys(WEAPON_SKILL_KEYS);

router.get("/wizard/skill-system", async (req, res) => {
  try {
    const skillSystem = await getSkillSystem(req.worldId);
    res.json({ skillSystem });
  } catch (err) {
    console.error("Loading skill system failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/generate-skill-system", async (req, res) => {
  try {
    const worldId = req.worldId;
    const draft = await getDraft(worldId);
    const step1 = draft["1"] || {};
    const loreContext = await getLoreContext(worldId, {});
    const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));

    const systemPrompt = buildWizardSkillSystemPrompt({ step1, loreContext, statLabelsText });
    const raw = await callClaude({
      systemPrompt,
      userMessage: "Generate the skill system now.",
      maxTokens: 2000
    });
    let skillSystem;
    try {
      skillSystem = parseJsonResponse(raw);
    } catch (parseErr) {
      console.error("Failed to parse skill system JSON. Raw response length:", raw.length);
      console.error("Raw response (last 300 chars):", raw.slice(-300));
      throw new Error(`Skill system was not valid JSON (likely truncated — response was ${raw.length} chars): ${parseErr.message}`);
    }
    res.json({ skillSystem });
  } catch (err) {
    console.error("Skill system generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/save-skill-system", async (req, res) => {
  try {
    const { skillSystem } = req.body || {};
    if (!skillSystem || typeof skillSystem !== "object") {
      return res.status(400).json({ error: "Request body must include a 'skillSystem' object." });
    }
    const missingWeaponLabels = WEAPON_SKILL_CANONICAL.filter((k) => !skillSystem.weaponSkills || !skillSystem.weaponSkills[k]);
    if (missingWeaponLabels.length > 0) {
      return res.status(400).json({ error: `Missing a weapon skill label for: ${missingWeaponLabels.join(", ")}` });
    }
    if (!Array.isArray(skillSystem.fieldSkills) || skillSystem.fieldSkills.length === 0) {
      return res.status(400).json({ error: "At least one field skill is required." });
    }
    const saved = await saveSkillSystem(req.worldId, skillSystem);
    res.json({ skillSystem: saved });
  } catch (err) {
    console.error("Saving skill system failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
