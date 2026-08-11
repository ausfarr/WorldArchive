// routes/fieldAssist.js
//
// v0.9 Manual Mode, Piece 2 -- "Help me" AI assist for a single
// free-text field. See session_addendum_field_assist_shipped.md for the
// full decision record and lib/fieldAssist.js for the prompt itself.
//
// enforceFieldAssist (middleware/enforceGenerationCap.js) spends
// POINTS_PER_FIELD_ASSIST (1 point, vs a full generation's 5) from the
// SAME pool the 8 content generators draw from -- there's no separate
// quota to track, just a cheaper spend. Must run before the Claude call,
// same contract as every other generation route.

const express = require("express");
const { enforceFieldAssist } = require("../middleware/enforceGenerationCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { getFieldAssistSuggestion } = require("../lib/fieldAssist");
const { getFieldAssistConfig } = require("../lib/fieldAssistFields");

const router = express.Router();

router.post("/field-assist", requireAiEnabled, enforceFieldAssist, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { category, fieldId, currentEntryData } = req.body || {};

    if (!category || !fieldId) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(400).json({ error: "category and fieldId are required" });
    }
    if (!getFieldAssistConfig(fieldId)) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(400).json({ error: `'${fieldId}' isn't a field Help Me supports.` });
    }

    const suggestion = await getFieldAssistSuggestion({ worldId, category, fieldId, currentEntryData });
    res.json({ suggestion });
  } catch (err) {
    console.error("Field assist failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
