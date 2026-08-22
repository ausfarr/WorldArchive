// scripts/testSessionPrepBilling.js
//
// Session Prep Companion, Phase 9 -- quota/billing wiring (scope doc
// Section 7.7). Same fakeSupabase + mocked global.fetch harness as
// scripts/testSessionChronicle.js. BILLING_ENABLED is left unset (the
// default legacy beta flow -- flat GENERATION_CAP points, no trial/
// subscription), same as every other pipeline test in this repo.
//
// Covers:
//   1. Session Packet generation charges POINTS_PER_GENERATION (5),
//      same unit as every other generate route.
//   2. A Chronicle generated for a quest that already has a confirmed
//      Session Packet is BUNDLED -- no separate charge (the flagged
//      assumption this phase's commit message documents).
//   3. A Chronicle generated standalone (no preceding Packet for that
//      quest) charges its own 5 points.
//   4. Regenerating a bundled Chronicle stays bundled (still free) --
//      the bundling rule is about the quest having a Packet at all, not
//      about which specific generation call this is.
//   5. Both routes are correctly blocked (403) once a world is at its
//      points cap, and a blocked call does NOT partially increment the
//      count.
//   6. A downstream failure (the Claude call itself errors) refunds the
//      points it already charged rather than burning them for zero
//      output -- same req.refundGeneration() contract every other
//      generate route already honors.
//
// Run with: node scripts/testSessionPrepBilling.js

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
    const userMessage = body.messages && body.messages[0] && body.messages[0].content;
    if (systemText.includes("You are assembling a Session Packet")) {
      return jsonResponse({
        title: "The Mill's Silence", openingReadAloud: "Rain on tin roof.",
        sceneBeats: [{ title: "Arrival", description: "Meet Miller Thom.", taggedEntries: [] }],
        npcVoiceReminders: [], complicationsDeck: [], openThreads: []
      });
    }
    if (systemText.includes("You are turning a DM's rough recap notes")) {
      // Test 6's forced-failure call -- always returns a real API error,
      // both on the first attempt AND callClaudeExpectingJson's one retry,
      // so the route's whole generation call fails and its catch block's
      // req.refundGeneration() is what's actually under test here. Matches
      // on recapNotes (embedded verbatim in the prompt) rather than the
      // quest's name -- buildSessionChronicleSystemPrompt() never actually
      // includes the quest's own name in its text.
      if (systemText.includes("This call is rigged to fail")) {
        return { ok: false, status: 500, text: async () => "simulated upstream failure" };
      }
      const isSecondQuest = systemText.includes("Second Quest");
      return jsonResponse({
        id: isSecondQuest ? "second-chronicle" : "mill-chronicle",
        name: isSecondQuest ? "The Second Session" : "The Mill's Silence, Session 1",
        locationContext: "The Old Mill", locationId: null, characters: "Miller Thom",
        context: "A scribe's account.",
        bodyText: "They arrived at the mill and spoke with Thom.",
        faction: null, designNotes: "Went as planned."
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
const WORLD_CONFIG_ROW = { world_id: "test-world", draft_json: {}, calendar_config: CALENDAR_CONFIG, generation_count: 0 };
fakeSupabase.db.world_config.push(WORLD_CONFIG_ROW);

const express = require("express");
const { createCampaignModule } = require("../lib/campaignModuleRepo");
const generateSessionPacketRoute = require("../routes/generateSessionPacket");
const generateSessionChronicleRoute = require("../routes/generateSessionChronicle");
const confirmEntryRoute = require("../routes/confirmEntry");
const { POINTS_PER_GENERATION, GENERATION_CAP } = require("../lib/worldConfigRepo");

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Session Prep Companion billing wiring (Phase 9) test ==\n");
  console.log(`GENERATION_CAP=${GENERATION_CAP} points, POINTS_PER_GENERATION=${POINTS_PER_GENERATION}\n`);

  const questA = await createCampaignModule(WORLD_ID, { name: "Quest A", entries: [], createdVia: "manual" });
  const questB = await createCampaignModule(WORLD_ID, { name: "Second Quest", entries: [], createdVia: "manual" });
  const questC = await createCampaignModule(WORLD_ID, { name: "Force Failure Quest", entries: [], createdVia: "manual" });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = "test-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", generateSessionPacketRoute);
  app.use("/api", generateSessionChronicleRoute);
  app.use("/api", confirmEntryRoute);
  const server = app.listen(4327);

  try {
    console.log("Test 1: Session Packet generation charges POINTS_PER_GENERATION");
    const packetRes = await fetch("http://localhost:4327/api/generate-session-packet", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questId: questA.id })
    });
    const packetData = await packetRes.json();
    check("packet generation succeeds", packetRes.status === 200);
    check("charged exactly POINTS_PER_GENERATION", WORLD_CONFIG_ROW.generation_count === POINTS_PER_GENERATION);

    // Confirm it so findLatestSessionPacketFor() sees a real, saved
    // Packet for Quest A -- the bundling check reads the archive, not
    // the just-generated preview.
    await fetch("http://localhost:4327/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "session-packets", entry: packetData.entry })
    });

    console.log("\nTest 2: a Chronicle for the SAME quest (which now has a confirmed Packet) is bundled -- no extra charge");
    const countBeforeBundled = WORLD_CONFIG_ROW.generation_count;
    const bundledRes = await fetch("http://localhost:4327/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId: questA.id, recapNotes: "They met Miller Thom at the mill." })
    });
    const bundledData = await bundledRes.json();
    check("bundled chronicle generation succeeds", bundledRes.status === 200);
    check("no additional points were charged (bundled with the Packet)", WORLD_CONFIG_ROW.generation_count === countBeforeBundled);

    // Confirm it too, so Test 4 can regenerate a real saved Chronicle.
    await fetch("http://localhost:4327/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "logs", entry: bundledData.entry })
    });

    console.log("\nTest 3: a Chronicle for a DIFFERENT quest with NO preceding Packet charges its own POINTS_PER_GENERATION");
    const countBeforeStandalone = WORLD_CONFIG_ROW.generation_count;
    const standaloneRes = await fetch("http://localhost:4327/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId: questB.id, recapNotes: "A second, unrelated session." })
    });
    check("standalone chronicle generation succeeds", standaloneRes.status === 200);
    check("charged its own POINTS_PER_GENERATION (no Packet to bundle with)", WORLD_CONFIG_ROW.generation_count === countBeforeStandalone + POINTS_PER_GENERATION);

    console.log("\nTest 4: regenerating the bundled Chronicle (Quest A, which still has its Packet) stays bundled");
    const countBeforeRegen = WORLD_CONFIG_ROW.generation_count;
    const regenRes = await fetch("http://localhost:4327/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fillExistingId: bundledData.entry.id, recapNotes: "Revised recap." })
    });
    check("regenerate of a bundled chronicle succeeds", regenRes.status === 200);
    check("still no charge on regenerate (still bundled)", WORLD_CONFIG_ROW.generation_count === countBeforeRegen);

    console.log("\nTest 5: both routes are blocked once the world is at its points cap, with no partial charge");
    WORLD_CONFIG_ROW.generation_count = GENERATION_CAP - POINTS_PER_GENERATION + 1; // one short of room for a full generation
    const countAtCapBoundary = WORLD_CONFIG_ROW.generation_count;
    const blockedPacketRes = await fetch("http://localhost:4327/api/generate-session-packet", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questId: questA.id })
    });
    check("packet generation is blocked at the cap (403)", blockedPacketRes.status === 403);
    check("blocked packet call did not partially increment the count", WORLD_CONFIG_ROW.generation_count === countAtCapBoundary);

    const blockedChronicleRes = await fetch("http://localhost:4327/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId: questB.id, recapNotes: "Another session for the standalone quest." })
    });
    check("standalone chronicle generation is blocked at the cap (403)", blockedChronicleRes.status === 403);
    check("blocked standalone chronicle call did not partially increment the count", WORLD_CONFIG_ROW.generation_count === countAtCapBoundary);

    console.log("\nTest 6: a downstream generation failure refunds the points it charged");
    WORLD_CONFIG_ROW.generation_count = 0; // reset -- back under the cap so the charge itself succeeds before the simulated failure
    const failRes = await fetch("http://localhost:4327/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId: questC.id, recapNotes: "This call is rigged to fail." })
    });
    check("the forced-failure call responds 500", failRes.status === 500);
    check("points charged before the failure were refunded back to 0", WORLD_CONFIG_ROW.generation_count === 0);
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
