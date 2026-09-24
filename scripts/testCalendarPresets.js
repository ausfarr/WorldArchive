// scripts/testCalendarPresets.js
//
// Bug batch 1, Phase 3 (session_addendum_bug_batch_1.md): pure checks,
// no network, no DB.
//   1. Every preset in lib/calendarPresets.js clears the same bar a saved
//      calendar must (lib/calendar.js#validateCalendarConfigShape), has
//      weekday_names.length === days_per_week and a valid current_date,
//      and stays inside the AI generator's own ranges (months 20-40 days,
//      weeks 4-10 days). Plus the specific preset data Austin specified.
//   2. repairWeekdayNames (the "D1..D7" root-cause fix).
//   3. countDatesInvalidatedByCalendar (the save-time warning).
//
// Usage: node scripts/testCalendarPresets.js

const { listCalendarPresets } = require("../lib/calendarPresets");
const {
  validateCalendarConfigShape, repairWeekdayNames, WEEKDAY_PLACEHOLDER_RE,
  countDatesInvalidatedByCalendar, formatWorldDate
} = require("../lib/calendar");

const failures = [];
function check(label, condition) {
  console.log(`  ${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) failures.push(label);
}

console.log("== Calendar presets + helpers ==\n");

const presets = listCalendarPresets();
check("six presets", presets.length === 6);
check("preset ids are unique", new Set(presets.map((p) => p.id)).size === presets.length);

for (const p of presets) {
  const cfg = p.calendarConfig;
  const shapeError = validateCalendarConfigShape(cfg);
  check(`${p.id}: passes validateCalendarConfigShape${shapeError ? ` (${shapeError})` : ""}`, shapeError === null);
  check(`${p.id}: weekday_names.length === days_per_week`, Array.isArray(cfg.weekday_names) && cfg.weekday_names.length === cfg.days_per_week);
  const cd = cfg.current_date;
  const month = cfg.months[cd.month_index];
  check(`${p.id}: current_date is valid`, !!month && cd.day >= 1 && cd.day <= month.days && Number.isInteger(cd.year));
  check(`${p.id}: every month 20-40 days`, cfg.months.every((m) => m.days >= 20 && m.days <= 40));
  check(`${p.id}: week 4-10 days`, cfg.days_per_week >= 4 && cfg.days_per_week <= 10);
  check(`${p.id}: no duplicate month or weekday names`,
    new Set(cfg.months.map((m) => m.name)).size === cfg.months.length && new Set(cfg.weekday_names).size === cfg.weekday_names.length);
  check(`${p.id}: has a label and description`, !!p.label && !!p.description);
}

const byId = Object.fromEntries(presets.map((p) => [p.id, p.calendarConfig]));
const total = (cfg) => cfg.months.reduce((n, m) => n + m.days, 0);
check("earth: 365 days, February fixed at 28, blank era, Jan 1 2026",
  total(byId.earth) === 365 && byId.earth.months[1].days === 28 && byId.earth.era_name === ""
  && byId.earth.current_date.year === 2026 && byId.earth.current_date.month_index === 0 && byId.earth.current_date.day === 1);
check("earth: blank era renders with no 'of the' clause",
  formatWorldDate({ year: 2026, monthIndex: 0, day: 1 }, byId.earth) === "the 1st of January, Year 2026");
check("high-fantasy: 12 x 30, 10-day week, Common Reckoning 1024",
  byId["high-fantasy"].months.length === 12 && total(byId["high-fantasy"]) === 360 && byId["high-fantasy"].days_per_week === 10
  && byId["high-fantasy"].era_name === "Common Reckoning" && byId["high-fantasy"].current_date.year === 1024);
const PUBLISHED_SETTING_MONTHS = ["Hammer", "Alturiak", "Ches", "Tarsakh", "Mirtul", "Kythorn", "Flamerule", "Eleasis", "Eleint", "Marpenoth", "Uktar", "Nightal"];
check("high-fantasy: uses original names, not the published setting's",
  !byId["high-fantasy"].months.some((m) => PUBLISHED_SETTING_MONTHS.includes(m.name)));
check("sci-fi: 10 x 36, 6-day week, Standard Reckoning 2847",
  byId["sci-fi"].months.length === 10 && total(byId["sci-fi"]) === 360 && byId["sci-fi"].days_per_week === 6
  && byId["sci-fi"].current_date.year === 2847);
check("wild-west: Earth months, April 12 1878, blank era",
  total(byId["wild-west"]) === 365 && byId["wild-west"].current_date.year === 1878
  && byId["wild-west"].current_date.month_index === 3 && byId["wild-west"].current_date.day === 12 && byId["wild-west"].era_name === "");
check("post-collapse: Earth months, After the Collapse 87",
  total(byId["post-collapse"]) === 365 && byId["post-collapse"].era_name === "After the Collapse" && byId["post-collapse"].current_date.year === 87);
check("sword-and-sorcery: 9 x 40, 5-day week, Old Reckoning 1502",
  byId["sword-and-sorcery"].months.length === 9 && total(byId["sword-and-sorcery"]) === 360
  && byId["sword-and-sorcery"].days_per_week === 5 && byId["sword-and-sorcery"].current_date.year === 1502);
const mutated = listCalendarPresets();
mutated[0].calendarConfig.months[0].name = "Mutated";
check("listCalendarPresets returns copies (shared Earth months can't be mutated)",
  listCalendarPresets()[0].calendarConfig.months[0].name === "January" && listCalendarPresets()[3].calendarConfig.months[0].name === "January");

console.log("\n-- repairWeekdayNames --");
check("exact count kept as-is", JSON.stringify(repairWeekdayNames(["A", "B", "C", "D"], 4)) === JSON.stringify(["A", "B", "C", "D"]));
check("extras truncated", JSON.stringify(repairWeekdayNames(["A", "B", "C", "D", "E"], 4)) === JSON.stringify(["A", "B", "C", "D"]));
const padded = repairWeekdayNames(["A", "B", " ", null], 5);
check("short list padded with 'Day N' placeholders (blanks dropped first)",
  JSON.stringify(padded) === JSON.stringify(["A", "B", "Day 3", "Day 4", "Day 5"]));
check("placeholders match WEEKDAY_PLACEHOLDER_RE, real names don't",
  WEEKDAY_PLACEHOLDER_RE.test("Day 3") && !WEEKDAY_PLACEHOLDER_RE.test("Dawnday") && !WEEKDAY_PLACEHOLDER_RE.test("Day of Rest"));
check("non-array -> all placeholders", JSON.stringify(repairWeekdayNames(undefined, 2)) === JSON.stringify(["Day 1", "Day 2"]));
check("repaired list passes shape validation",
  validateCalendarConfigShape({ ...byId.earth, days_per_week: 5, weekday_names: padded }) === null);

console.log("\n-- validateCalendarConfigShape (tightened) --");
check("blank weekday name rejected", validateCalendarConfigShape({ ...byId.earth, weekday_names: ["", "b", "c", "d", "e", "f", "g"] }) !== null);
check("null weekday_names still allowed", validateCalendarConfigShape({ ...byId.earth, weekday_names: null }) === null);

console.log("\n-- countDatesInvalidatedByCalendar --");
// Old calendar: Earth (12 months). New: Sword & Sorcery (9 x 40).
const stored = {
  timelineEvents: [
    { summary: "Coronation", worldDate: { year: 1500, monthIndex: 10, day: 3 } }, // month 11 gone
    { summary: "Flood", worldDate: { year: 1500, monthIndex: 1, day: 30 } },     // fine (40-day months)
    { summary: "Undated", worldDate: null }                                      // ignored
  ],
  notableDates: [
    { name: "Midwinter", monthIndex: 11, day: 21 }, // gone
    { name: "Harvest", monthIndex: 8, day: 1 }       // fine
  ],
  entries: [
    { category: "factions", name: "Iron Pact", raw: { foundingDate: { year: 1400, monthIndex: 9, day: 1 } } },   // gone
    { category: "npcs", name: "Vess", raw: { birthDate: { year: 1470, monthIndex: 2, day: 12 }, deathDate: null } }, // fine
    { category: "enemies", name: "Ghoul", raw: { foundingDate: { year: 1, monthIndex: 99, day: 1 } } }            // category has no date fields
  ]
};
const impact = countDatesInvalidatedByCalendar(byId["sword-and-sorcery"], stored);
check("counts: 1 timeline, 1 notable, 1 entry field",
  impact.timelineEvents === 1 && impact.notableDates === 1 && impact.entryDateFields === 1 && impact.total === 3);
check("examples name what breaks", impact.examples.some((e) => e.includes("Coronation")) && impact.examples.some((e) => e.includes("Iron Pact")));
const none = countDatesInvalidatedByCalendar(byId.earth, { timelineEvents: [{ worldDate: { year: 2025, monthIndex: 1, day: 28 } }] });
check("no conflicts -> total 0", none.total === 0);
const yearShift = countDatesInvalidatedByCalendar({ ...byId.earth, current_date: { year: 10, month_index: 0, day: 1 } },
  { timelineEvents: [{ summary: "Future", worldDate: { year: 2025, monthIndex: 0, day: 1 } }] });
check("moving the current year back flags dates now too far in the future", yearShift.timelineEvents === 1);
check("inputs are never mutated", stored.timelineEvents[0].worldDate.monthIndex === 10 && stored.entries[0].raw.foundingDate.monthIndex === 9);

if (failures.length) {
  console.log(`\nRESULT: ${failures.length} check(s) FAILED:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log("\nRESULT: all checks passed.");
