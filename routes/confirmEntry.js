const express = require("express");
const {
  saveNpcEntry,
  saveEnemyEntry,
  saveItemEntry,
  saveSurvivorEntry,
  saveLogEntry,
  saveClassEntry,
  saveFactionEntry,
  saveLocationEntry,
  getPortraitUrl
} = require("../lib/fileWriter");
const { buildFactionRoundup } = require("../lib/factionRoundup");
const { syncReciprocalRelationships } = require("../lib/factionDeepLore");
const { getEntry } = require("../lib/entriesRepo");
const { checkEntryCap } = require("../middleware/enforceEntryCap");
const { withLock } = require("../lib/asyncLock");
const { getRuleset } = require("../lib/worldConfigRepo");
const { save5eEnemyEntry } = require("../lib/rulesets/5e/enemyRepo");
const { savePf2eEnemyEntry } = require("../lib/rulesets/pf2e/enemyRepo");

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
  classes: saveClassEntry,
  locations: saveLocationEntry
};

// Categories whose writer function accepts a third imageUrl argument
// (logs don't have portraits at all). Regenerate never touches images —
// without this, confirming a regenerate would silently overwrite a
// previously-working portrait's URL with nothing, reverting the dossier
// to the dead relative-path placeholder every single time (see this
// session's chat).
const HAS_PORTRAIT = {
  npcs: true,
  enemies: true,
  items: true,
  survivors: true,
  classes: true,
  locations: true
};

// Called after the user reviews a /generate-X preview response and clicks
// "Save This Version." Takes the exact `entry` object the preview returned
// and writes it for real — no re-generation happens here.
router.post("/confirm-entry", async (req, res) => {
  const worldId = req.worldId;
  try {
    const { category, entry } = req.body || {};
    if (!entry || !entry.id) {
      return res.status(400).json({ error: "Missing entry or entry.id" });
    }

    // v0.9 Manual Mode: this endpoint is now the creation point for
    // manually-made entries (see archive/js/render.js's
    // openManualCreateForm), not just edits/regenerate-confirms of
    // entries that already exist. Only a genuinely NEW row should count
    // against the entry cap -- an edit or a regenerate confirm targets
    // an entry id that's already in the table.
    //
    // The cap check AND the write below both run inside one per-world
    // lock (see lib/asyncLock.js) whenever this is a new entry --
    // without that, two concurrent confirm-entry calls for two different
    // new entries could both pass the count-check before either's write
    // actually landed, letting a world exceed its entry cap by more than
    // one. Cheap to hold for the whole handler here: unlike an
    // AI-generation route, there's no Claude/Gemini call left to make by
    // this point -- confirm-entry is a pure DB write.
    const alreadyExists = await getEntry(worldId, category, entry.id);
    const doConfirm = async () => {
      if (!alreadyExists) {
        const capResult = await checkEntryCap(worldId, req.userId);
        if (!capResult.allowed) {
          return {
            status: 403,
            body: {
              error: "entry_cap_reached",
              message: `You've reached the ${capResult.cap}-entry limit for this world. Subscribe for unlimited entries, or buy more from Settings.`,
              cap: capResult.cap,
              count: capResult.count
            }
          };
        }
      }

      if (category === "factions") {
        // Roundup is recomputed fresh at confirm-time rather than trusting
        // whatever was true when the preview was generated — it's cheap,
        // deterministic, and always-live by design (per factionRoundup.js),
        // so this is more correct than a stale snapshot if other entries
        // were generated in the gap between preview and confirm.
        if (!entry.factionKey) {
          return { status: 400, body: { error: "Faction entry is missing factionKey" } };
        }
        const roundupRows = await buildFactionRoundup(worldId, entry.factionKey);
        await saveFactionEntry(worldId, entry, roundupRows);
        await syncReciprocalRelationships(worldId, entry);
        return { status: 200, body: { saved: true, id: entry.id, category } };
      }

      // Multi-ruleset genericization: "enemies" is the one category so
      // far (Phase 3) with a per-ruleset writer instead of a single
      // fixed one -- WRITERS.enemies stays Echoes' saveEnemyEntry
      // UNCHANGED (see that map above) so this only branches away from
      // it for a ruleset that actually has its own enemy pipeline built.
      // Every other category keeps going through WRITERS exactly as
      // before this project.
      let writer = WRITERS[category];
      if (category === "enemies") {
        const ruleset = await getRuleset(worldId);
        if (ruleset === "5e") writer = save5eEnemyEntry;
        else if (ruleset === "pf2e") writer = savePf2eEnemyEntry;
      }
      if (!writer) {
        return { status: 400, body: { error: `Unknown category '${category}'` } };
      }

      const imageUrl = HAS_PORTRAIT[category] ? getPortraitUrl(worldId, entry.id) : undefined;
      await writer(worldId, entry, imageUrl);
      return { status: 200, body: { saved: true, id: entry.id, category } };
    };

    const result = alreadyExists ? await doConfirm() : await withLock(`entry-cap:${worldId}`, doConfirm);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Confirm-save failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
