// scripts/testTimelineEntryDatesLive.js
//
// Bug batch 1, Phase 4 (session_addendum_bug_batch_1.md): entry-date
// Timeline events against REAL Supabase -- the real timeline_events check
// constraint, PostgREST filters, and jsonb dates, none of which
// fakeSupabase can vouch for. This is the script that found production
// was missing migration 036 (every entry_date insert was rejected, and
// /confirm-entry returned 500 after the entry had already saved).
//
// Two outcomes, both asserted:
//   - Migration 036/039 NOT applied: the fail-safe path -- /confirm-entry
//     still returns 200, nothing throws, backfill reports migrationRequired.
//   - Applied: /confirm-entry creates exactly one event, a second caller
//     creates none (dedupe), and backfill is idempotent (0 created twice).
//
// No AI or Stripe calls. Disposable user + world, deleted (with every row
// this wrote) in a finally block, same pattern as
// scripts/testTenantIsolation.js. Needs SUPABASE_URL/SUPABASE_SECRET_KEY.
//
// Usage: node scripts/testTimelineEntryDatesLive.js

const express = require("express");
const { supabase } = require("../lib/supabaseClient");
const { getOrCreateWorldId } = require("../middleware/resolveTenant");
const { saveCalendarConfig } = require("../lib/worldConfigRepo");
const { listTimelineEvents } = require("../lib/timelineRepo");
const { backfillEntryDateEvents, createEntryDateEvents } = require("../lib/timelineEvents");

const CAL = {
  months: [{ name: "Frostmere", days: 30 }, { name: "Ashfall", days: 28 }],
  days_per_week: 7, weekday_names: null, era_name: "Age of Ash",
  current_date: { year: 812, month_index: 1, day: 10 }
};

const failures = [];
function check(label, condition, detail) {
  console.log(`  ${condition ? "PASS" : "FAIL"} - ${label}${!condition && detail !== undefined ? `  (${JSON.stringify(detail)})` : ""}`);
  if (!condition) failures.push(label);
}

async function main() {
  console.log("== Timeline entry dates (LIVE Supabase) ==\n");
  let userId, worldId, server;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: `timeline-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@worldforge.test`,
      password: "throwaway-test-password-1", email_confirm: true
    });
    if (error) throw new Error(`Failed to create test user: ${error.message}`);
    userId = data.user.id;
    worldId = await getOrCreateWorldId(userId);
    await saveCalendarConfig(worldId, CAL);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.userId = userId; req.worldId = worldId; next(); });
    app.use("/api", require("../routes/confirmEntry"));
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });

    const npc = {
      id: "vess", name: "Vess", subtitle: "t", faction: null, tags: [], roleArchetype: "quest-giver",
      speech: { register: "a", rhythm: "a", tic: "a", neverSay: "a" }, dialogue: {},
      birthDate: { year: 790, monthIndex: 1, day: 3 }
    };
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/confirm-entry`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "npcs", entry: npc })
    });
    check("/confirm-entry of a dated NPC returns 200 (never a 500 over the Timeline write)", res.status === 200, res.status);

    const probe = await backfillEntryDateEvents(worldId, CAL);
    if (probe.migrationRequired) {
      console.log("\n  NOTE - migration 036/039 is NOT applied: checking the fail-safe path only.");
      console.log("         Run migrations/039_timeline_lore_date_source_type.sql, then re-run this script.\n");
      check("no entry_date events were written", (await listTimelineEvents(worldId)).filter((e) => e.sourceType === "entry_date").length === 0);
      check("backfill reports migrationRequired instead of throwing", probe.created === 0 && probe.migrationRequired === true, probe);
    } else {
      const events = (await listTimelineEvents(worldId)).filter((e) => e.sourceType === "entry_date");
      check("exactly one entry_date event from /confirm-entry", events.length === 1 && events[0].summary === "Born: Vess", events);
      check("stored world_date round-trips as jsonb", events[0] && events[0].worldDate.year === 790 && events[0].worldDate.monthIndex === 1);
      const again = await createEntryDateEvents(worldId, "npcs", npc, null, CAL);
      check("a second caller (no priorEntry) creates nothing -- dedupe", again.length === 0);
      check("backfill after that: 0 created, 1 already present", probe.created === 0 && probe.alreadyPresent === 1, probe);
      const second = await backfillEntryDateEvents(worldId, CAL);
      check("second backfill: still 0 created (idempotent)", second.created === 0 && second.alreadyPresent === 1, second);
    }
  } finally {
    if (server) server.close();
    // Only ever this test's own disposable user/world, by exact id.
    if (worldId) {
      for (const table of ["timeline_events", "pending_entry_updates", "entries", "lore_sections", "world_config"]) {
        await supabase.from(table).delete().eq("world_id", worldId);
      }
      await supabase.from("worlds").delete().eq("id", worldId);
    }
    if (userId) {
      await supabase.from("user_settings").delete().eq("user_id", userId);
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) console.warn(`  Warning: failed to delete test user ${userId}: ${error.message}`);
    }
  }

  if (failures.length) {
    console.log(`\nRESULT: ${failures.length} check(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("\nRESULT: all checks passed.");
  process.exit(0);
}

main().catch((err) => { console.error("\nTest crashed:", err); process.exit(1); });
