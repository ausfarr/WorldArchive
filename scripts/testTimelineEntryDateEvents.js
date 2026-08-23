// scripts/testTimelineEntryDateEvents.js
//
// Timeline Trigger 4 -- entry-level structured date fields (foundingDate/
// birthDate/appointedDate/deathDate/createdDate/discoveredDate) now
// auto-create a Timeline event whenever they're newly set or changed on
// ANY write path (new, regenerate, manual edit), no DM opt-in required --
// see lib/timelineEvents.js's createEntryDateEvents and migrations/
// 036_timeline_entry_date_source_type.sql. Same fakeSupabase + mocked
// global.fetch harness as every other Session Prep Companion test (no
// live Supabase access from this sandbox).
//
// Covers:
//   1. A brand-new entry (Faction) with foundingDate set creates one
//      entry_date event.
//   2. A manual edit that sets a previously-unset date field (NPC's
//      deathDate) creates a new event.
//   3. Re-saving with the SAME date value creates no duplicate event.
//   4. Changing an already-set date to a different value creates a
//      SECOND event (append-only -- doesn't replace the first).
//   5. Two date fields changing in the same save create two separate
//      events.
//   6. Logs are excluded from this trigger (resolvedDate keeps its own
//      existing Trigger 3 only).
//
// Run with: node scripts/testTimelineEntryDateEvents.js

process.env.ANTHROPIC_API_KEY = "test-key";

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
const confirmEntryRoute = require("../routes/confirmEntry");
const { listTimelineEvents } = require("../lib/timelineRepo");

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Timeline Trigger 4: auto entry-date events test ==\n");

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = "test-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", confirmEntryRoute);
  const server = app.listen(4329);

  const post = (body) => fetch("http://localhost:4329/api/confirm-entry", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });

  // lib/entryTemplate.js's buildBodyHtml() unconditionally reads
  // npc.speech.register/rhythm/tic/neverSay -- a bare {id, name, ...}
  // fixture (fine for categories whose template tolerates missing
  // fields) throws here, so every NPC payload in this file needs the
  // full shape.
  function npcEntry(id, name, extra) {
    return {
      id, name, subtitle: "test", faction: null, tags: [], roleArchetype: "quest-giver",
      speech: { register: "plain", rhythm: "plain", tic: "none", neverSay: "nothing" },
      dialogue: {},
      ...extra
    };
  }

  try {
    console.log("Test 1: a brand-new Faction with foundingDate set creates one entry_date event");
    await post({
      category: "factions",
      entry: {
        id: "ashen-hand", factionKey: "ashen-hand", name: "The Ashen Hand", nickname: "The Hand",
        overviewQuote: "x", origin: "x", corePhilosophy: "x", structureHierarchy: "x", territory: "x",
        goalsNearTerm: "x", goalsLongTerm: "x", internalTensions: "x", iconography: "x", relationships: [],
        economyResources: "x", joining: "x", foundingDate: { year: 200, monthIndex: 0, day: 1 }
      }
    });
    let events = await listTimelineEvents(WORLD_ID);
    check("exactly one Timeline event exists after creation", events.length === 1);
    check("it's an entry_date event with the right summary", events[0].sourceType === "entry_date" && events[0].summary === "Founded: The Ashen Hand");
    check("dated to the foundingDate value", events[0].worldDate.year === 200);

    console.log("\nTest 2: a manual edit that newly sets an NPC's deathDate creates a new event");
    await post({ category: "npcs", entry: npcEntry("miller-thom", "Miller Thom") });
    events = await listTimelineEvents(WORLD_ID);
    check("no entry_date event yet (no date fields set on creation)", events.filter((e) => e.sourceType === "entry_date" && e.sourceId === "miller-thom").length === 0);

    await post({ category: "npcs", entry: npcEntry("miller-thom", "Miller Thom", { deathDate: { year: 812, monthIndex: 1, day: 4 } }) });
    events = await listTimelineEvents(WORLD_ID);
    const thomEvents = events.filter((e) => e.sourceType === "entry_date" && e.sourceId === "miller-thom");
    check("newly setting deathDate on a manual edit creates one event", thomEvents.length === 1 && thomEvents[0].summary === "Died: Miller Thom");

    console.log("\nTest 3: re-saving with the SAME date value creates no duplicate event");
    await post({ category: "npcs", entry: npcEntry("miller-thom", "Miller Thom", { deathDate: { year: 812, monthIndex: 1, day: 4 } }) });
    events = await listTimelineEvents(WORLD_ID);
    check("still exactly one entry_date event for this NPC (no duplicate)", events.filter((e) => e.sourceType === "entry_date" && e.sourceId === "miller-thom").length === 1);

    console.log("\nTest 4: changing the date to a different value creates a SECOND event (append-only)");
    await post({ category: "npcs", entry: npcEntry("miller-thom", "Miller Thom", { deathDate: { year: 812, monthIndex: 1, day: 5 } }) });
    events = await listTimelineEvents(WORLD_ID);
    const thomEventsAfterChange = events.filter((e) => e.sourceType === "entry_date" && e.sourceId === "miller-thom");
    check("now two entry_date events for this NPC (the correction, not a replacement)", thomEventsAfterChange.length === 2);

    console.log("\nTest 5: two date fields changing in the same save create two separate events");
    await post({
      category: "npcs",
      entry: npcEntry("second-npc", "Vess Okoro", { birthDate: { year: 780, monthIndex: 0, day: 1 }, appointedDate: { year: 810, monthIndex: 1, day: 1 } })
    });
    events = await listTimelineEvents(WORLD_ID);
    const vessEvents = events.filter((e) => e.sourceType === "entry_date" && e.sourceId === "second-npc");
    check("two events created (Born + Appointed)", vessEvents.length === 2);
    check("one is Born, one is Appointed", vessEvents.some((e) => e.summary === "Born: Vess Okoro") && vessEvents.some((e) => e.summary === "Appointed: Vess Okoro"));

    console.log("\nTest 6: Logs are excluded from this trigger -- resolvedDate keeps only its existing log_date trigger");
    await post({
      category: "logs",
      entry: { id: "a-log", name: "A Log", subtitle: null, faction: null, tags: [], logType: "Journal Entry", resolvedDate: { year: 812, monthIndex: 1, day: 10 } }
    });
    events = await listTimelineEvents(WORLD_ID);
    const logEntryDateEvents = events.filter((e) => e.sourceType === "entry_date" && e.sourceId === "a-log");
    check("no entry_date event created for the Log itself", logEntryDateEvents.length === 0);
    const logDateEvents = events.filter((e) => e.sourceType === "log_date" && e.sourceId === "a-log");
    check("its existing log_date event still fires as before", logDateEvents.length === 1);
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
