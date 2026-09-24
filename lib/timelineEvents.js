// lib/timelineEvents.js
//
// Session Prep Companion, Phase 6 -- the three deterministic Timeline
// triggers (scope doc Section 5a), all called from routes/confirmEntry.js's
// shared afterSave() hook (the one write path every confirm/manual-edit/
// manual-create already goes through). No AI calls anywhere in this file
// -- Timeline events are pure aggregation of what a confirm-time write
// already established, same "zero model cost at read/write time" as
// lib/factionRoundup.js.

const { createTimelineEvent, listEntryDateEvents, TimelineSourceTypeNotAllowedError } = require("./timelineRepo");

// One warning per process when the entry_date source type isn't allowed
// yet (migration 036/039 not run) -- see TimelineSourceTypeNotAllowedError.
let warnedEntryDateMigration = false;
function warnEntryDateMigrationOnce(err) {
  if (warnedEntryDateMigration) return;
  warnedEntryDateMigration = true;
  console.warn(`Timeline entry_date events skipped: ${err.message}`);
}
const { listEntries } = require("./entriesRepo");
const { withLock } = require("./asyncLock");
const { validateResolvedDateSubject } = require("./logDateSuggestions");
const { validateWorldDate, DATE_FIELDS_BY_CATEGORY, DATE_FIELD_LABELS, worldDatesEqual } = require("./calendar");

// Trigger 1: a Session Chronicle (Phase 5) was just confirmed. Dated to
// its own in-world date -- always has a real sessionNumber, unlike
// Triggers 2/3 below.
async function createChronicleEvent(worldId, log) {
  const chronicle = log.sessionChronicle;
  if (!chronicle) return null;
  const linkedEntryIds = log.locationId ? [{ category: "locations", entryId: log.locationId }] : [];
  const linkedFactionIds = log.faction ? [log.faction] : [];
  return createTimelineEvent(worldId, {
    sourceType: "chronicle",
    sourceId: log.id,
    sourceCategory: "logs",
    sessionNumber: chronicle.sessionNumber,
    worldDate: chronicle.worldDate,
    summary: log.designNotes || log.name,
    linkedEntryIds,
    linkedFactionIds
  });
}

// Trigger 3: a Log (NOT a Chronicle -- Trigger 1 above already covers
// those) was confirmed with a resolvedDate (Phase 3). Per Section 6a's
// cross-entry rule, the CANONICAL date on the referenced entry (if
// resolvedDateSubject names one that already has it set) wins over the
// log's own resolvedDate -- the log's date only applies when nothing
// canonical exists yet for that fact.
async function createLogDateEvent(worldId, log) {
  if (log.sessionChronicle) return null;
  if (!log.resolvedDate) return null;

  let worldDate = log.resolvedDate;
  const linkedEntryIds = [];
  if (log.locationId) linkedEntryIds.push({ category: "locations", entryId: log.locationId });

  if (log.resolvedDateSubject) {
    const subject = await validateResolvedDateSubject(worldId, log.resolvedDateSubject);
    if (subject) {
      linkedEntryIds.push({ category: subject.category, entryId: subject.entryId });
      const canonical = (subject.entry.raw || {})[subject.dateField];
      if (canonical) worldDate = canonical; // canonical already-set date wins, per Section 6a
    }
  }

  return createTimelineEvent(worldId, {
    sourceType: "log_date",
    sourceId: log.id,
    sourceCategory: "logs",
    sessionNumber: null,
    worldDate,
    summary: log.designNotes || log.name,
    linkedEntryIds,
    linkedFactionIds: log.faction ? [log.faction] : []
  });
}

