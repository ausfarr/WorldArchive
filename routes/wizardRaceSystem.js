// routes/wizardRaceSystem.js
//
// R4 Phase 3: Race/Species reference system, same "Skills-pattern" shape
// as routes/wizardSkillSystem.js -- progressive-commit storage plus an
// AI-assist generation endpoint, deliberately NOT a full category route
// (no generation cap, no entry cap, no confirm-entry write path) per the
// scope doc's explicit "cheaper than a category" decision.

const express = require("express");
const { getRaceSystem, saveRaceSystem } = require("../lib/worldConfigRepo");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext } = require("../lib/worldFlavor");
const { buildWizardRaceSystemPrompt } = require("../prompts/wizardRaceSystemPrompt");
const { callClaudeExpectingJson } = require("../lib/claude");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { getSeedRacePool } = require("../lib/rulesets/5e/raceSystemSeed");

const router = express.Router();

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

// GET returns this world's own saved list once it has one; before the
// first save, returns the real-SRD-derived seed pool (R6 Phase 2 --
// falls back to the hand-authored starter list if srd_library has no
// species rows yet or the read fails, see raceSystemSeed.js) -- never
// silently persisted, the world only "owns" a race system once Save is
// used, same progressive-commit rule every other wizard step follows.
router.get("/wizard/race-system", async (req, res) => {
  try {
    const raceSystem = await getRaceSystem(req.worldId);
    if (raceSystem && raceSystem.length) {
      return res.json({ raceSystem, isStarterDefault: false });
    }
    const seedPool = await getSeedRacePool();
    res.json({ raceSystem: seedPool, isStarterDefault: true });
  } catch (err) {
    console.error("Loading race system failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generates ONE new race (not saved) -- used for both "+ Add Race (AI)"
// and a per-race "Regenerate" action on the frontend.
router.post("/wizard/generate-race", requireAiEnabled, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { name, existingRaces } = req.body || {};
    const settingContext = await getSettingContext(worldId);
    const loreContext = await getLoreContext(worldId, {});
    const existingRacesText = Array.isArray(existingRaces) && existingRaces.length
      ? existingRaces.map((r) => `- ${r.name || r.key}`).join("\n")
      : "";

    const systemPrompt = buildWizardRaceSystemPrompt({ settingContext, loreContext, existingRacesText, name });
    const race = await callClaudeExpectingJson({
      systemPrompt,
      userMessage: "Design the race now.",
      maxTokens: 1200
    });
    res.json({ race });
  } catch (err) {
    console.error("Race generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/save-race-system", async (req, res) => {
  try {
    const { raceSystem } = req.body || {};
    if (!Array.isArray(raceSystem)) {
      return res.status(400).json({ error: "Request body must include a 'raceSystem' array." });
    }
    const missingName = raceSystem.find((r) => !r || !r.name);
    if (missingName) {
      return res.status(400).json({ error: "Every race needs a name." });
    }
    // Defensive clamp, same "code doesn't trust the model/user with raw
    // numbers" principle as every generation route -- a hand-typed
    // ability score increase can't silently exceed the real SRD budget.
    const normalized = raceSystem.map((r) => {
      const asi = {};
      ABILITY_KEYS.forEach((k) => {
        const v = Number((r.abilityScoreIncrease || {})[k]) || 0;
        asi[k] = Math.max(0, Math.min(2, Math.round(v)));
      });
      return { ...r, abilityScoreIncrease: asi };
    });
    const saved = await saveRaceSystem(req.worldId, normalized);
    res.json({ raceSystem: saved });
  } catch (err) {
    console.error("Saving race system failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
