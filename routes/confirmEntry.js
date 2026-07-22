const express = require("express");
const {
  saveNpcEntry,
  saveEnemyEntry,
  saveItemEntry,
  saveSurvivorEntry,
  saveLogEntry,
  saveClassEntry,
  saveFactionEntry
} = require("../lib/fileWriter");
const { buildFactionRoundup } = require("../lib/factionRoundup");

const router = express.Router();

// Shared write path for every "regenerate" preview across all categories
// except factions (handled separately below, since it needs a freshly
// computed Roundup rather than a stored writer).
const WRITERS = {
  npcs: saveNpcEntry,
  enemies: saveEnemyEntry,
  items: saveItemEntry,
  survivors: saveSurvivorEntry,
  logs: saveLogEntry,
  classes: saveClassEntry
};

// Called after the user reviews a /generate-X preview response and clicks
// "Save This Version." Takes the exact `entry` object the preview returned
// and writes it for real — no re-generation happens here.
router.post("/confirm-entry", async (req, res) => {
  try {
    const worldId = req.worldId;
    const { category, entry } = req.body || {};
    if (!entry || !entry.id) {
      return res.status(400).json({ error: "Missing entry or entry.id" });
    }

    if (category === "factions") {
      // Roundup is recomputed fresh at confirm-time rather than trusting
      // whatever was true when the preview was generated — it's cheap,
      // deterministic, and always-live by design (per factionRoundup.js),
      // so this is more correct than a stale snapshot if other entries
      // were generated in the gap between preview and confirm.
      if (!entry.factionKey) {
        return res.status(400).json({ error: "Faction entry is missing factionKey" });
      }
      const roundupRows = await buildFactionRoundup(worldId, entry.factionKey);
      await saveFactionEntry(worldId, entry, roundupRows);
      return res.json({ saved: true, id: entry.id, category });
    }

    const writer = WRITERS[category];
    if (!writer) {
      return res.status(400).json({ error: `Unknown category '${category}'` });
    }

    await writer(worldId, entry);
    res.json({ saved: true, id: entry.id, category });
  } catch (err) {
    console.error("Confirm-save failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
