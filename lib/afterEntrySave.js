// lib/afterEntrySave.js
//
// Shared "after an entry is saved" logic, extracted so every write path
// runs the same steps instead of each route keeping its own near-copy.
// Bug batch 1, Phase 1 (session_addendum_bug_batch_1.md): wizard-generated
// factions came out of the World Setup Wizard with an empty relationship
// graph because routes/wizardReview.js saved them straight through
// saveFactionEntry() and never ran any of this -- the graph only
// "fixed itself" once the DM edited and re-saved a faction through
// /confirm-entry, which did. Having ONE helper both paths call is what
// keeps that class of bug from recurring per-route.

const { getEntry } = require("./entriesRepo");
const { resolveReferencesForEntry, backfillReferencesFromNewEntry, ensureGhostPlaceholder } = require("./entryLinker");
const { syncReciprocalRelationships } = require("./factionDeepLore");
const { buildFactionRoundup } = require("./factionRoundup");
const { saveFactionEntry } = require("./fileWriter");
const { getCalendarConfig } = require("./worldConfigRepo");
const { createEntryDateEvents, createLogDateEvent } = require("./timelineEvents");

// Backward half of entry cross-linking (lib/entryLinker.js): patch every
// OTHER entry that names this one by a still-unresolved reference, then
// create locked ghost placeholders for any Category A names this entry
// itself couldn't resolve. Order matches routes/confirmEntry.js's
// original afterSave() exactly -- backfill first, then ghosts.
async function linkAfterSave(worldId, category, savedContent, unresolvedGhosts) {
  await backfillReferencesFromNewEntry(worldId, category, savedContent);
  for (const ghost of unresolvedGhosts || []) {
    await ensureGhostPlaceholder(worldId, ghost.category, ghost.name);
  }
}

// Bug batch 1, Phase 4: Timeline events for a save that did NOT go
// through /confirm-entry. Before this, lib/timelineEvents.js's
// createEntryDateEvents only ran from routes/confirmEntry.js, so every
// directly-saved entry -- a brand-new NPC/Item/Survivor/Faction from a
// generate route, a filled placeholder, a Campaign-module entry, a
// wizard faction -- never put its founding/birth/created date on the
// Timeline until the DM re-saved it by hand.
//   - Structured entry dates (createEntryDateEvents, deduped internally).
//   - For logs: the resolvedDate event (createLogDateEvent, Trigger 3),
//     which likewise only ever fired from /confirm-entry. Only called for
//     a brand-new log save, which happens once per log id.
// Never throws: the entry is already saved (and paid for) by the time
// this runs, so a Timeline hiccup is logged, not surfaced as a failed
// generation. calendarConfig may be passed when the caller already has
// it; otherwise it's read here.
async function recordTimelineForSave(worldId, category, savedContent, { priorEntry = null, calendarConfig } = {}) {
  try {
    const cfg = calendarConfig !== undefined ? calendarConfig : await getCalendarConfig(worldId);
    if (category === "logs") {
      await createLogDateEvent(worldId, savedContent);
      return;
    }
    await createEntryDateEvents(worldId, category, savedContent, priorEntry, cfg);
  } catch (err) {
    console.error(`Timeline events after saving ${category}/${savedContent && savedContent.id} failed:`, err && err.message);
  }
}

// The one "after save" hook for every write path OUTSIDE /confirm-entry
// (routes/generate*.js, lib/campaignEntryGenerators.js): cross-linking,
// then Timeline. Replaces ten near-identical local afterSave() copies,
// none of which had the Timeline step. /confirm-entry keeps its own
// afterSave() (it has extra log/regenerate triggers and needs the prior
// entry for change detection) but shares linkAfterSave() and the same
// deduped createEntryDateEvents().
async function afterEntrySave(worldId, category, savedContent, unresolvedGhosts, options = {}) {
  await linkAfterSave(worldId, category, savedContent, unresolvedGhosts);
  await recordTimelineForSave(worldId, category, savedContent, options);
}

// Post-pass for routes/wizardReview.js's /wizard/upgrade-factions, run
// once every faction's Deep Lore generation has settled. Deliberately
// SEQUENTIAL: the generations themselves still run in parallel (they
// only ever write their own row), but syncReciprocalRelationships()
// read-modify-writes OTHER factions' relationships, and running that
// concurrently could lose an update (see that function's header comment
// in lib/factionDeepLore.js). One faction at a time means each step
// reads the row as the previous faction's step left it.
//
// Per faction, mirrors /confirm-entry's faction branch in the same order:
// resolve forward references (and persist the resolved toIds -- that's
// what buildEntryGraph reads), save, sync reciprocals, then backfill +
// ghosts. The row is re-read fresh each time rather than reusing the
// object the generation returned, because an EARLIER faction's reciprocal
// sync or backfill in this same loop may already have written to it --
// saving the stale in-memory copy would silently drop that write.
//
// Per-faction failures are logged and collected, never thrown: the
// factions themselves already saved successfully, so a linking hiccup on
// one shouldn't fail the whole review step or stop the others linking.
//
// Phase 4 adds the Timeline step (recordTimelineForSave) at the end of
// each iteration, still sequential, so a wizard faction with a
// foundingDate is on the Timeline the moment the wizard finishes.
async function linkWizardFactionsSequentially(worldId, factionIds) {
  const linked = [];
  const failed = [];
  const calendarConfig = await getCalendarConfig(worldId);
  for (const id of factionIds) {
    try {
      const row = await getEntry(worldId, "factions", id);
      // No Deep Lore content to link (deleted meanwhile, or still a
      // wizard stub with no raw) -- nothing to do, not a failure.
      if (!row || !row.raw || !row.raw.corePhilosophy) continue;

      const linkResult = await resolveReferencesForEntry(worldId, "factions", row.raw);
      const faction = linkResult.raw;
      const factionKey = faction.factionKey || row.faction || row.id;
      const roundupRows = await buildFactionRoundup(worldId, factionKey);
      await saveFactionEntry(worldId, { ...faction, factionKey }, roundupRows);
      await syncReciprocalRelationships(worldId, faction);
      await linkAfterSave(worldId, "factions", faction, linkResult.unresolvedGhosts);
      await recordTimelineForSave(worldId, "factions", faction, { calendarConfig });
      linked.push(id);
    } catch (err) {
      failed.push(id);
      console.error(`Wizard faction linking failed for '${id}':`, err && err.message);
    }
  }
  return { linked, failed };
}

module.exports = { linkAfterSave, afterEntrySave, recordTimelineForSave, linkWizardFactionsSequentially };
