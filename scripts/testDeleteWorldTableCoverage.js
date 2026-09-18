// scripts/testDeleteWorldTableCoverage.js
//
// Regression test for the "Delete World" table-coverage gap: routes/
// deleteWorld.js explicitly deletes campaign_modules/campaign_arcs (its
// own header comment explains why -- their ON DELETE CASCADE FK to
// worlds(id) never fires since "Delete World" keeps the same worlds row)
// but never got that same explicit delete added for three tables added
// in later Session Prep Companion phases: timeline_events (Phase 6),
// pending_entry_updates (Phase 7), and calendar_notable_dates (Phase 8).
// Those three silently survived a "Delete World" -- a fresh world (same
// world_id) kept showing old Timeline events, stale Suggested Updates,
// and old recurring Calendar dates. Fixed by adding deleteAllTimelineEvents/
// deleteAllPendingUpdates/deleteAllNotableDates and calling them from the
// route, mirroring the existing Quest/Campaign pattern exactly.
//
// Verified this fails against the pre-fix code (all three tables' rows
// for WORLD_ID survive the delete call) and passes against the fix. Also
// checks OTHER_WORLD_ID's rows are left untouched, since a worldId-less
// delete would "pass" the first check for the wrong reason.
//
// Run with: node scripts/testDeleteWorldTableCoverage.js

const fakeSupabase = require("./lib/fakeSupabase");
fakeSupabase.install();

const express = require("express");
const deleteWorldRoute = require("../routes/deleteWorld");

const WORLD_ID = "world-under-test";
const OTHER_WORLD_ID = "other-world";

async function seedWorld(worldId) {
  const { db } = fakeSupabase;
  db.world_config.push({ world_id: worldId, generation_count: 0, entries_purchased: 0 });
  db.timeline_events.push({ world_id: worldId, source_type: "log", source_id: "log-1", source_category: "logs", summary: "Something happened.", linked_entry_ids: [], linked_faction_ids: [] });
  db.pending_entry_updates.push({ world_id: worldId, entry_id: "npc-1", category: "npcs", suggestion_type: "status_flip", delta_text: "Died.", source: "chronicle:log-1", status: "pending" });
  db.calendar_notable_dates.push({ world_id: worldId, name: "Founding Day", month_index: 0, day: 1, note: null });
}

async function run() {
  const { db } = fakeSupabase;
  db.timeline_events = [];
  db.pending_entry_updates = [];
  db.calendar_notable_dates = [];
  db.world_config = [];

  await seedWorld(WORLD_ID);
  await seedWorld(OTHER_WORLD_ID);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = "test-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", deleteWorldRoute);
  const server = app.listen(4326);

  let failures = 0;
  function check(label, cond) {
    if (cond) {
      console.log(`  OK: ${label}`);
    } else {
      console.error(`  FAIL: ${label}`);
      failures++;
    }
  }

  try {
    const res = await fetch("http://localhost:4326/api/world/delete", { method: "POST" });
    check("delete request succeeded", res.ok);

    check("timeline_events cleared for target world", !db.timeline_events.some((r) => r.world_id === WORLD_ID));
    check("pending_entry_updates cleared for target world", !db.pending_entry_updates.some((r) => r.world_id === WORLD_ID));
    check("calendar_notable_dates cleared for target world", !db.calendar_notable_dates.some((r) => r.world_id === WORLD_ID));

    check("timeline_events untouched for other world", db.timeline_events.some((r) => r.world_id === OTHER_WORLD_ID));
    check("pending_entry_updates untouched for other world", db.pending_entry_updates.some((r) => r.world_id === OTHER_WORLD_ID));
    check("calendar_notable_dates untouched for other world", db.calendar_notable_dates.some((r) => r.world_id === OTHER_WORLD_ID));
  } finally {
    server.close();
  }

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
