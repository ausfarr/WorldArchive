// scripts/testCalendar.js
//
// Session Prep Companion, Phase 2 -- pure-logic test for lib/calendar.js
// (formatWorldDate/validateWorldDate). No Supabase/network involved at
// all, unlike this phase's other scripts -- these two functions take a
// calendarConfig object directly.
//
// Run with: node scripts/testCalendar.js

const { formatWorldDate, validateWorldDate } = require("../lib/calendar");

const failures = [];
function check(label, condition) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}`);
    failures.push(label);
  }
}

const calendarConfig = {
  months: [
    { name: "Frostmere", days: 30 },
    { name: "Ashfall", days: 28 },
    { name: "Bloomrise", days: 31 }
  ],
  days_per_week: 6,
  weekday_names: ["Ember", "Ash", "Wick", "Coal", "Char", "Rest"],
  era_name: "Age of Ash",
  current_date: { year: 812, month_index: 1, day: 10 }
};

console.log("== Calendar helpers test ==\n");

console.log("formatWorldDate:");
check(
  "formats a normal date",
  formatWorldDate({ year: 812, monthIndex: 0, day: 4 }, calendarConfig) === "the 4th of Frostmere, Year 812 of the Age of Ash"
);
check(
  "handles ordinal suffixes correctly (1st/2nd/3rd/11th)",
  formatWorldDate({ year: 1, monthIndex: 0, day: 1 }, calendarConfig).includes("1st") &&
  formatWorldDate({ year: 1, monthIndex: 0, day: 2 }, calendarConfig).includes("2nd") &&
  formatWorldDate({ year: 1, monthIndex: 0, day: 3 }, calendarConfig).includes("3rd") &&
  formatWorldDate({ year: 1, monthIndex: 0, day: 11 }, calendarConfig).includes("11th") &&
  formatWorldDate({ year: 1, monthIndex: 0, day: 21 }, calendarConfig).includes("21st")
);
check("falls back gracefully for missing date", formatWorldDate(null, calendarConfig) === "(date unknown)");
check(
  "falls back gracefully for an out-of-range monthIndex rather than throwing",
  formatWorldDate({ year: 5, monthIndex: 99, day: 1 }, calendarConfig).includes("Year 5")
);
check("omits era clause when era_name is empty", !formatWorldDate({ year: 5, monthIndex: 0, day: 1 }, { ...calendarConfig, era_name: "" }).includes(" of the "));

console.log("\nvalidateWorldDate:");
check("accepts a valid date", validateWorldDate({ year: 812, monthIndex: 1, day: 15 }, calendarConfig).valid === true);
check("accepts a valid pre-campaign date (centuries before current_date)", validateWorldDate({ year: 200, monthIndex: 0, day: 1 }, calendarConfig).valid === true);
check("rejects a monthIndex out of range", validateWorldDate({ year: 812, monthIndex: 3, day: 1 }, calendarConfig).valid === false);
check("rejects a negative monthIndex", validateWorldDate({ year: 812, monthIndex: -1, day: 1 }, calendarConfig).valid === false);
check("rejects a day beyond that month's length", validateWorldDate({ year: 812, monthIndex: 1, day: 29 }, calendarConfig).valid === false);
check("accepts the last valid day of a month", validateWorldDate({ year: 812, monthIndex: 1, day: 28 }, calendarConfig).valid === true);
check("rejects day 0", validateWorldDate({ year: 812, monthIndex: 0, day: 0 }, calendarConfig).valid === false);
check("rejects a non-integer year", validateWorldDate({ year: 812.5, monthIndex: 0, day: 1 }, calendarConfig).valid === false);
check("rejects a year more than 1000 years before current_date", validateWorldDate({ year: -300, monthIndex: 0, day: 1 }, calendarConfig).valid === false);
check("rejects a year more than 5 years after current_date", validateWorldDate({ year: 820, monthIndex: 0, day: 1 }, calendarConfig).valid === false);
check("accepts a year exactly 5 years after current_date", validateWorldDate({ year: 817, monthIndex: 0, day: 1 }, calendarConfig).valid === true);
check("rejects when calendarConfig has no months configured yet", validateWorldDate({ year: 1, monthIndex: 0, day: 1 }, { months: [] }).valid === false);
check("rejects a missing date object", validateWorldDate(null, calendarConfig).valid === false);
check("every rejection includes a human-readable reason", (() => {
  const r = validateWorldDate({ year: 812, monthIndex: 3, day: 1 }, calendarConfig);
  return r.valid === false && typeof r.reason === "string" && r.reason.length > 0;
})());

console.log("\n== Result ==");
if (failures.length === 0) {
  console.log("ALL PASS");
  process.exit(0);
} else {
  console.log(`${failures.length} FAILURE(S):`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
