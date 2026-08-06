// routes/generateProcedural.js
//
// Procedural (non-AI) entry generation -- see procedural_generation_scope_
// proposal.md. Deliberately thin, per CLAUDE.md's "route files stay thin"
// convention: all the real logic (weighted picks, template fills, formula
// calls) lives in lib/proceduralGenerators.js. This route does NOT write
// to the database itself -- it only returns the generated `entry` object,
// same preview shape a regenerate call already returns (routes/generateX.js),
// and the frontend immediately follows up with the existing
// POST /api/confirm-entry to persist it. That's the "no new write path"
// constraint from the proposal: the only place any of these 8 categories
// actually get written is the one route that already does it for AI and
// Manual Mode entries alike.
//
// No enforceGenerationCap here -- there's no AI/Claude call anywhere in
// this path, so it doesn't spend any of the points budget that middleware
// guards. enforceEntryCapOnGenerate still applies (a procedural entry is
// still a new row against the same per-world entry limit manual/AI
// entries share).
const express = require("express");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { generateProcedurally } = require("../lib/proceduralGenerators");

const router = express.Router();

const VALID_CATEGORIES = new Set(["items", "enemies", "classes", "survivors", "npcs", "locations", "factions", "logs"]);

router.post("/generate-procedural", enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { category, name } = req.body || {};
    if (!VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ error: `Unknown category '${category}'` });
    }
    const entry = await generateProcedurally(worldId, category, { name });
    res.json({ preview: false, category, entry });
  } catch (err) {
    console.error("Procedural generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
