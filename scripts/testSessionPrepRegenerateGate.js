// scripts/testSessionPrepRegenerateGate.js
//
// Session Prep Companion follow-up (post-Phase-9, after merging main's
// v1.1 split-quota pricing) -- verifies two things for
// routes/generateSessionPacket.js and routes/generateSessionChronicle.js:
//
//   1. requireAiEnabled still blocks generation when an account has AI
//      features turned off -- was already wired in from Phase 4/5, this
//      just confirms it explicitly rather than by inference.
//   2. The new-on-main subscriber-only Regenerate gate
//      (lib/regenerateGate.js's requireSubscriptionToRegenerate, already
//      wired into all 8 pre-existing generate-X routes) now also covers
//      these two routes: regenerating an existing Session Packet/
//      Chronicle is blocked without an active subscription (refunding
//      any points already charged) and allowed with one. A brand-new
//      generation (no fillExistingId) is never gated by this -- only
//      Regenerate is.
//
// Runs with BILLING_ENABLED=true (must be set before any require, since
// every file that reads it does so once at module-load time) --
// requireSubscriptionToRegenerate is a guaranteed no-op otherwise, and
// the whole point of this file is exercising that gate for real. Every
// other Session Prep Companion test script deliberately stays on the
// legacy default (BILLING_ENABLED unset) instead -- see
// scripts/testSessionPrepBilling.js -- so this is the one exception,
// same reasoning as fakeSupabase.js's own module-load-time constant.
//
// Same fakeSupabase + mocked global.fetch harness as every other Phase's
// test (no live Supabase access from this sandbox). Building this test
// required extending the shared fakeSupabase.js's fakeRpc() with three
// RPCs billingRepo.js's subscription path calls
// (check_and_spend_subscription_generation, refund_subscription_
// generation, reset_free_cycle_if_elapsed) -- previously undocumented
// because BILLING_ENABLED was off in every prior test, so that branch
// never ran. See fakeSupabase.js's own updated header comment.
//
// Run with: BILLING_ENABLED=true node scripts/testSessionPrepRegenerateGate.js
// (also sets it itself below, so plain `node ...` works too)

