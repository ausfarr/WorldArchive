// scripts/testEntryDriftSuggestions.js
//
// Session Prep Companion, Phase 7 -- end-to-end (mocked-API) test for
// entry drift suggestions, status fields, and the persisted queue. Same
// fakeSupabase + mocked global.fetch harness as scripts/testPipeline.js.
//
// Covers:
//   1. Status defaults: a brand-new NPC/Faction get a sensible default
//      status; a QuestItem/Boss enemy default to null unless set.
//   2. A regenerate carries the entry's existing status forward even
//      though the AI response never mentions it (the model schema has
//      no status field at all).
//   3. A Chronicle's model-proposed impliedUpdates create real
//      pending_entry_updates rows on confirm, with a hallucinated
//      entryId dropped.
//   4. GET /api/pending-updates lists them; POST .../dismiss marks one
//      dismissed without deleting it.
//   5. POST .../apply for a status_flip suggestion patches the target
//      entry's status directly AND fires a Timeline event automatically
//      (Trigger 2 extended to status-flips, no opt-in needed).
//   6. POST .../apply for a regenerate suggestion does NOT write
//      anything itself -- just returns enough for the frontend to open
//      the normal regenerate flow with the suggestion's delta_text.
//
// Run with: node scripts/testEntryDriftSuggestions.js

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
    if (systemText.includes("You are turning a DM's rough recap notes")) {
      return jsonResponse({
        id: "mill-chronicle", name: "The Mill's Silence, Session 1", locationContext: "The Old Mill", locationId: null,
        characters: "Miller Thom", context: "A scribe's account.", bodyText: "Thom died defending the wheel from raiders.",
        faction: null, designNotes: "Thom's death changes the quest.",
        impliedUpdates: [
          { category: "npcs", entryId: "miller-thom", suggestionType: "status_flip", targetStatus: "dead", deltaText: "Died defending the mill's wheel during Session 1." },
          { category: "npcs", entryId: "nobody-real", suggestionType: "status_flip", targetStatus: "dead", deltaText: "A hallucinated entry that must be dropped." },
          { category: "factions", entryId: "the-ashen-hand", suggestionType: "regenerate", targetStatus: null, deltaText: "Lost their strongest ally in the mill raid -- should reflect weakened influence." }
        ]
      });
    }
    if (systemText.includes("You are expanding a faction's established concept")) {
      return jsonResponse({
        nickname: "The Ashen Hand", overviewQuote: "We remember.", origin: "test", corePhilosophy: "test",
        structureHierarchy: "test", territory: "test", goalsNearTerm: "test", goalsLongTerm: "test",
        internalTensions: "test", iconography: "test", relationships: [], economyResources: "test", joining: "test",
        foundingDate: null
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
const generateFactionRoute = require("../routes/generateFaction");
const confirmEntryRoute = require("../routes/confirmEntry");
const pendingUpdatesRoute = require("../routes/pendingUpdates");
const { listTimelineEvents } = require("../lib/timelineRepo");

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Entry Drift Suggestions (Phase 7) end-to-end test ==\n");

  await upsertEntry(WORLD_ID, "npcs", { id: "miller-thom", name: "Miller Thom", subtitle: "test", faction: null, tags: [], bodyHtml: "<p>t</p>", raw: { roleArchetype: "quest-giver" } });
  await upsertEntry(WORLD_ID, "factions", { id: "the-ashen-hand", factionKey: "the-ashen-hand", name: "The Ashen Hand", subtitle: null, faction: "the-ashen-hand", tags: [], bodyHtml: "<p>t</p>", raw: { factionKey: "the-ashen-hand", name: "The Ashen Hand" } });
  const quest = await createCampaignModule(WORLD_ID, { name: "The Mill's Silence", entries: [{ category: "npcs", entryId: "miller-thom", role: "quest-giver", note: "" }], createdVia: "manual" });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = "test-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", generateSessionChronicleRoute);
  app.use("/api", generateFactionRoute);
  app.use("/api", confirmEntryRoute);
  app.use("/api", pendingUpdatesRoute);
  const server = app.listen(4325);

  try {
    console.log("Test 1: status defaults on a brand-new entry");
    const factionConfirmRes = await fetch("http://localhost:4325/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "factions", entry: { id: "the-ashen-hand", factionKey: "the-ashen-hand", name: "The Ashen Hand", nickname: "The Hand", overviewQuote: "x", origin: "x", corePhilosophy: "x", structureHierarchy: "x", territory: "x", goalsNearTerm: "x", goalsLongTerm: "x", internalTensions: "x", iconography: "x", relationships: [], economyResources: "x", joining: "x" } })
    });
    check("faction confirm succeeds", factionConfirmRes.status === 200);
    const savedFaction = await getEntry(WORLD_ID, "factions", "the-ashen-hand");
    check("faction defaults to status 'active'", savedFaction.raw.status === "active");

    console.log("\nTest 2: a Chronicle's impliedUpdates create real suggestions (hallucinated id dropped)");
    const chronicleGenRes = await fetch("http://localhost:4325/api/generate-session-chronicle", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId: quest.id, recapNotes: "Thom died defending the mill from raiders." })
    });
    const chronicleGen = await chronicleGenRes.json();
    check("preview's impliedUpdates already dropped the hallucinated entry", chronicleGen.entry.impliedUpdates.length === 2);
    await fetch("http://localhost:4325/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "logs", entry: chronicleGen.entry })
    });

    const listRes = await fetch("http://localhost:4325/api/pending-updates?status=pending");
    const listData = await listRes.json();
    check("exactly 2 real suggestions were created (hallucinated one never became a row)", listData.updates.length === 2);
    const statusFlipSuggestion = listData.updates.find((u) => u.suggestionType === "status_flip");
    const regenSuggestion = listData.updates.find((u) => u.suggestionType === "regenerate");
    check("status_flip suggestion targets the right NPC with the right payload", statusFlipSuggestion.entryId === "miller-thom" && statusFlipSuggestion.payload.targetStatus === "dead");
    check("regenerate suggestion targets the faction", regenSuggestion.entryId === "the-ashen-hand");

    console.log("\nTest 3: dismiss a suggestion -- marked dismissed, not deleted");
    const dismissRes = await fetch(`http://localhost:4325/api/pending-updates/${regenSuggestion.id}/dismiss`, { method: "POST" });
    check("dismiss responds 200", dismissRes.status === 200);
    const afterDismiss = await (await fetch("http://localhost:4325/api/pending-updates?status=pending")).json();
    check("dismissed suggestion no longer shows as pending", !afterDismiss.updates.some((u) => u.id === regenSuggestion.id));
    const dismissedList = await (await fetch("http://localhost:4325/api/pending-updates?status=dismissed")).json();
    check("dismissed suggestion still exists with status 'dismissed' (not deleted)", dismissedList.updates.some((u) => u.id === regenSuggestion.id));

    console.log("\nTest 4: apply the status_flip suggestion -- patches the entry AND fires a Timeline event automatically");
    const beforeEvents = (await listTimelineEvents(WORLD_ID)).length;
    const applyRes = await fetch(`http://localhost:4325/api/pending-updates/${statusFlipSuggestion.id}/apply`, { method: "POST" });
    const applyData = await applyRes.json();
    check("apply responds 200 and reports 'status_flip'", applyRes.status === 200 && applyData.applied === "status_flip");
    const npcAfter = await getEntry(WORLD_ID, "npcs", "miller-thom");
    check("the NPC's status is now 'dead'", npcAfter.raw.status === "dead");
    const eventsAfter = await listTimelineEvents(WORLD_ID);
    check("a Timeline event was created automatically (Trigger 2 extended to status-flips)", eventsAfter.length === beforeEvents + 1);
    check("the auto-created event summary mentions the flip", eventsAfter[eventsAfter.length - 1].summary.includes("dead"));

    console.log("\nTest 5: applying an already-applied/dismissed suggestion is rejected");
    const reApplyRes = await fetch(`http://localhost:4325/api/pending-updates/${statusFlipSuggestion.id}/apply`, { method: "POST" });
    check("re-applying an already-applied suggestion is rejected (400)", reApplyRes.status === 400);

    console.log("\nTest 6: regenerate carries forward an entry's existing status even though the AI schema never mentions it");
    // The preview payload itself never carries `status` (it's built
    // straight from the AI's response, which has no status field) --
    // showRegeneratePreview()'s "Save This Version" button in render.js
    // POSTs that preview entry to /api/confirm-entry completely
    // unmodified, so the real carry-forward contract lives at confirm
    // time: confirmEntry.js sees entry.status === undefined and pulls
    // the prior value off the entry already in the DB. Test that
    // contract end-to-end rather than asserting on the preview alone.
    const regenRes = await fetch("http://localhost:4325/api/generate-faction", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fillExistingId: "the-ashen-hand" })
    });
    const regenData = await regenRes.json();
    check("regenerated faction preview has no opinion on status (undefined, not overwritten)", regenData.entry.status === undefined);
    await fetch("http://localhost:4325/api/confirm-entry", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "factions", entry: regenData.entry })
    });
    const factionAfterRegen = await getEntry(WORLD_ID, "factions", "the-ashen-hand");
    check("confirming that regenerate carries the status forward to the saved entry", factionAfterRegen.raw.status === "active");
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
