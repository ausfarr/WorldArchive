const express = require("express");
const { listEntries, getEntry, deleteEntry } = require("../lib/entriesRepo");
const { deletePortrait } = require("../lib/fileWriter");

const router = express.Router();

// Closes the Phase 1 "frontend read path" gap -- archive/js/render.js
// now fetches from here instead of injecting <script src="manifest.js">
// / <script src="data/<id>.js"> tags. See multi_tenant_pivot_scope.md
// Section 5's "Known, deliberate simplifications" for the history of why
// this was deferred, and this session's addendum for it closing.

const VALID_CATEGORIES = new Set(["factions", "npcs", "enemies", "classes", "items", "logs", "survivors", "locations"]);

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

// Permanently deletes one entry (dossier page's "Delete This Entry"
// button) -- distinct from /api/world/delete, which wipes everything.
// Portrait removal is attempted for every category (not just the ones
// known to have one) since deletePortrait() is a harmless no-op for
// categories like logs/factions that never had one -- simpler than
// keeping a HAS_PORTRAIT map in sync here too (see confirmEntry.js for
// where that map does matter, because it distinguishes "never had a
// portrait" from "regenerate shouldn't touch an existing one").
router.delete("/entries/:category/:id", requireValidCategory, async (req, res) => {
  try {
    await deleteEntry(req.worldId, req.params.category, req.params.id);
    await deletePortrait(req.worldId, req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    console.error(`Deleting entry (${req.params.category}/${req.params.id}) failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
