const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { getDraft, saveDraftStep } = require("../lib/worldConfigRepo");
const { buildWizardStep1SystemPrompt } = require("../prompts/wizardStep1Prompt");

const router = express.Router();

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
router.post("/wizard/generate-step1", async (req, res) => {
  try {
    const { genre, scale, era, supernaturalSystem } = req.body || {};
    const systemPrompt = buildWizardStep1SystemPrompt({ genre, scale, era, supernaturalSystem });
    const raw = await callClaude({
      systemPrompt,
      userMessage: "Generate the suggestions now.",
      maxTokens: 600
    });
    let suggestions;
    try {
      suggestions = parseJsonResponse(raw);
    } catch (parseErr) {
      console.error("Failed to parse wizard Step 1 JSON. Raw response:", raw);
      throw new Error(`Step 1 suggestions were not valid JSON: ${parseErr.message}`);
    }
    res.json(suggestions);
  } catch (err) {
    console.error("Wizard Step 1 generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
