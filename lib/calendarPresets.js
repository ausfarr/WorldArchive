// lib/calendarPresets.js
//
// Bug batch 1, Phase 3 (session_addendum_bug_batch_1.md): non-AI calendar
// templates for the new Calendar wizard step, so an AI-off DM isn't stuck
// hand-typing a year of months. Single source of truth -- the browser
// reads these through GET /api/wizard/calendar-presets
// (routes/wizardCalendar.js) rather than a duplicated copy in
// archive/js/calendarEditor.js. Choosing one only FILLS the editor; it's
// saved like any other calendar, and costs no AI call or quota.
//
// Every preset is held to the same bar as a saved calendar
// (lib/calendar.js#validateCalendarConfigShape), plus the generator's own
// ranges (months 20-40 days, weeks 4-10 days) -- enforced by
// scripts/testCalendarPresets.js.
//
// Known limitation of the calendar model itself, not of these presets:
// no leap years and no intercalary/festival days. Earth's February is a
// fixed 28 days; festival days can be added as Notable Dates on the
// Calendar page.
//
// High Fantasy uses ORIGINAL month/weekday names on the popular 5e
// setting's mechanical shape (12 x 30 days, 10-day weeks) -- that
// setting's own month names are third-party IP and must not be
// substituted in here.

const EARTH_MONTHS = [
  { name: "January", days: 31 },
  { name: "February", days: 28 },
  { name: "March", days: 31 },
  { name: "April", days: 30 },
  { name: "May", days: 31 },
  { name: "June", days: 30 },
  { name: "July", days: 31 },
  { name: "August", days: 31 },
  { name: "September", days: 30 },
  { name: "October", days: 31 },
  { name: "November", days: 30 },
  { name: "December", days: 31 }
];

const EARTH_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const uniform = (names, days) => names.map((name) => ({ name, days }));

// `id` is the stable key the frontend sends back; `label`/`description`
// are display-only. calendarConfig uses the exact stored
// world_config.calendar_config shape (snake_case), so a chosen preset can
// be dropped straight into the editor.
const CALENDAR_PRESETS = [
  {
    id: "earth",
    label: "Earth (Gregorian)",
    description: "The real-world calendar: 12 months, 7-day week. Starts January 1, 2026.",
    calendarConfig: {
      months: EARTH_MONTHS,
      days_per_week: 7,
      weekday_names: EARTH_WEEKDAYS,
      // Blank era: formatWorldDate() skips the "of the <era>" clause when
      // it's empty, so dates read "the 1st of January, Year 2026".
      era_name: "",
      current_date: { year: 2026, month_index: 0, day: 1 }
    }
  },
  {
    id: "high-fantasy",
    label: "High Fantasy (tenday)",
    description: "12 months of 30 days, 10-day weeks -- the classic 5e-style shape with original names.",
    calendarConfig: {
      months: uniform(["Hoarfrost", "Thawmoot", "Sowing", "Greenrise", "Brightbloom", "Highsun", "Sunpeak", "Harvestmoon", "Reapfall", "Emberwane", "Snowfall", "Longnight"], 30),
      days_per_week: 10,
      weekday_names: ["Dawnday", "Stoneday", "Rainday", "Windday", "Emberday", "Tideday", "Starday", "Ashday", "Moonday", "Highday"],
      era_name: "Common Reckoning",
      current_date: { year: 1024, month_index: 0, day: 1 }
    }
  },
  {
    id: "sci-fi",
    label: "Sci-Fi Standard Cycle",
    description: "10 cycles of 36 days, 6-day weeks. Year 2847 of the Standard Reckoning.",
    calendarConfig: {
      months: uniform(["Ignition", "Ascent", "Transit", "Apex", "Zenith", "Descent", "Drift", "Eclipse", "Nadir", "Reentry"], 36),
      days_per_week: 6,
      weekday_names: ["Primeday", "Duoday", "Triday", "Quadday", "Pentaday", "Hexaday"],
      era_name: "Standard Reckoning",
      current_date: { year: 2847, month_index: 0, day: 1 }
    }
  },
  {
    id: "wild-west",
    label: "Wild West (1878)",
    description: "Earth's calendar, starting April 12, 1878.",
    calendarConfig: {
      months: EARTH_MONTHS,
      days_per_week: 7,
      weekday_names: EARTH_WEEKDAYS,
      era_name: "",
      current_date: { year: 1878, month_index: 3, day: 12 }
    }
  },
  {
    id: "post-collapse",
    label: "Post-Collapse",
    description: "Earth's months and week, counted from the Collapse. Year 87.",
    calendarConfig: {
      months: EARTH_MONTHS,
      days_per_week: 7,
      weekday_names: EARTH_WEEKDAYS,
      era_name: "After the Collapse",
      current_date: { year: 87, month_index: 0, day: 1 }
    }
  },
  {
    id: "sword-and-sorcery",
    label: "Sword & Sorcery (Old Kingdoms)",
    description: "9 long months of 40 days, 5-day weeks. Year 1502 of the Old Reckoning.",
    calendarConfig: {
      months: uniform(["Emberwake", "Stormcrest", "Verdance", "Goldenrise", "Sunreach", "Ripening", "Harvestwane", "Duskfall", "Frostbind"], 40),
      days_per_week: 5,
      weekday_names: ["Ironday", "Oakday", "Riverday", "Flameday", "Skyday"],
      era_name: "Old Reckoning",
      current_date: { year: 1502, month_index: 0, day: 1 }
    }
  }
];

// Deep copies, so a caller (or a route handler serializing the response)
// can never mutate the shared EARTH_MONTHS arrays three presets reference.
function listCalendarPresets() {
  return JSON.parse(JSON.stringify(CALENDAR_PRESETS));
}

module.exports = { listCalendarPresets };
