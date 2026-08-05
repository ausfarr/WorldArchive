const express = require("express");
const { listEntries, getEntry, deleteEntry, patchEntryMeta } = require("../lib/entriesRepo");
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

// v0.9 Manual Mode -- saves a dragged pin position for a manually-created
// Location (see archive/map.html's drag-to-place flow, since manual
// Locations skip the AI vision-anchor pipeline entirely and have no
// other way onto the map). Stored in raw_json as manualMapPosition --
// canvas-space {x, y} in the same 1000x600 coordinate system
// archive/js/mapLayout.js's computeMapLayout already uses, NOT
// normalized 0-1 (that convention is only for the vision-detected
// faction anchors in routes/map.js). Works for ANY location, not just
// manually-created ones, in case Austin wants to let someone reposition
// an AI-placed pin later -- nothing here checks raw.createdManually.
router.patch("/entries/locations/:id/map-position", async (req, res) => {
  try {
    const { x, y } = req.body || {};
    if (typeof x !== "number" || typeof y !== "number") {
      return res.status(400).json({ error: "x and y must both be numbers." });
    }
    const updated = await patchEntryMeta(req.worldId, "locations", req.params.id, { manualMapPosition: { x, y } });
    res.json({ saved: true, id: req.params.id, manualMapPosition: updated.manualMapPosition });
  } catch (err) {
    console.error(`Saving map position (locations/${req.params.id}) failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