process.env.BILLING_ENABLED = "true";
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
        sceneBeats: [{ title: "Arrival", description: "Meet Miller Thom.", taggedEntries: [] }],
        npcVoiceReminders: [], complicationsDeck: [], openThreads: []
      });
    }
    if (systemText.includes("You are turning a DM's rough recap notes")) {
      return jsonResponse({
        id: "mill-chronicle", name: "The Mill's Silence, Session 1", locationContext: "The Old Mill", locationId: null,
        characters: "Miller Thom", context: "A scribe's account.", bodyText: "They arrived at the mill.",
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

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Session Prep Companion: AI-toggle + Regenerate-gate test (BILLING_ENABLED=true) ==\n");

  const quest = await createCampaignModule(WORLD_ID, { name: "Quest A", entries: [], createdVia: "manual" });

  const app = express();
  app.use(express.json());
  // Per-request userId is driven by an X-Test-User header so this one
  // process can exercise "AI disabled for user X" / "no subscription for
  // user Y" / "active subscription for user Y" without those states
  // colliding -- every other Session Prep test uses one fixed userId
  // since none of them needed to vary it.
  app.use((req, res, next) => { req.userId = req.headers["x-test-user"] || "owner-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", generateSessionPacketRoute);
  app.use("/api", generateSessionChronicleRoute);
  app.use("/api", confirmEntryRoute);
  const server = app.listen(4328);

  try {
    console.log("Test 1: AI disabled blocks generation on both new routes");
    fakeSupabase.db.user_settings.push({ user_id: "ai-disabled-user", ai_enabled: false });
    const packetAiOffRes = await fetch("http://localhost:4328/api/generate-session-packet", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": "ai-disabled-user" },
      body: JSON.stringify({ questId: quest.id })
    });
    const packetAiOffData = await packetAiOffRes.json();
    check("Session Packet generation blocked (403, ai_disabled)", packetAiOffRes.status === 403 && packetAiOffData.error === "ai_disabled");
    const chronicleAiOffRes = await fetch("http://localhost:4328/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": "ai-disabled-user" },
      body: JSON.stringify({ questId: quest.id, recapNotes: "notes" })
    });
    const chronicleAiOffData = await chronicleAiOffRes.json();
    check("Session Chronicle generation blocked (403, ai_disabled)", chronicleAiOffRes.status === 403 && chronicleAiOffData.error === "ai_disabled");

    console.log("\nTest 2: a brand-new Packet + Chronicle, created by an AI-enabled, non-subscribed owner (never gated -- only Regenerate is)");
    const packetRes = await fetch("http://localhost:4328/api/generate-session-packet", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": "owner-user" },
      body: JSON.stringify({ questId: quest.id })
    });
    const packetData = await packetRes.json();
    check("new Session Packet succeeds with no subscription", packetRes.status === 200);
    await fetch("http://localhost:4328/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": "owner-user" },
      body: JSON.stringify({ category: "session-packets", entry: packetData.entry })
    });

    const chronicleRes = await fetch("http://localhost:4328/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": "owner-user" },
      body: JSON.stringify({ questId: quest.id, recapNotes: "They arrived at the mill." })
    });
    const chronicleData = await chronicleRes.json();
    check("new Session Chronicle succeeds with no subscription (bundled free, since its quest now has a Packet)", chronicleRes.status === 200);
    await fetch("http://localhost:4328/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": "owner-user" },
      body: JSON.stringify({ category: "logs", entry: chronicleData.entry })
    });

    console.log("\nTest 3: regenerating either one without a subscription is blocked, and the Packet's already-charged points are refunded");
    const countBeforeBlockedRegen = WORLD_CONFIG_ROW.generation_count;
    const packetRegenBlockedRes = await fetch("http://localhost:4328/api/generate-session-packet", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": "owner-user" },
      body: JSON.stringify({ fillExistingId: packetData.entry.id })
    });
    const packetRegenBlockedData = await packetRegenBlockedRes.json();
    check("Session Packet regenerate blocked (403, regenerate_requires_subscription)", packetRegenBlockedRes.status === 403 && packetRegenBlockedData.error === "regenerate_requires_subscription");
    check("the blocked regenerate's points were refunded (net unchanged)", WORLD_CONFIG_ROW.generation_count === countBeforeBlockedRegen);

    const chronicleRegenBlockedRes = await fetch("http://localhost:4328/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": "owner-user" },
      body: JSON.stringify({ fillExistingId: chronicleData.entry.id, recapNotes: "revised notes" })
    });
    const chronicleRegenBlockedData = await chronicleRegenBlockedRes.json();
    check("Session Chronicle regenerate blocked (403, regenerate_requires_subscription)", chronicleRegenBlockedRes.status === 403 && chronicleRegenBlockedData.error === "regenerate_requires_subscription");

    console.log("\nTest 4: with an active subscription, both regenerates succeed");
    fakeSupabase.db.subscriptions.push({ user_id: "owner-user", status: "active", monthly_quota: 1000, used_this_cycle: 0 });
    const packetRegenOkRes = await fetch("http://localhost:4328/api/generate-session-packet", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": "owner-user" },
      body: JSON.stringify({ fillExistingId: packetData.entry.id })
    });
    check("Session Packet regenerate succeeds with an active subscription", packetRegenOkRes.status === 200);

    const chronicleRegenOkRes = await fetch("http://localhost:4328/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": "owner-user" },
      body: JSON.stringify({ fillExistingId: chronicleData.entry.id, recapNotes: "revised notes" })
    });
    check("Session Chronicle regenerate succeeds with an active subscription", chronicleRegenOkRes.status === 200);
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
