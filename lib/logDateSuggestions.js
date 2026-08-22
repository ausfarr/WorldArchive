// lib/logDateSuggestions.js
//
// Session Prep Companion, Phase 3, Section 6a -- "new event, no
// canonical date yet" handling. When a Log's resolvedDate concerns a
// specific existing entry (resolvedDateSubject) that has NO canonical
// date set yet for that field, this is that entry's first mention -- the
// log's resolved date becomes a SUGGESTED update (pending_entry_updates),
// never silently written onto the referenced entry. Entry-level date
// fields stay the sole source of truth; a Log only ever proposes.
//
// If the referenced entry ALREADY has a canonical date for that field,
// nothing happens here -- the canonical value already wins (this is what
// the cross-entry grounding in lib/dateContext.js/logContentPrompt.js is
// there to prevent the model from contradicting in the first place).

const { getEntry } = require("./entriesRepo");
const { DATE_FIELDS_BY_CATEGORY, formatWorldDate } = require("./calendar");
const { createPendingUpdate } = require("./pendingEntryUpdatesRepo");

const VALID_SUBJECT_CATEGORIES = ["factions", "npcs", "survivors", "items"];

// Validates a model-proposed resolvedDateSubject against the real
// archive -- never trusts a proposed id/field blind, same "reference
// real ids, never invent" discipline used everywhere else in this app.
// Returns null (silently, not an error) for anything that doesn't
// resolve -- an invalid subject just means no suggestion gets created,
// which is always a safe fallback.
async function validateResolvedDateSubject(worldId, subject) {
  if (!subject || !subject.category || !subject.entryId || !subject.dateField) return null;
  if (!VALID_SUBJECT_CATEGORIES.includes(subject.category)) return null;
  const validFields = DATE_FIELDS_BY_CATEGORY[subject.category] || [];
  if (!validFields.includes(subject.dateField)) return null;
  const entry = await getEntry(worldId, subject.category, subject.entryId);
  if (!entry) return null;
  return { category: subject.category, entryId: subject.entryId, dateField: subject.dateField, entry };
}

// Called after a Log is saved for real (new generation, fill, or
// regenerate-confirm) with an already-validated resolvedDate. Returns the
// created pending_entry_updates row, or null if nothing applied (no
// subject named, subject doesn't resolve, or the subject already has a
// canonical date for that field).
async function maybeCreateDateSuggestion(worldId, log, calendarConfig) {
  if (!log.resolvedDate || !log.resolvedDateSubject) return null;
  const subject = await validateResolvedDateSubject(worldId, log.resolvedDateSubject);
  if (!subject) return null;

  const existingRaw = subject.entry.raw || {};
  if (existingRaw[subject.dateField]) return null;

  const dateText = formatWorldDate(log.resolvedDate, calendarConfig);
  const deltaText = `Log "${log.name}" (id: ${log.id}) resolves a date for this entry's ${subject.dateField}: ${dateText}. Consider updating it to match.`;
  return createPendingUpdate(worldId, {
    entryId: subject.entryId,
    category: subject.category,
    suggestionType: "regenerate",
    deltaText,
    source: `log:${log.id}`
  });
}

module.exports = { maybeCreateDateSuggestion, validateResolvedDateSubject };
