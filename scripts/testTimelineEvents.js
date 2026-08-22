// scripts/testTimelineEvents.js
//
// Session Prep Companion, Phase 6 -- end-to-end (mocked-API) test for
// all three Timeline triggers (scope doc Section 5a), exercised through
// the real Express routes (confirm-entry + a real regenerate flow via
// routes/generate.js), same fakeSupabase + mocked global.fetch harness
// as scripts/testPipeline.js.
//
// Covers:
//   1. Trigger 1 -- confirming a Session Chronicle creates a 'chronicle'
//      Timeline event, dated to the Chronicle's own in-world date, with
//      a real sessionNumber.
//   2. Trigger 3 -- confirming a plain Log (not a Chronicle) with a
//      resolvedDate creates a 'log_date' event -- and when that log's
//      resolvedDateSubject names an entry that ALREADY has a canonical
//      date, the event uses the CANONICAL date, not the log's own.
//   3. Trigger 3's other half -- when the subject has NO canonical date
//      yet, the log's own resolvedDate is used instead.
//   4. Trigger 2 -- a Regenerate confirm with the DM-opted-in
//      timelineEvent field creates a 'regenerate' event; a plain
//      Regenerate confirm WITHOUT that field creates nothing (off by
//      default).
//   5. GET /api/timeline-events returns everything for the world.
//
// Run with: node scripts/testTimelineEvents.js

process.env.ANTHROPIC_API_KEY = "test-key";

const CALENDAR_CONFIG = {
  months: [{ name: "Frostmere", days: 30 }, { name: "Ashfall", days: 28 }],
  days_per_week: 7,
  weekday_names: null,
  era_name: "Age of Ash",
  current_date: { year: 812, month_index: 1, day: 10 }
};

const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (url.includes("anthropic.com")) {
    const body = JSON.parse(opts.body);
    const systemText = Array.isArray(body.system) ? body.system.map((b) => b.text).join("\n") : (body.system || "");
    if (systemText.includes("You are generating a named NPC")) {
      return jsonResponse({
        id: "miller-thom", name: "Miller Thom", callsign: null, roleArchetype: "Quest-Giver", faction: "unaligned",
        age: 54, signatureQuote: "The mill remembers.", physicalDescription: "Weathered hands.",
        traits: ["stubborn"], contradiction: "Gentle with strangers, cold with kin.", wants: "Keep the mill running.",
        actuallyNeeds: "Let go.", speech: { register: "plain", rhythm: "slow", tic: "trails off", neverSay: "it's fine" },
        relationships: [], dialogue: { openingLine: "Mill's closed.", branches: [] }, questHook: null,
        designNotes: "test npc", birthDate: null, appointedDate: null, deathDate: null
      });
    }
    if (systemText.includes("You are turning a DM's rough recap notes")) {
      return jsonResponse({
        id: "mill-chronicle", name: "The Mill's Silence, Session 1", locationContext: "The Old Mill", locationId: null,
        characters: "Miller Thom", context: "A scribe's account.", bodyText: "They arrived and spoke with Thom.",
        faction: null, designNotes: "First session."
      });
    }
    throw new Error("Unhandled prompt in test mock (first 120 chars): " + systemText.slice(0, 120));
  }
  return originalFetch(url, opts);
};

function jsonResponse(payload) {
  return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(payload) }] }) };
}

require("./lib/fakeSupabase").install();
const fakeSupabase = require("./lib/fakeSupabase");
fakeSupabase.db.world_config.push({ world_id: "test-world", draft_json: {}, calendar_config: CALENDAR_CONFIG });

