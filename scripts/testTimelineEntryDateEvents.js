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
// Bug batch 1, Phase 4 (session_addendum_bug_batch_1.md) additions:
//   7. Dedupe is enforced for every caller: a second caller with no
//      priorEntry (what a generate route passes) creates nothing new.
//   8. A DIRECT save path -- the real POST /generate-faction route, Anthropic
//      stubbed -- puts a new faction's foundingDate on the Timeline with no
//      /confirm-entry re-save (it never did before).
//   9. Renaming an entry doesn't make the backfill add a second event (the
//      dedupe key uses the field label, not the summary text).
//  10. backfillEntryDateEvents: creates missing events, counts already-
//      present and skipped-invalid, and a second run creates 0.
//  11. No calendar: backfill creates nothing, reports noCalendar.
//  12. Saving a calendar (POST /wizard/save-calendar-config) runs the
//      backfill and reports it.
//
// Run with: node scripts/testTimelineEntryDateEvents.js

process.env.ANTHROPIC_API_KEY = "test-key";

// Stubbed Anthropic for Test 8's real /generate-faction call -- no real or
// paid AI call is ever made. Everything else passes through.
const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (!String(url).includes("anthropic.com")) return originalFetch(url, opts);
  // One payload serves both calls createNewFaction makes (seed, then
  // Deep Lore) -- seed fields + Deep Lore fields together.
  const deepLore = {
    name: "The Salt Choir", concept: "c", politics: "p", government: "g", economy: "e", military: "m", tensions: "t",
    nickname: "n", overviewQuote: "q", origin: "o", corePhilosophy: "p", structureHierarchy: "s",
    territory: "t. t.", goalsNearTerm: "g", goalsLongTerm: "g", internalTensions: "i", iconography: "i",
    relationships: [], economyResources: "e", joining: "j", foundingDate: { year: 640, monthIndex: 1, day: 2 }
  };
  return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify(deepLore) }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" }) };
};

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
const { createEntryDateEvents, backfillEntryDateEvents } = require("../lib/timelineEvents");

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
  app.use("/api", require("../routes/generateFaction"));
  app.use("/api", require("../routes/wizardCalendar"));
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

    const entryDateCount = async (id, category) => (await listTimelineEvents(WORLD_ID))
      .filter((e) => e.sourceType === "entry_date" && (!id || e.sourceId === id) && (!category || e.sourceCategory === category)).length;

    console.log("\nTest 7: dedupe is enforced for every caller, not just /confirm-entry's prior-value check");
    const again = await createEntryDateEvents(WORLD_ID, "factions",
      { id: "ashen-hand", name: "The Ashen Hand", foundingDate: { year: 200, monthIndex: 0, day: 1 } }, null, CALENDAR_CONFIG);
    check("a caller with no priorEntry creates nothing for an already-recorded date", again.length === 0 && (await entryDateCount("ashen-hand", "factions")) === 1);
    const sameIdOtherCategory = await createEntryDateEvents(WORLD_ID, "items",
      { id: "ashen-hand", name: "Ashen Hand (relic)", createdDate: { year: 200, monthIndex: 0, day: 1 } }, null, CALENDAR_CONFIG);
    check("same entry id in a different category is NOT treated as a duplicate", sameIdOtherCategory.length === 1);

    console.log("\nTest 8: a direct save path (POST /generate-faction) creates the event with no re-save");
    const genRes = await fetch("http://localhost:4329/api/generate-faction", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "The Salt Choir" })
    });
    const gen = await genRes.json();
    const genId = gen.id || (gen.entry && gen.entry.id) || "the-salt-choir";
    const genEvents = (await listTimelineEvents(WORLD_ID)).filter((e) => e.sourceType === "entry_date" && e.sourceId === genId);
    check("generate-faction saved (200)", genRes.status === 200);
    check("its foundingDate is on the Timeline immediately", genEvents.length === 1 && genEvents[0].summary === "Founded: The Salt Choir" && genEvents[0].worldDate.year === 640);

    console.log("\nTest 9 + 10: backfill -- creates missing, idempotent, rename-safe");
    // Entries saved "before Phase 4": dates on the row, nothing on the Timeline.
    const pushRow = (category, id, name, raw) => fakeSupabase.db.entries.push({
      world_id: WORLD_ID, category, entry_id: id, name, subtitle: null, faction: null, tags_json: [], body_html: "",
      raw_json: { raw: { id, name, ...raw } }, locked: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    pushRow("survivors", "old-pc", "Old Pc", { birthDate: { year: 790, monthIndex: 1, day: 3 } });
    pushRow("items", "old-blade", "Old Blade", { createdDate: { year: 500, monthIndex: 0, day: 9 }, discoveredDate: { year: 811, monthIndex: 5, day: 1 } }); // discovered: month 5 doesn't exist
    // Rename a faction that already has its event -- must not duplicate.
    const ashenRow = fakeSupabase.db.entries.find((r) => r.category === "factions" && r.entry_id === "ashen-hand");
    if (ashenRow) { ashenRow.name = "The Ashen Hands"; if (ashenRow.raw_json && ashenRow.raw_json.raw) ashenRow.raw_json.raw.name = "The Ashen Hands"; }

    const before = await entryDateCount();
    const first = await backfillEntryDateEvents(WORLD_ID, CALENDAR_CONFIG);
    check("first run creates exactly the 2 missing events (Born: Old Pc, Created: Old Blade)", first.created === 2 && (await entryDateCount()) === before + 2);
    check("the out-of-range discoveredDate is counted as skipped-invalid", first.skippedInvalid === 1);
    check("already-recorded dates counted as already present (incl. the renamed faction)", first.alreadyPresent === 5 && (await entryDateCount("ashen-hand", "factions")) === 1);
    const second = await backfillEntryDateEvents(WORLD_ID, CALENDAR_CONFIG);
    check("second run creates 0 (idempotent)", second.created === 0 && second.alreadyPresent === first.alreadyPresent + first.created);

    console.log("\nTest 11: no calendar -> nothing created, reported");
    const noCal = await backfillEntryDateEvents(WORLD_ID, null);
    check("noCalendar reported, 0 created, every dated field skipped", noCal.noCalendar === true && noCal.created === 0 && noCal.skippedInvalid > 0);

    console.log("\nTest 12: saving a calendar runs the backfill");
    pushRow("npcs", "late-npc", "Late Npc", { birthDate: { year: 801, monthIndex: 0, day: 2 } });
    const calRes = await fetch("http://localhost:4329/api/wizard/save-calendar-config", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calendarConfig: CALENDAR_CONFIG })
    });
    const calBody = await calRes.json();
    check("save-calendar-config reports timelineSync with the new event", calRes.status === 200 && calBody.timelineSync && calBody.timelineSync.created === 1);
    check("Born: Late Npc is on the Timeline", (await entryDateCount("late-npc")) === 1);
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
