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
  saveSessionPacketEntry,
  getPortraitUrl
} = require("../lib/fileWriter");
const { buildFactionRoundup } = require("../lib/factionRoundup");
const { syncReciprocalRelationships } = require("../lib/factionDeepLore");
const { getEntry } = require("../lib/entriesRepo");
const { checkEntryCap } = require("../middleware/enforceEntryCap");
const { withLock } = require("../lib/asyncLock");
const { getRuleset, getCalendarConfig } = require("../lib/worldConfigRepo");
const { sanitizeEntryDateFields } = require("../lib/calendar");
const { save5eEnemyEntry } = require("../lib/rulesets/5e/enemyRepo");
const { save5eSpellEntry } = require("../lib/rulesets/5e/spellRepo");
const { save5eClassEntry } = require("../lib/rulesets/5e/classRepo");
const { saveGenericClassEntry } = require("../lib/rulesets/generic/classRepo");
const { save5eItemEntry } = require("../lib/rulesets/5e/itemRepo");
const { saveGenericItemEntry } = require("../lib/rulesets/generic/itemRepo");
const { save5eSurvivorEntry } = require("../lib/rulesets/5e/survivorRepo");
const { saveGenericSurvivorEntry } = require("../lib/rulesets/generic/survivorRepo");
const { saveGenericEnemyEntry } = require("../lib/rulesets/generic/enemyRepo");
const { getGenericSystem } = require("../lib/worldConfigRepo");
const { resolveReferencesForEntry, backfillReferencesFromNewEntry, ensureGhostPlaceholder } = require("../lib/entryLinker");
const { maybeCreateDateSuggestion, validateResolvedDateSubject } = require("../lib/logDateSuggestions");
const { createChronicleEvent, createLogDateEvent, createRegenerateEvent } = require("../lib/timelineEvents");

const router = express.Router();

