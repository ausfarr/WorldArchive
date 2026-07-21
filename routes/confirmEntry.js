const express = require("express");
const path = require("path");
const {
  writeNpcDataFile, appendToManifest,
  writeEnemyDataFile, appendToEnemyManifest,
  writeItemDataFile, appendToItemManifest,
  writeSurvivorDataFile, appendToSurvivorManifest,
  writeLogDataFile, appendToLogManifest,
  writeClassDataFile, appendToClassManifest,
  writeFactionDataFile, updateFactionManifest
} = require("../lib/fileWriter");
const { buildFactionRoundup } = require("../lib/factionRoundup");

const router = express.Router();
const ARCHIVE_ROOT = path.join(__dirname, "..", "archive");

// Shared write path for every "regenerate" preview across all categories
// except factions (handled separately below, since it needs a freshly
// computed Roundup rather than a stored writer pair).
const WRITERS = {
  npcs: { data: writeNpcDataFile, manifest: appendToManifest },
  enemies: { data: writeEnemyDataFile, manifest: appendToEnemyManifest },
  items: { data: writeItemDataFile, manifest: appendToItemManifest },
  survivors: { data: writeSurvivorDataFile, manifest: appendToSurvivorManifest },
  logs: { data: writeLogDataFile, manifest: appendToLogManifest },
  classes: { data: writeClassDataFile, manifest: appendToClassManifest }
};

// Called after the user reviews a /generate-X preview response and clicks
// "Save This Version." Takes the exact `entry` object the preview returned
// and writes it for real — no re-generation happens here.
router.post("/confirm-entry", (req, res) => {
  try {
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
      const roundupRows = buildFactionRoundup(ARCHIVE_ROOT, entry.factionKey);
      writeFactionDataFile(ARCHIVE_ROOT, entry, roundupRows);
      updateFactionManifest(ARCHIVE_ROOT, entry);
      return res.json({ saved: true, id: entry.id, category });
    }

    const writer = WRITERS[category];
    if (!writer) {
      return res.status(400).json({ error: `Unknown category '${category}'` });
    }

    writer.data(ARCHIVE_ROOT, entry);
    writer.manifest(ARCHIVE_ROOT, entry);
    res.json({ saved: true, id: entry.id, category });
  } catch (err) {
    console.error("Confirm-save failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
