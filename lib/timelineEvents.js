// lib/timelineEvents.js
//
// Session Prep Companion, Phase 6 -- the three deterministic Timeline
// triggers (scope doc Section 5a), all called from routes/confirmEntry.js's
// shared afterSave() hook (the one write path every confirm/manual-edit/
// manual-create already goes through). No AI calls anywhere in this file
// -- Timeline events are pure aggregation of what a confirm-time write
// already established, same "zero model cost at read/write time" as
// lib/factionRoundup.js.

const { createTimelineEvent } = require("./timelineRepo");
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
async function createEntryDateEvents(worldId, category, entry, priorEntry, calendarConfig) {
  const fields = DATE_FIELDS_BY_CATEGORY[category];
  if (!fields || !fields.length || category === "logs") return [];

  const created = [];
  for (const field of fields) {
    const value = entry[field];
    if (!value) continue;
    if (!validateWorldDate(value, calendarConfig).valid) continue;
    const priorValue = priorEntry ? priorEntry[field] : null;
    if (worldDatesEqual(value, priorValue)) continue;

    const label = DATE_FIELD_LABELS[field] || field;
    const event = await createTimelineEvent(worldId, {
      sourceType: "entry_date",
      sourceId: entry.id,
      sourceCategory: category,
      sessionNumber: null,
      worldDate: value,
      summary: `${label}: ${entry.name}`,
      linkedEntryIds: [{ category, entryId: entry.id }],
      linkedFactionIds: entry.faction ? [entry.faction] : []
    });
    created.push(event);
  }
  return created;
}

module.exports = { createChronicleEvent, createLogDateEvent, createRegenerateEvent, createEntryDateEvents };
