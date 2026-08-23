// scripts/testSessionPrepManualMode.js
//
// Manual Mode for Session Packets/Chronicles (follow-up to Session Prep
// Companion #48 and the Regenerate-gate/Timeline-auto-dates follow-ups).
// Covers the routes/confirmEntry.js backend changes a manually-created
// (zero AI calls) Packet/Chronicle needs on top of the existing shared
// write path: requiring a Quest/Campaign, and auto-assigning a
// Chronicle's session number server-side since there's no /generate-
// session-chronicle call to have already done it. The frontend forms
// themselves (archive/js/sessionPacket.js's showSessionPacketManualForm,
// archive/js/sessionRecap.js's showSessionChronicleManualForm) aren't
// exercised here -- no DOM in this harness -- but they POST the exact
// same {category, entry} shape this test constructs by hand.
//
// Same fakeSupabase harness as every other Session Prep Companion test
// (no live Supabase access from this sandbox).
//
// Run with: node scripts/testSessionPrepManualMode.js

require("./lib/fakeSupabase").install();
const fakeSupabase = require("./lib/fakeSupabase");
fakeSupabase.db.world_config.push({ world_id: "test-world", draft_json: {} });

const express = require("express");
const { createCampaignModule } = require("../lib/campaignModuleRepo");
const confirmEntryRoute = require("../routes/confirmEntry");
const { getEntry } = require("../lib/entriesRepo");

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Manual Mode: Session Packets/Chronicles backend test ==\n");

  const quest = await createCampaignModule(WORLD_ID, { name: "Quest A", entries: [], createdVia: "manual" });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = "test-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", confirmEntryRoute);
  const server = app.listen(4330);

  const post = (body) => fetch("http://localhost:4330/api/confirm-entry", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });

  try {
    console.log("Test 1: a manual Session Packet with no Quest/Campaign is rejected");
    const noTargetRes = await post({
      category: "session-packets",
      entry: { id: "manual-packet-1", title: "The Mill's Silence", openingReadAloud: "x", sceneBeats: [], npcVoiceReminders: [], complicationsDeck: [], openThreads: [] }
    });
    check("rejected with 400", noTargetRes.status === 400);

    console.log("\nTest 2: a manual Session Packet with a Quest saves correctly");
    const packetRes = await post({
      category: "session-packets",
      entry: {
        id: "manual-packet-1", title: "The Mill's Silence", openingReadAloud: "Rain on tin roof.",
        sceneBeats: [{ title: "Arrival", description: "Meet Thom.", taggedEntries: [] }],
        npcVoiceReminders: [], complicationsDeck: [], openThreads: ["Who sabotaged the wheel?"],
        questId: quest.id, questName: "Quest A", campaignId: null, campaignName: null, dungeonMaps: [], generatedAt: Date.now()
      }
    });
    check("manual packet saves (200)", packetRes.status === 200);
    const savedPacket = await getEntry(WORLD_ID, "session-packets", "manual-packet-1");
    check("saved with the right title and quest", savedPacket.raw.title === "The Mill's Silence" && savedPacket.raw.questId === quest.id);

    console.log("\nTest 3: a manual Session Chronicle with no Quest/Campaign is rejected");
    const noTargetChronicleRes = await post({
      category: "logs",
      entry: { id: "manual-chronicle-1", name: "Session 1", logType: "Journal", bodyText: "They arrived.", sessionChronicle: { questId: null, campaignId: null, sessionNumber: null, worldDate: null } }
    });
    check("rejected with 400", noTargetChronicleRes.status === 400);

    console.log("\nTest 4: a manual Session Chronicle with a Quest saves, and gets an auto-assigned session number");
    const chronicleRes = await post({
      category: "logs",
      entry: {
        id: "manual-chronicle-1", name: "Session 1", logType: "Journal", bodyText: "They arrived at the mill and met Thom.",
        locationContext: "The Old Mill", characters: "Miller Thom", context: "", designNotes: "",
        resolvedDate: { year: 812, monthIndex: 1, day: 10 },
        sessionChronicle: { questId: quest.id, campaignId: null, sessionNumber: null, worldDate: { year: 812, monthIndex: 1, day: 10 } }
      }
    });
    check("manual chronicle saves (200)", chronicleRes.status === 200);
    const savedChronicle = await getEntry(WORLD_ID, "logs", "manual-chronicle-1");
    check("session number was auto-assigned to 1 (the first Chronicle)", savedChronicle.raw.sessionChronicle.sessionNumber === 1);

    console.log("\nTest 5: a second manual Chronicle for the same Quest gets the NEXT session number");
    const secondChronicleRes = await post({
      category: "logs",
      entry: {
        id: "manual-chronicle-2", name: "Session 2", logType: "Journal", bodyText: "They found the silo.",
        sessionChronicle: { questId: quest.id, campaignId: null, sessionNumber: null, worldDate: null }
      }
    });
    check("second manual chronicle saves (200)", secondChronicleRes.status === 200);
    const savedSecondChronicle = await getEntry(WORLD_ID, "logs", "manual-chronicle-2");
    check("gets session number 2, not reset to 1", savedSecondChronicle.raw.sessionChronicle.sessionNumber === 2);

    console.log("\nTest 6: editing an existing manual Chronicle does NOT reassign its session number");
    const editRes = await post({
      category: "logs",
      entry: {
        id: "manual-chronicle-1", name: "Session 1 (revised)", logType: "Journal", bodyText: "Revised prose.",
        sessionChronicle: { questId: quest.id, campaignId: null, sessionNumber: 1, worldDate: null }
      }
    });
    check("edit saves (200)", editRes.status === 200);
    const editedChronicle = await getEntry(WORLD_ID, "logs", "manual-chronicle-1");
    check("session number stays 1 (not bumped to 3)", editedChronicle.raw.sessionChronicle.sessionNumber === 1);
    check("the revised prose was actually saved", editedChronicle.raw.bodyText === "Revised prose.");
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
