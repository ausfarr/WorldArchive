// lib/calendar.js
//
// Session Prep Companion, Phase 2 (minimal calendar) -- see
// session_prep_companion_scope.md Section 4a-i. Two pure, deterministic
// helpers every later phase (Chronicle confirm, Timeline dating, Phase
// 3's entry-level date fields, Phase 8's calendar page) calls into.
//
// WORLD DATE SHAPE (canonical, used everywhere a date is stored against a
// calendar_config -- Chronicle dates, Timeline events, Phase 3's
// founding_date/birth_date/etc. fields): { year: number, monthIndex:
// number, day: number }, month-zero-indexed into calendar_config.months.
// Matches calendar_config.current_date's own field shape (snake_case on
// the stored JSON column per the scope doc's exact spec -- { year,
// month_index, day } -- camelCased here like every other JS object in
// this codebase; see getCalendarConfig()'s call sites for the
// snake_case<->camelCase boundary).
//
// CALENDAR CONFIG SHAPE (world_config.calendar_config, see
// migrations/030_calendar_config.sql):
//   {
//     months: [{ name: string, days: number }, ...],   // ordered, DM-defined
//     days_per_week: number,
//     weekday_names: [string, ...] | null,              // optional
//     era_name: string,
//     current_date: { year: number, month_index: number, day: number }
//   }

// Model writes narrative, code validates structure/math -- this file is
// the "code" half for every calendar date in the app; nothing here ever
// trusts a raw model-proposed date into storage without passing through
// validateWorldDate() first (see prompts/*'s date fields once Phase 3
// lands, and routes/wizardCalendar.js's generate-for-me endpoint, which
// still lets the DM review/edit before saving).

function ordinal(n) {
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// Renders a WorldDate as a DM-facing string, e.g. "the 4th of Frostmere,
// Year 812 of the Age of Ash". Falls back gracefully at every level --
// an unset/malformed calendarConfig, or a monthIndex outside its months
// array, still produces something readable rather than throwing, since
// this is called from render paths (Chronicle headers, Timeline entries)
// that shouldn't hard-fail on a legacy/incomplete world.
function formatWorldDate(date, calendarConfig) {
  if (!date || typeof date.year !== "number") return "(date unknown)";

  const months = (calendarConfig && calendarConfig.months) || [];
  const month = months[date.monthIndex];
  const monthName = month ? month.name : `Month ${(date.monthIndex ?? 0) + 1}`;
  const eraName = calendarConfig && calendarConfig.era_name;

  const dayPart = typeof date.day === "number" ? `the ${ordinal(date.day)} of ` : "";
  const eraPart = eraName ? ` of the ${eraName}` : "";
  return `${dayPart}${monthName}, Year ${date.year}${eraPart}`;
}

// How far before/after calendar_config.current_date a proposed WorldDate
// may fall. Judgment call, documented here rather than left implicit:
//   - 1000 years BEFORE current_date, generously wide on purpose --
//     Phase 3's whole point is letting pre-campaign history (a faction
//     founding, an old NPC's birth) predate the campaign by centuries,
//     and there's no mechanical reason to cap that tighter.
//   - 5 years AFTER current_date, deliberately tight -- nothing in this
//     tool's model (a played session advances the clock by days/weeks at
//     a stretch, not years) should ever need to date something far in
//     the world's future; this bound exists to catch an obviously wrong
//     value (a typo'd year, a model hallucinating a distant future date)
//     rather than to model actual forward-looking uncertainty.
const MAX_YEARS_BEFORE_CURRENT = 1000;
const MAX_YEARS_AFTER_CURRENT = 5;

// Validates a WorldDate against a calendar_config: correct month index,
// day within that month's actual length, and within the before/after
// bounds above relative to current_date. Returns { valid: true } or
// { valid: false, reason: string } -- never throws, since every caller
// needs to show the reason to a DM (a rejected AI-proposed date, a
// rejected manual edit) rather than crash.
function validateWorldDate(date, calendarConfig) {
  if (!calendarConfig || !Array.isArray(calendarConfig.months) || calendarConfig.months.length === 0) {
    return { valid: false, reason: "This world has no calendar configured yet." };
  }
  if (!date || typeof date !== "object") {
    return { valid: false, reason: "Missing date." };
  }
  const { year, monthIndex, day } = date;
  if (!Number.isInteger(year)) {
    return { valid: false, reason: "Year must be a whole number." };
  }
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= calendarConfig.months.length) {
    return { valid: false, reason: `monthIndex must be between 0 and ${calendarConfig.months.length - 1}.` };
  }
  const month = calendarConfig.months[monthIndex];
  if (!Number.isInteger(day) || day < 1 || day > month.days) {
    return { valid: false, reason: `day must be between 1 and ${month.days} for ${month.name}.` };
  }

  const current = calendarConfig.current_date;
  if (current && Number.isInteger(current.year)) {
    if (year < current.year - MAX_YEARS_BEFORE_CURRENT) {
      return { valid: false, reason: `Year is more than ${MAX_YEARS_BEFORE_CURRENT} years before the current world date (${current.year}) -- that's likely a mistake.` };
    }
    if (year > current.year + MAX_YEARS_AFTER_CURRENT) {
      return { valid: false, reason: `Year is more than ${MAX_YEARS_AFTER_CURRENT} years after the current world date (${current.year}) -- that's likely a mistake.` };
    }
  }

  return { valid: true };
}

