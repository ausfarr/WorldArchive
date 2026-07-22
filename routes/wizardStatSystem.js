const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { getDraft, getStatSystem, saveStatSystem } = require("../lib/worldConfigRepo");
const { getLoreContext } = require("../lib/loreContext");
const { buildWizardStatSystemPrompt } = require("../prompts/wizardStatSystemPrompt");

const router = express.Router();

const CANONICAL_KEYS = ["body", "reflex", "knowledge", "presence", "sanity", "fate"];

router.get("/wizard/stat-system", async (req, res) => {
  try {
    const statSystem = await getStatSystem(req.worldId);
    res.json({ statSystem });
  } catch (err) {
    console.error("Loading stat system failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/generate-stat-system", async (req, res) => {
  try {
    const draft = await getDraft(req.worldId);
    const step1 = draft["1"] || {};
    // No single "category" fits a stat system -- it's meta, relevant to
    // everything -- so only core lore sections get pulled in here, not a
    // category-filtered set.
    const loreContext = await getLoreContext(req.worldId, {});

    const systemPrompt = buildWizardStatSystemPrompt({ step1, loreContext });
    const raw = await callClaude({
      systemPrompt,
      userMessage: "Generate the stat system now.",
      maxTokens: 1200
    });
    let statSystem;
    try {
      statSystem = parseJsonResponse(raw);
    } catch (parseErr) {
      console.error("Failed to parse stat system JSON. Raw response length:", raw.length);
      console.error("Raw response (last 300 chars):", raw.slice(-300));
      throw new Error(`Stat system was not valid JSON (likely truncated — response was ${raw.length} chars): ${parseErr.message}`);
    }
    res.json({ statSystem });
  } catch (err) {
    console.error("Stat system generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/save-stat-system", async (req, res) => {
  try {
    const { statSystem } = req.body || {};
    if (!statSystem || typeof statSystem !== "object") {
      return res.status(400).json({ error: "Request body must include a 'statSystem' object." });
    }
    const missing = CANONICAL_KEYS.filter((k) => !statSystem[k] || !statSystem[k].label);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing a label for: ${missing.join(", ")}` });
    }
    const saved = await saveStatSystem(req.worldId, statSystem);
    res.json({ statSystem: saved });
  } catch (err) {
    console.error("Saving stat system failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