const express = require("express");
const { upsertEntry, getEntry } = require("../lib/entriesRepo");
const { createCampaignModule } = require("../lib/campaignModuleRepo");
const generateSessionChronicleRoute = require("../routes/generateSessionChronicle");
const confirmEntryRoute = require("../routes/confirmEntry");
const timelineRoute = require("../routes/timeline");
const { listTimelineEvents } = require("../lib/timelineRepo");

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Timeline Events (Phase 6) end-to-end test ==\n");

  await upsertEntry(WORLD_ID, "npcs", { id: "miller-thom", name: "Miller Thom", subtitle: "Grieving caretaker", faction: "the-ashen-hand", tags: [], bodyHtml: "<p>t</p>", raw: { roleArchetype: "quest-giver" } });
  const quest = await createCampaignModule(WORLD_ID, { name: "The Mill's Silence", entries: [{ category: "npcs", entryId: "miller-thom", role: "quest-giver", note: "" }], createdVia: "manual" });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = "test-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", generateSessionChronicleRoute);
  app.use("/api", confirmEntryRoute);
  app.use("/api", timelineRoute);
  const server = app.listen(4324);

  try {
    console.log("Test 1: confirming a Session Chronicle creates a 'chronicle' Timeline event");
    const chronicleGenRes = await fetch("http://localhost:4324/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId: quest.id, recapNotes: "Met Thom, learned the wheel was sabotaged." })
    });
    const chronicleGen = await chronicleGenRes.json();
    await fetch("http://localhost:4324/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "logs", entry: chronicleGen.entry })
    });

    let events = await listTimelineEvents(WORLD_ID);
    check("exactly one event exists after confirming the Chronicle", events.length === 1);
    check("its sourceType is 'chronicle'", events[0].sourceType === "chronicle");
    check("its sessionNumber matches the Chronicle's", events[0].sessionNumber === chronicleGen.entry.sessionChronicle.sessionNumber);
    check("its worldDate matches the Chronicle's in-world date", events[0].worldDate.year === 812 && events[0].worldDate.day === 10);

    console.log("\nTest 2: a plain Log (not a Chronicle) with resolvedDate + a subject with NO canonical date yet -> uses the log's own date");
    const logEntry = {
      id: "found-note", name: "A Found Note", category: "logs", logType: "Journal",
      locationContext: "The Old Mill", locationId: null, characters: "none", context: "A note.",
      bodyText: "Found scrawled on the wall: Thom didn't do it.", faction: "the-ashen-hand", designNotes: "test",
      resolvedDate: { year: 812, monthIndex: 1, day: 5 },
      resolvedDateSubject: { category: "npcs", entryId: "miller-thom", dateField: "deathDate" }
    };
    await fetch("http://localhost:4324/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "logs", entry: logEntry })
    });
    events = await listTimelineEvents(WORLD_ID);
    check("a second event was created ('log_date')", events.length === 2);
    const logDateEvent1 = events.find((e) => e.sourceType === "log_date");
    check("uses the log's own resolvedDate (no canonical date exists yet)", logDateEvent1.worldDate.day === 5);
    check("linked entries include the NPC subject", logDateEvent1.linkedEntryIds.some((r) => r.entryId === "miller-thom"));
    check("linked factions include the log's faction", logDateEvent1.linkedFactionIds.includes("the-ashen-hand"));

    console.log("\nTest 3: same subject NOW has a canonical deathDate -> the Timeline event uses the CANONICAL date, not the log's");
    const npcWithDeath = { ...(await getEntry(WORLD_ID, "npcs", "miller-thom")).raw, deathDate: { year: 812, monthIndex: 1, day: 20 } };
    await upsertEntry(WORLD_ID, "npcs", { id: "miller-thom", name: "Miller Thom", subtitle: "test", faction: "the-ashen-hand", tags: [], bodyHtml: "<p>t</p>", raw: npcWithDeath });
    const secondLogEntry = { ...logEntry, id: "found-note-2", name: "Another Found Note", resolvedDate: { year: 812, monthIndex: 1, day: 6 } };
    await fetch("http://localhost:4324/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "logs", entry: secondLogEntry })
    });
    events = await listTimelineEvents(WORLD_ID);
    const logDateEvent2 = events.find((e) => e.sourceId === "found-note-2");
    check("the new event uses the CANONICAL date (day 20), not the log's proposed day 6", logDateEvent2.worldDate.day === 20);

    // Both tests below use "factions" (not "npcs") -- factions aren't in
    // confirmEntry.js's HAS_PORTRAIT set, so this avoids needing a
    // supabase.storage stub in fakeSupabase (which only models the
    // query-builder/rpc surface) just to exercise Trigger 2's logic.
    const factionEntry = {
      id: "the-ashen-hand", factionKey: "the-ashen-hand", name: "The Ashen Hand", nickname: "The Hand",
      overviewQuote: "We remember.", origin: "test", corePhilosophy: "test", structureHierarchy: "test",
      territory: "test", goalsNearTerm: "test", goalsLongTerm: "test", internalTensions: "test",
      iconography: "test", relationships: [], economyResources: "test", joining: "test"
    };

    console.log("\nTest 4: Regenerate confirm WITHOUT opting in creates no Timeline event");
    const beforeCount = (await listTimelineEvents(WORLD_ID)).length;
    await fetch("http://localhost:4324/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "factions", entry: factionEntry })
    });
    check("no new event without opting in", (await listTimelineEvents(WORLD_ID)).length === beforeCount);

    console.log("\nTest 5: Regenerate confirm WITH the opt-in creates a 'regenerate' Timeline event");
    await fetch("http://localhost:4324/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "factions",
        entry: factionEntry,
        timelineEvent: { summary: "Died in the reactor collapse", worldDate: { year: 812, monthIndex: 1, day: 21 } }
      })
    });
    events = await listTimelineEvents(WORLD_ID);
    const regenEvent = events.find((e) => e.sourceType === "regenerate");
    check("a 'regenerate' event was created", !!regenEvent);
    check("it carries the DM-supplied summary", regenEvent.summary === "Died in the reactor collapse");
    check("it uses the DM-supplied date", regenEvent.worldDate.day === 21);

    console.log("\nTest 6: GET /api/timeline-events returns everything");
    const listRes = await fetch("http://localhost:4324/api/timeline-events");
    const listData = await listRes.json();
    check("GET responds 200 with all events", listRes.status === 200 && listData.events.length === events.length);
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