// Trigger 2: a plain Regenerate (or, once Phase 7 adds status fields, a
// status-flip) confirm where the DM opted in via the "log this to the
// Timeline?" toggle (see archive/js/render.js's showRegeneratePreview).
// timelineOptIn is `{ summary, worldDate }` read straight from
// req.body.timelineEvent -- entirely absent/undefined for every confirm
// that didn't check the toggle, which is the normal case for most
// content Regenerates per the scope doc ("off for plain content
// Regenerates" by default).
async function createRegenerateEvent(worldId, category, entry, timelineOptIn, calendarConfig) {
  if (!timelineOptIn || !timelineOptIn.summary) return null;

  const proposedDate = timelineOptIn.worldDate;
  const proposedValid = proposedDate && validateWorldDate(proposedDate, calendarConfig).valid;
  const current = calendarConfig && calendarConfig.current_date;
  const fallbackDate = current ? { year: current.year, monthIndex: current.month_index, day: current.day } : null;
  const worldDate = proposedValid ? proposedDate : fallbackDate;
  if (!worldDate) return null; // no calendar configured yet -- nothing sensible to date this with

  return createTimelineEvent(worldId, {
    sourceType: "regenerate",
    sourceId: entry.id,
    sourceCategory: category,
    sessionNumber: null,
    worldDate,
    summary: timelineOptIn.summary,
    linkedEntryIds: [{ category, entryId: entry.id }],
    linkedFactionIds: entry.faction ? [entry.faction] : []
  });
}

// Trigger 4: any structured entry-level date field (foundingDate/
// birthDate/appointedDate/deathDate/createdDate/discoveredDate -- see
// lib/calendar.js's DATE_FIELDS_BY_CATEGORY) that's newly set or
// changed on this save auto-creates its own Timeline event, no DM
// opt-in required -- same "auto, don't ask" precedent Phase 7 already
// set for status flips. Fires on every write path (new generation,
// regenerate, manual edit) since all three land here via routes/
// confirmEntry.js's shared afterSave() hook.
//
// Deliberately excludes `logs` -- resolvedDate already has its own
// richer Trigger 3 (createLogDateEvent above, with cross-entry
// "canonical date wins" resolution) that a naive per-field change
// check would either duplicate or contradict.
//
// One event PER changed field, not one bundled event for the whole
// save -- an NPC that gets both birthDate and deathDate set in the same
// save represents two distinct historical facts at two different
// world-dates, so they're two separate Timeline entries. A field that's
// unchanged from `priorEntry` (a regenerate that kept the same date, or
// a save that never touched that field) is skipped -- without that
// guard, every single regenerate would re-fire an identical event for
// every already-set date field. A date CHANGING to a different value
// (a DM correcting a typo'd year) still fires a new event rather than
// updating the old one in place -- timeline_events is append-only by
// design (see lib/timelineRepo.js's own header comment), consistent
// with every other trigger here never updating/deleting a prior event.
//
// Bug batch 1, Phase 4: DEDUPED, enforced here rather than trusted to
// callers, now that this runs from every save path (the generate routes,
// the wizard, /confirm-entry) plus backfillEntryDateEvents() below. An
// event is skipped if one already exists with the same key:
//   source_category + source_id + field label + world_date
// e.g. "factions|the-iron-pact|Founded|1400-3-12". Deliberately NOT the
// summary text itself: summary embeds the entry's name ("Founded: The
// Iron Pact"), so a rename would otherwise make the backfill add a
// second event for the same fact. The field label is recovered from the
// stored summary's "<Label>: " prefix, which every entry_date event has
// had since Phase 3 introduced them. Category is in the key because entry
// ids are only unique per category.
//
// Consequence worth knowing: a date changed A -> B -> A doesn't create a
// second "A" event (one already exists) -- the append-only record still
// has both A and B.
//
// Check-then-insert runs under withLock(`timeline-entry-date:${worldId}`)
// so two concurrent saves of the same entry (or a save racing the
// backfill) can't both miss and both insert -- same single-process
// tradeoff as every other withLock() call site (lib/asyncLock.js).
function entryDateEventKey(category, entryId, label, worldDate) {
  const d = worldDate || {};
  return `${category}|${entryId}|${label}|${d.year}-${d.monthIndex}-${d.day}`;
}

function keyOfStoredEvent(event) {
  const colon = (event.summary || "").indexOf(":");
  const label = colon > 0 ? event.summary.slice(0, colon) : event.summary;
  return entryDateEventKey(event.sourceCategory, event.sourceId, label, event.worldDate);
}

