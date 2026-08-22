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
// migrations/029_calendar_config.sql):
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

// Total day-count across a year, used by generate-for-me's sanity check
// on a proposed calendar (guards against a degenerate "1 month, 1 day"
// shape) -- not otherwise load-bearing anywhere else in this phase.
function totalDaysInYear(calendarConfig) {
  return (calendarConfig.months || []).reduce((sum, m) => sum + (m.days || 0), 0);
}

module.exports = { formatWorldDate, validateWorldDate, totalDaysInYear, ordinal, MAX_YEARS_BEFORE_CURRENT, MAX_YEARS_AFTER_CURRENT };
