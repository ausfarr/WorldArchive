const express = require("express");
const { listEntries, getEntry } = require("../lib/entriesRepo");

const router = express.Router();

// Closes the Phase 1 "frontend read path" gap -- archive/js/render.js
// now fetches from here instead of injecting <script src="manifest.js">
// / <script src="data/<id>.js"> tags. See multi_tenant_pivot_scope.md
// Section 5's "Known, deliberate simplifications" for the history of why
// this was deferred, and this session's addendum for it closing.

const VALID_CATEGORIES = new Set(["factions", "npcs", "enemies", "classes", "items", "logs", "survivors"]);

function requireValidCategory(req, res, next) {
  if (!VALID_CATEGORIES.has(req.params.category)) {
    return res.status(400).json({ error: `Unknown category '${req.params.category}'.` });
  }
  next();
}

// Replaces {category}/manifest.js -- returns the array a category index
// page renders into its entry-grid.
router.get("/entries/:category", requireValidCategory, async (req, res) => {
  try {
    const entries = await listEntries(req.worldId, req.params.category);
    res.json({ entries });
  } catch (err) {
    console.error(`Loading entries (${req.params.category}) failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Replaces {category}/data/{id}.js -- returns the single full entry a
// dossier page renders.
router.get("/entries/:category/:id", requireValidCategory, async (req, res) => {
  try {
    const entry = await getEntry(req.worldId, req.params.category, req.params.id);
    if (!entry) {
      return res.status(404).json({ error: "Entry not found." });
    }
    res.json({ entry });
  } catch (err) {
    console.error(`Loading entry (${req.params.category}/${req.params.id}) failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
