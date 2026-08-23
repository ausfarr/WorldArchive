// scripts/testSessionChronicle.js
//
// Session Prep Companion, Phase 5 -- end-to-end (mocked-API) test for
// Session Chronicle generation, AND the round-trip closure this phase's
// commit summary must confirm: a fresh lib/sessionAssembly.js call for
// the same Quest, made AFTER confirming a Chronicle, must now return
// that Chronicle in priorChronicles (Phase 1 built the query in advance
// of this phase existing -- this is what proves that contract actually
// holds). Same fakeSupabase + mocked global.fetch harness as
// scripts/testPipeline.js.
//
// Covers:
//   1. A Session Packet generated first (Phase 4) is picked up as "what
//      was planned" for the Chronicle prompt.
//   2. Chronicle generation returns a preview (never direct-saves).
//   3. Global session numbering: a second Chronicle (different Quest)
//      gets the NEXT number, not a reset to 1.
//   4. The date-entry control's default is this world's current_date,
//      and confirming with a DM-EDITED date persists the edited value,
//      not the model's original proposal.
//   5. THE LOOP CLOSURE: assembleSessionContext() called again after
//      confirming returns the new Chronicle in priorChronicles.
//   6. Regenerating an existing Chronicle keeps its original session
//      number (doesn't consume a new slot in the global sequence).
//
// Run with: node scripts/testSessionChronicle.js

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
    if (systemText.includes("You are assembling a Session Packet")) {
      return jsonResponse({
        title: "The Mill's Silence", openingReadAloud: "Rain on tin roof.",
        sceneBeats: [{ title: "Arrival", description: "Meet Miller Thom.", taggedEntries: [{ category: "npcs", entryId: "miller-thom", note: "Quest-giver" }] }],
        npcVoiceReminders: [], complicationsDeck: [], openThreads: []
      });
    }
    if (systemText.includes("You are turning a DM's rough recap notes")) {
      const isSecondQuest = systemText.includes("Second Quest");
      return jsonResponse({
        id: isSecondQuest ? "second-chronicle" : "mill-chronicle",
        name: isSecondQuest ? "The Second Session" : "The Mill's Silence, Session 1",
        locationContext: "The Old Mill", locationId: null, characters: "Miller Thom",
        context: "A scribe's account.",
        bodyText: "They arrived at the mill and spoke with Thom, who confirmed the wheel was sabotaged.",
        faction: null,
        designNotes: "First session for this quest; deviated from plan by skipping the silo entirely."
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
const generateSessionPacketRoute = require("../routes/generateSessionPacket");
const generateSessionChronicleRoute = require("../routes/generateSessionChronicle");
const confirmEntryRoute = require("../routes/confirmEntry");
const { assembleSessionContext } = require("../lib/sessionAssembly");

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Session Chronicle (Phase 5) end-to-end test ==\n");

  await upsertEntry(WORLD_ID, "npcs", { id: "miller-thom", name: "Miller Thom", subtitle: "Grieving caretaker", faction: null, tags: [], bodyHtml: "<p>t</p>", raw: { roleArchetype: "quest-giver" } });
  const quest = await createCampaignModule(WORLD_ID, { name: "The Mill's Silence", entries: [{ category: "npcs", entryId: "miller-thom", role: "quest-giver", note: "" }], createdVia: "manual" });
  const quest2 = await createCampaignModule(WORLD_ID, { name: "Second Quest", entries: [], createdVia: "manual" });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = "test-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", generateSessionPacketRoute);
  app.use("/api", generateSessionChronicleRoute);
  app.use("/api", confirmEntryRoute);
  const server = app.listen(4323);

  try {
    console.log("Test 1: generate and confirm a Session Packet first (the 'plan')");
    const packetGen = await (await fetch("http://localhost:4323/api/generate-session-packet", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questId: quest.id })
    })).json();
    await fetch("http://localhost:4323/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "session-packets", entry: packetGen.entry })
    });

    console.log("\nTest 2: assembleSessionContext has no priorChronicles yet");
    const beforeContext = await assembleSessionContext(WORLD_ID, { questId: quest.id });
    check("no prior Chronicles before any exist", beforeContext.priorChronicles.length === 0);

    console.log("\nTest 3: generate a Chronicle from recap notes -- returns a preview");
    const chronicleGenRes = await fetch("http://localhost:4323/api/generate-session-chronicle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId: quest.id, recapNotes: "We went to the mill, talked to Thom, found the wheel was sabotaged." })
    });
    const chronicleGen = await chronicleGenRes.json();
    check("responds 200 with a preview", chronicleGenRes.status === 200 && chronicleGen.preview === true);
    check("category is logs (Chronicles ARE logs)", chronicleGen.category === "logs");
    check("logType is forced to Journal", chronicleGen.entry.logType === "Journal");
    check("sessionNumber assigned is 1 (first Chronicle in this world)", chronicleGen.entry.sessionChronicle.sessionNumber === 1);
    check("date defaults to this world's current_date", chronicleGen.entry.resolvedDate.year === 812 && chronicleGen.entry.resolvedDate.monthIndex === 1 && chronicleGen.entry.resolvedDate.day === 10);
    check("questId is carried on sessionChronicle", chronicleGen.entry.sessionChronicle.questId === quest.id);

    console.log("\nTest 4: confirm with a DM-EDITED date (not the model/default proposal)");
    const editedEntry = { ...chronicleGen.entry, resolvedDate: { year: 812, monthIndex: 1, day: 14 }, sessionChronicle: { ...chronicleGen.entry.sessionChronicle, worldDate: { year: 812, monthIndex: 1, day: 14 } } };
    const confirmRes = await fetch("http://localhost:4323/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "logs", entry: editedEntry })
    });
    check("confirm responds 200", confirmRes.status === 200);
    const savedChronicle = await getEntry(WORLD_ID, "logs", chronicleGen.entry.id);
    check("the DM-edited date (day 14, not day 10) was persisted", savedChronicle.raw.resolvedDate.day === 14);
    check("bodyHtml renders the edited in-world date", savedChronicle.bodyHtml.includes("14th"));

    console.log("\nTest 5: THE LOOP CLOSES -- a fresh assembly call now returns this Chronicle");
    const afterContext = await assembleSessionContext(WORLD_ID, { questId: quest.id });
    check("priorChronicles now contains the confirmed Chronicle", afterContext.priorChronicles.length === 1 && afterContext.priorChronicles[0].id === chronicleGen.entry.id);
    check("its sessionNumber round-trips correctly", afterContext.priorChronicles[0].sessionChronicle.sessionNumber === 1);

    console.log("\nTest 6: global session numbering -- a second Quest's first Chronicle gets session 2, not 1");
    const secondGenRes = await fetch("http://localhost:4323/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questId: quest2.id, recapNotes: "Second Quest happened, party regrouped." })
    });
    const secondGen = await secondGenRes.json();
    check("second Chronicle (different Quest) gets session number 2 (global, not per-Quest)", secondGen.entry.sessionChronicle.sessionNumber === 2);
    await fetch("http://localhost:4323/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "logs", entry: secondGen.entry })
    });

    console.log("\nTest 7: regenerating an existing Chronicle keeps its original session number");
    const regenRes = await fetch("http://localhost:4323/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fillExistingId: chronicleGen.entry.id, recapNotes: "Revised: we went to the mill, talked to Thom, found the wheel was sabotaged, and also found footprints." })
    });
    const regenData = await regenRes.json();
    check("regenerate mode", regenData.mode === "regenerate");
    check("session number stays 1, not bumped to 3", regenData.entry.sessionChronicle.sessionNumber === 1);
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