// Entry cross-linking (Phase 2) -- see lib/entryLinker.js. Called after
// every successful save below (manual create, edit, and regenerate-
// confirm all land here -- the single shared write path). Also handles
// Session Prep Companion, Phase 3, Section 6a's cross-entry date
// suggestion for logs (lib/logDateSuggestions.js), and Phase 6's three
// Timeline triggers (lib/timelineEvents.js) -- Triggers 1/3 only apply
// to logs, Trigger 2 (timelineOptIn) applies to any category since a
// Regenerate/status-flip can happen on any of them.
async function afterSave(worldId, category, savedContent, unresolvedGhosts, calendarConfig, timelineOptIn) {
  await backfillReferencesFromNewEntry(worldId, category, savedContent);
  for (const ghost of unresolvedGhosts || []) {
    await ensureGhostPlaceholder(worldId, ghost.category, ghost.name);
  }
  if (category === "logs") {
    await maybeCreateDateSuggestion(worldId, savedContent, calendarConfig);
    await createChronicleEvent(worldId, savedContent);
    await createLogDateEvent(worldId, savedContent);
  }
  await createRegenerateEvent(worldId, category, savedContent, timelineOptIn, calendarConfig);
}

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
  locations: saveLocationEntry,
  // Session Prep Companion, Phase 4 -- see routes/generateSessionPacket.js.
  "session-packets": saveSessionPacketEntry,
  // "spells" -- only 5e has a `spells` registry entry today. Echoes/
  // generic worlds can never reach this writer since
  // requireCategoryAvailable already turned their /generate-spell
  // request away with a 501 (see lib/rulesets/index.js).
  spells: save5eSpellEntry
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
    const { category, entry: rawEntry, timelineEvent: timelineOptIn } = req.body || {};
    if (!rawEntry || !rawEntry.id) {
      return res.status(400).json({ error: "Missing entry or entry.id" });
    }

    // Forward-resolve before anything else touches this entry -- both a
    // manual-create and an edit/regenerate-confirm can land here with
    // references that are now resolvable against the archive even if
    // they weren't at the original /generate-X call (see lib/entryLinker.js).
    const linkResult = await resolveReferencesForEntry(worldId, category, rawEntry);
    // Session Prep Companion, Phase 3 -- code validates before write on
    // EVERY path that reaches this shared endpoint (regenerate-confirm,
    // manual edit, manual create), not just at generation time -- see
    // lib/calendar.js's sanitizeEntryDateFields for why this is the one
    // place that guarantee can be made for all three uniformly.
    const calendarConfig = await getCalendarConfig(worldId);
    const entry = sanitizeEntryDateFields(category, linkResult.raw, calendarConfig);
    // resolvedDateSubject isn't a date-shaped field itself (sanitizeEntryDateFields
    // only cleans entry.resolvedDate above) -- validate it separately against
    // the real archive so a hand-edited/malformed subject can't reach
    // lib/logDateSuggestions.js's afterSave hook below.
    if (category === "logs") {
      entry.resolvedDateSubject = entry.resolvedDate ? (await validateResolvedDateSubject(worldId, entry.resolvedDateSubject) ? entry.resolvedDateSubject : null) : null;
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
        await afterSave(worldId, category, entry, linkResult.unresolvedGhosts, calendarConfig, timelineOptIn);
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
        else if (ruleset === "generic") {
          // saveGenericEnemyEntry() needs this world's generic_system_json
          // as an extra argument (attribute/derived-stat definitions
          // aren't fixed, unlike every other ruleset's writer) -- doesn't
          // fit the plain writer(worldId, entry, imageUrl) shape below,
          // so it's called directly here instead of assigned to `writer`.
          const genericSystem = await getGenericSystem(worldId);
          await saveGenericEnemyEntry(worldId, entry, genericSystem, undefined);
          await afterSave(worldId, category, entry, linkResult.unresolvedGhosts, calendarConfig, timelineOptIn);
          return { status: 200, body: { saved: true, id: entry.id, category } };
        }
      }
      if (category === "classes") {
        const ruleset = await getRuleset(worldId);
        if (ruleset === "5e") writer = save5eClassEntry;
        else if (ruleset === "generic") {
          // Same extra-argument shape as enemies' generic branch above --
          // saveGenericClassEntry() needs this world's generic_system_json
          // to resolve keyAttribute's display label.
          const genericSystem = await getGenericSystem(worldId);
          await saveGenericClassEntry(worldId, entry, genericSystem, undefined);
          await afterSave(worldId, category, entry, linkResult.unresolvedGhosts, calendarConfig, timelineOptIn);
          return { status: 200, body: { saved: true, id: entry.id, category } };
        }
      }
      if (category === "items") {
        const ruleset = await getRuleset(worldId);
        if (ruleset === "5e") writer = save5eItemEntry;
        else if (ruleset === "generic") {
          const genericSystem = await getGenericSystem(worldId);
          await saveGenericItemEntry(worldId, entry, genericSystem, undefined);
          await afterSave(worldId, category, entry, linkResult.unresolvedGhosts, calendarConfig, timelineOptIn);
          return { status: 200, body: { saved: true, id: entry.id, category } };
        }
      }
      if (category === "survivors") {
        const ruleset = await getRuleset(worldId);
        if (ruleset === "5e") writer = save5eSurvivorEntry;
        else if (ruleset === "generic") {
          const genericSystem = await getGenericSystem(worldId);
          await saveGenericSurvivorEntry(worldId, entry, genericSystem, undefined);
          await afterSave(worldId, category, entry, linkResult.unresolvedGhosts, calendarConfig, timelineOptIn);
          return { status: 200, body: { saved: true, id: entry.id, category } };
        }
      }
      if (!writer) {
        return { status: 400, body: { error: `Unknown category '${category}'` } };
      }

      const imageUrl = HAS_PORTRAIT[category] ? getPortraitUrl(worldId, entry.id) : undefined;
      await writer(worldId, entry, imageUrl);
      await afterSave(worldId, category, entry, linkResult.unresolvedGhosts, calendarConfig, timelineOptIn);
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
