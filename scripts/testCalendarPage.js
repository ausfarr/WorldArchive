// scripts/testCalendarPage.js
//
// Session Prep Companion, Phase 8 -- test for the new backend surface
// behind the Full Calendar Page: lib/calendarNotableDatesRepo.js +
// routes/calendarNotableDates.js + lib/calendar.js's validateMonthDay().
// The grid/month-view itself is pure client-side rendering
// (archive/js/calendarPage.js) over data these endpoints + the
// already-tested GET /api/wizard/calendar-config and GET
// /api/timeline-events (see testCalendar.js / testTimelineEvents.js)
// supply -- nothing to unit-test server-side for the rendering itself.
//
// Same fakeSupabase harness as every other Phase's script (no live
// Supabase access from this sandbox -- see this phase's commit
// message).
//
// Run with: node scripts/testCalendarPage.js

const CALENDAR_CONFIG = {
  months: [{ name: "Frostmere", days: 30 }, { name: "Ashfall", days: 28 }],
  days_per_week: 7,
  weekday_names: null,
  era_name: "Age of Ash",
  current_date: { year: 812, month_index: 1, day: 10 }
};

require("./lib/fakeSupabase").install();
const fakeSupabase = require("./lib/fakeSupabase");
fakeSupabase.db.world_config.push({ world_id: "test-world", draft_json: {}, calendar_config: CALENDAR_CONFIG });

const express = require("express");
const calendarNotableDatesRoute = require("../routes/calendarNotableDates");

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Full Calendar Page (Phase 8) backend test ==\n");

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = "test-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", calendarNotableDatesRoute);
  const server = app.listen(4326);

  try {
    console.log("Test 1: creating a valid notable date");
    const createRes = await fetch("http://localhost:4326/api/calendar/notable-dates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "The Ashfall Rite", monthIndex: 1, day: 1, note: "A yearly remembrance." })
    });
    const createData = await createRes.json();
    check("create responds 200", createRes.status === 200);
    check("returned date has the right shape", createData.date.name === "The Ashfall Rite" && createData.date.monthIndex === 1 && createData.date.day === 1 && createData.date.note === "A yearly remembrance.");

    console.log("\nTest 2: rejecting an out-of-range month/day");
    const badMonthRes = await fetch("http://localhost:4326/api/calendar/notable-dates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bad Month", monthIndex: 5, day: 1 })
    });
    check("monthIndex out of range is rejected (400)", badMonthRes.status === 400);
    const badDayRes = await fetch("http://localhost:4326/api/calendar/notable-dates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bad Day", monthIndex: 1, day: 99 })
    });
    check("day out of range for that month is rejected (400)", badDayRes.status === 400);
    const missingNameRes = await fetch("http://localhost:4326/api/calendar/notable-dates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthIndex: 0, day: 1 })
    });
    check("missing name is rejected (400)", missingNameRes.status === 400);

    console.log("\nTest 3: a second valid date, then listing returns both sorted by month/day");
    await fetch("http://localhost:4326/api/calendar/notable-dates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Frost Founding", monthIndex: 0, day: 15 })
    });
    const listRes = await fetch("http://localhost:4326/api/calendar/notable-dates");
    const listData = await listRes.json();
    check("both valid dates were created, invalid ones were not", listData.dates.length === 2);
    check("listed sorted by monthIndex then day (Frost Founding first)", listData.dates[0].name === "Frost Founding" && listData.dates[1].name === "The Ashfall Rite");

    console.log("\nTest 4: deleting a notable date");
    const targetId = listData.dates[0].id;
    const deleteRes = await fetch(`http://localhost:4326/api/calendar/notable-dates/${targetId}`, { method: "DELETE" });
    check("delete responds 200", deleteRes.status === 200);
    const afterDelete = await (await fetch("http://localhost:4326/api/calendar/notable-dates")).json();
    check("exactly one notable date remains", afterDelete.dates.length === 1 && afterDelete.dates[0].name === "The Ashfall Rite");

    console.log("\nTest 5: deleting a nonexistent id is a clean 404, not a crash");
    const deleteMissingRes = await fetch(`http://localhost:4326/api/calendar/notable-dates/does-not-exist`, { method: "DELETE" });
    check("delete of a missing id responds 404", deleteMissingRes.status === 404);
  } finally {
    server.close();
  }

  console.log("\n== Result ==");
  if (failures.length === 0) {
    console.log("ALL PASS");
    process.exit(0);
  } else {
    console.log(`${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
