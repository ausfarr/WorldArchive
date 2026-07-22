const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { getDraft, getFactions, getStyleGuide, saveStyleGuide } = require("../lib/worldConfigRepo");
const { getLoreContext } = require("../lib/loreContext");
const { buildWizardStyleGuideSystemPrompt, buildFactionAccentsSystemPrompt } = require("../prompts/wizardStyleGuidePrompt");

const router = express.Router();

router.get("/wizard/style-guide", async (req, res) => {
  try {
    const styleGuide = await getStyleGuide(req.worldId);
    res.json({ styleGuide });
  } catch (err) {
    console.error("Loading style guide failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generates the base style guide (rendering/lighting/palette/etc), not
// including per-faction accents -- that's a separate call below, since it
// needs the base style already decided to stay consistent, and needs the
// full faction list to assign distinct-from-each-other colors.
router.post("/wizard/generate-style-guide", async (req, res) => {
  try {
    const draft = await getDraft(req.worldId);
    const step1 = draft["1"] || {};
    const loreContext = await getLoreContext(req.worldId, {});

    const systemPrompt = buildWizardStyleGuideSystemPrompt({ step1, loreContext });
    const raw = await callClaude({
      systemPrompt,
      userMessage: "Generate the style guide now.",
      maxTokens: 1200
    });
    let styleGuide;
    try {
      styleGuide = parseJsonResponse(raw);
    } catch (parseErr) {
      console.error("Failed to parse style guide JSON. Raw response length:", raw.length);
      console.error("Raw response (last 300 chars):", raw.slice(-300));
      throw new Error(`Style guide was not valid JSON (likely truncated — response was ${raw.length} chars): ${parseErr.message}`);
    }
    res.json({ styleGuide });
  } catch (err) {
    console.error("Style guide generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generates accent colors for every faction saved in Step 4, grounded in
// whatever base style guide the caller currently has (may be unsaved
// edits from the form, not necessarily what's persisted yet -- passed in
// the request body rather than re-fetched, so the colors match what the
// user is actually looking at).
router.post("/wizard/generate-faction-accents", async (req, res) => {
  try {
    const { baseStyle } = req.body || {};
    const factions = await getFactions(req.worldId);
    if (factions.length === 0) {
      return res.status(400).json({ error: "No factions saved yet for this world (Step 4) -- nothing to assign accent colors to." });
    }
    const systemPrompt = buildFactionAccentsSystemPrompt({ baseStyle, factions });
    const raw = await callClaude({
      systemPrompt,
      userMessage: "Assign the faction accent colors now.",
      maxTokens: 1200
    });
    let result;
    try {
      result = parseJsonResponse(raw);
    } catch (parseErr) {
      console.error("Failed to parse faction accents JSON. Raw response length:", raw.length);
      throw new Error(`Faction accents were not valid JSON (likely truncated — response was ${raw.length} chars): ${parseErr.message}`);
    }
    res.json(result);
  } catch (err) {
    console.error("Faction accent generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/save-style-guide", async (req, res) => {
  try {
    const { styleGuide } = req.body || {};
    if (!styleGuide || typeof styleGuide !== "object") {
      return res.status(400).json({ error: "Request body must include a 'styleGuide' object." });
    }
    const saved = await saveStyleGuide(req.worldId, styleGuide);
    res.json({ styleGuide: saved });
  } catch (err) {
    console.error("Saving style guide failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