async function createEntryDateEvents(worldId, category, entry, priorEntry, calendarConfig) {
  const fields = DATE_FIELDS_BY_CATEGORY[category];
  if (!fields || !fields.length || category === "logs" || !entry || !entry.id) return [];
  return withLock(`timeline-entry-date:${worldId}`, async () => {
    const existingKeys = new Set(
      (await listEntryDateEvents(worldId, { category, entryId: entry.id })).map(keyOfStoredEvent)
    );
    const created = [];
    for (const field of fields) {
      const value = entry[field];
      if (!value) continue;
      if (!validateWorldDate(value, calendarConfig).valid) continue;
      const priorValue = priorEntry ? priorEntry[field] : null;
      if (worldDatesEqual(value, priorValue)) continue;
      const label = DATE_FIELD_LABELS[field] || field;
      const key = entryDateEventKey(category, entry.id, label, value);
      if (existingKeys.has(key)) continue;
      let event;
      try {
        event = await createTimelineEvent(worldId, {
        sourceType: "entry_date",
        sourceId: entry.id,
        sourceCategory: category,
        sessionNumber: null,
        worldDate: value,
        summary: `${label}: ${entry.name || entry.id}`,
        linkedEntryIds: [{ category, entryId: entry.id }],
        linkedFactionIds: entry.faction ? [entry.faction] : []
        });
      } catch (err) {
        // Migration not run: the entry is already saved -- skip the
        // Timeline write rather than failing the whole save (it used to
        // turn /confirm-entry into a 500). Sync timeline fills these in
        // once the migration is applied.
        if (err instanceof TimelineSourceTypeNotAllowedError) { warnEntryDateMigrationOnce(err); return created; }
        throw err;
      }
      existingKeys.add(key);
      created.push(event);
    }
    return created;
  });
}

// Bug batch 1, Phase 4: brings the Timeline up to date with every entry's
// CURRENT structured date fields -- for entries saved before Phase 4 put
// createEntryDateEvents on every save path, and for worlds whose calendar
// was set up after their entries got dates. Run automatically after every
// calendar save (routes/wizardCalendar.js) and on demand from the
// Timeline page's "Sync timeline" button (routes/timeline.js).
//
// ADDITIVE ONLY: never edits or deletes an event. Idempotent by the same
// key createEntryDateEvents enforces, under the same lock, so running it
// twice creates nothing the second time.
//
// Returns { created, alreadyPresent, skippedInvalid, noCalendar, migrationRequired }:
//   skippedInvalid counts date values that don't validate against the
//   current calendar (out-of-range month/day, or outside validateWorldDate's
//   year bounds) -- including every dated field when there's no calendar.
async function backfillEntryDateEvents(worldId, calendarConfig) {
  const categories = Object.keys(DATE_FIELDS_BY_CATEGORY).filter((c) => c !== "logs");
  const counts = { created: 0, alreadyPresent: 0, skippedInvalid: 0, noCalendar: !calendarConfig, migrationRequired: false };
  const entryLists = await Promise.all(categories.map((c) => listEntries(worldId, c)));

  await withLock(`timeline-entry-date:${worldId}`, async () => {
    const existingKeys = new Set((await listEntryDateEvents(worldId)).map(keyOfStoredEvent));
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      for (const row of entryLists[i]) {
        const raw = row.raw || {};
        for (const field of DATE_FIELDS_BY_CATEGORY[category]) {
          const value = raw[field];
          if (!value) continue;
          if (!validateWorldDate(value, calendarConfig).valid) { counts.skippedInvalid++; continue; }
          const label = DATE_FIELD_LABELS[field] || field;
          const key = entryDateEventKey(category, row.id, label, value);
          if (existingKeys.has(key)) { counts.alreadyPresent++; continue; }
          if (counts.migrationRequired) continue; // already known to fail -- keep counting, stop writing
          try {
            await createTimelineEvent(worldId, {
            sourceType: "entry_date",
            sourceId: row.id,
            sourceCategory: category,
            sessionNumber: null,
            worldDate: value,
            summary: `${label}: ${row.name || row.id}`,
            linkedEntryIds: [{ category, entryId: row.id }],
            linkedFactionIds: row.faction ? [row.faction] : []
            });
          } catch (err) {
            if (err instanceof TimelineSourceTypeNotAllowedError) { warnEntryDateMigrationOnce(err); counts.migrationRequired = true; continue; }
            throw err;
          }
          existingKeys.add(key);
          counts.created++;
        }
      }
    }
  });
  return counts;
}

module.exports = { createChronicleEvent, createLogDateEvent, createRegenerateEvent, createEntryDateEvents, backfillEntryDateEvents, entryDateEventKey };