// Session Prep Companion, Phase 8 -- validates a recurring (year-less)
// { monthIndex, day } pair for calendar_notable_dates rows (migrations/035).
// Same monthIndex/day bounds checking as validateWorldDate above, minus
// the year field and its before/after-current_date bounds, which don't
// apply to a date that recurs every year rather than pinning one.
function validateMonthDay(monthIndex, day, calendarConfig) {
  if (!calendarConfig || !Array.isArray(calendarConfig.months) || calendarConfig.months.length === 0) {
    return { valid: false, reason: "This world has no calendar configured yet." };
  }
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= calendarConfig.months.length) {
    return { valid: false, reason: `monthIndex must be between 0 and ${calendarConfig.months.length - 1}.` };
  }
  const month = calendarConfig.months[monthIndex];
  if (!Number.isInteger(day) || day < 1 || day > month.days) {
    return { valid: false, reason: `day must be between 1 and ${month.days} for ${month.name}.` };
  }
  return { valid: true };
}

// Formats calendar_config as a grounding block for a generation prompt --
// used by every *ContentPrompt.js builder that now proposes a date field
// (Phase 3), same "inject as plain text context" pattern as
// worldFlavor.js's formatFactionOptionsForPrompt. Explicitly tells the
// model to return null rather than invent a date when no calendar is
// configured yet -- matches the "model proposes, code validates" split
// (a null passes validateWorldDate's null-tolerant callers trivially,
// vs. a model inventing year/month numbers with nothing real to validate
// them against).
function formatCalendarContextForPrompt(calendarConfig) {
  if (!calendarConfig || !Array.isArray(calendarConfig.months) || calendarConfig.months.length === 0) {
    return "(this world has no calendar configured yet -- return null for any date field rather than inventing year/month numbers)";
  }
  const monthsText = calendarConfig.months.map((m, i) => `${i}: ${m.name} (${m.days} days)`).join(", ");
  const current = calendarConfig.current_date;
  const currentText = current ? formatWorldDate({ year: current.year, monthIndex: current.month_index, day: current.day }, calendarConfig) : "(not set)";
  return `Era: ${calendarConfig.era_name || "(unnamed)"}
Months (monthIndex: name (days)): ${monthsText}
Current in-world date: ${currentText}
Any date field must use { "year": integer, "monthIndex": integer index into the months above, "day": integer within that month's length } -- or null if nothing in the content grounds to a specific date.`;
}

// Total day-count across a year, used by generate-for-me's sanity check
// on a proposed calendar (guards against a degenerate "1 month, 1 day"
// shape) -- not otherwise load-bearing anywhere else in this phase.
function totalDaysInYear(calendarConfig) {
  return (calendarConfig.months || []).reduce((sum, m) => sum + (m.days || 0), 0);
}

// Model writes a date, code decides whether it's trustworthy -- returns
// the date unchanged if it validates against calendarConfig, or null
// otherwise (missing calendar, out-of-range month/day, or absurdly far
// before/after current_date). Never throws: an optional flavor field
// (a faction's founding date, an NPC's birth date) should silently drop
// a bad proposal rather than fail the whole generation over it -- same
// "leave null if nothing resolves" tolerance the scope doc already
// specifies for Logs, applied uniformly to every date field this phase
// adds. Callers pass the raw { year, monthIndex, day } shape the model
// returned (or null/undefined) directly.
function proposeAndValidateDate(date, calendarConfig) {
  if (date == null) return null;
  const result = validateWorldDate(date, calendarConfig);
  return result.valid ? { year: date.year, monthIndex: date.monthIndex, day: date.day } : null;
}

// Same "model proposes, code validates" as proposeAndValidateDate, but
// for a REGENERATE specifically: if the model's proposal is missing or
// fails validation, falls back to whatever the entry's prior value
// already was rather than wiping an established canonical date just
// because one revision happened to omit/garble it. Pass priorValue as
// undefined/null for a brand-new entry (nothing to fall back to).
function resolveRegeneratedDate(proposedDate, calendarConfig, priorValue) {
  return proposeAndValidateDate(proposedDate, calendarConfig) || priorValue || null;
}

// Which date fields exist on which category (Session Prep Companion,
// Phase 3 -- see session_prep_companion_scope.md Section 6a). Single
// source of truth for routes/confirmEntry.js's write-path validation
// below, so a manual dossier edit gets the exact same "code validates
// before write" treatment a model-proposed date already gets at
// generation time -- confirm-entry is the one write path shared by
// regenerate-confirm, manual edit, and manual create alike, so this is
// the one place that guarantee can be made to hold for all three.
const DATE_FIELDS_BY_CATEGORY = {
  factions: ["foundingDate"],
  npcs: ["birthDate", "appointedDate", "deathDate"],
  survivors: ["birthDate", "appointedDate", "deathDate"],
  items: ["createdDate", "discoveredDate"],
  logs: ["resolvedDate"]
};

// Returns a shallow copy of `entry` with every date field for its
// category passed through proposeAndValidateDate -- an invalid/malformed
// value (a hand-edited field with a typo, an out-of-range month) is
// dropped to null rather than rejecting the whole save, matching this
// phase's "leave null if nothing resolves" tolerance everywhere else.
// A category with no registered date fields (enemies, classes) is
// returned unchanged.
function sanitizeEntryDateFields(category, entry, calendarConfig) {
  const fields = DATE_FIELDS_BY_CATEGORY[category];
  if (!fields || !fields.length || !entry) return entry;
  const cleaned = { ...entry };
  for (const field of fields) {
    if (cleaned[field] !== undefined) {
      cleaned[field] = proposeAndValidateDate(cleaned[field], calendarConfig);
    }
  }
  return cleaned;
}

module.exports = { formatWorldDate, validateWorldDate, validateMonthDay, proposeAndValidateDate, resolveRegeneratedDate, formatCalendarContextForPrompt, sanitizeEntryDateFields, DATE_FIELDS_BY_CATEGORY, totalDaysInYear, ordinal, MAX_YEARS_BEFORE_CURRENT, MAX_YEARS_AFTER_CURRENT };
