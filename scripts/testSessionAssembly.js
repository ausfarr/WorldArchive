// scripts/testSessionAssembly.js
//
// Session Prep Companion, Phase 1 -- test for lib/sessionAssembly.js.
//
// NETWORK NOTE: this session's outbound egress policy blocks the
// project's live Supabase host outright (CONNECT to
// urtixpjyhhqcpzypvbni.supabase.co:443 comes back 403 from the sandbox's
// egress proxy -- confirmed via both a raw fetch probe and this exact
// failure mode already documented in scripts/testPipeline.js's own header
// comment, which predates this session). Per the proxy's own guidance,
// that's a policy denial to report, not something to retry or route
// around -- so this test uses the same in-memory fake-Supabase harness
// scripts/testPipeline.js/testEnemyPipeline.js already established
// (scripts/lib/fakeSupabase.js) instead of the live-data dry run
// CLAUDE.md's working norms ask for. Flagged in this phase's commit
// summary as untested against the real project -- Austin, please run
// this against live Supabase (or just exercise the admin test route)
// once you have a Quest/Campaign to point it at.
//
// Exercises the real lib/sessionAssembly.js, lib/campaignModuleRepo.js,
// lib/campaignArcRepo.js and lib/entriesRepo.js code unmodified -- only
// the Supabase client itself is faked. Seeds a Location (with a fake
// dungeonMap field), an NPC, a Quest (campaign_modules row) referencing
// both, a Campaign (campaign_arcs row) referencing the Quest, and a fake
// prior-Chronicle Log entry (using the raw.sessionChronicle contract
// lib/sessionAssembly.js's header comment documents for Phase 5), then
// verifies assembleSessionContext() resolves all of it correctly for both
// a bare questId call and a campaignId call.
//
// Run with: node scripts/testSessionAssembly.js

require("./lib/fakeSupabase").install();

const { upsertEntry, patchEntryMeta } = require("../lib/entriesRepo");
const { createCampaignModule } = require("../lib/campaignModuleRepo");
const { createCampaignArc } = require("../lib/campaignArcRepo");
const { assembleSessionContext } = require("../lib/sessionAssembly");

const worldId = "test-world-1";

const failures = [];
function check(label, condition) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}`);
    failures.push(label);
  }
}

async function main() {
  console.log("== Session Assembly (Phase 1) test ==\n");

  let questId, campaignId;

  console.log("Seeding a Location, an NPC, a Quest, a Campaign, and a fake prior Chronicle...");
    await upsertEntry(worldId, "locations", {
      id: "the-old-mill",
      name: "The Old Mill",
      subtitle: "Ruined watermill",
      faction: null,
      tags: [],
      bodyHtml: "<p>test</p>",
      raw: { regionBiome: "riverlands" }
    });
    // Simulate a previously-generated battle map (routes/dungeonMap.js's
    // storage shape) so extractDungeonMaps() has something real to find.
    await patchEntryMeta(worldId, "locations", "the-old-mill", {
      dungeonMap: { imageUrl: "https://example.test/mill-map.png", gridSize: 20, generatedAt: Date.now() }
    });

    await upsertEntry(worldId, "npcs", {
      id: "miller-thom",
      name: "Miller Thom",
      subtitle: "Grieving caretaker",
      faction: null,
      tags: [],
      bodyHtml: "<p>test</p>",
      raw: { roleArchetype: "quest-giver" }
    });

    const quest = await createCampaignModule(worldId, {
      name: "The Mill's Silence",
      summary: "Something drove everyone out of the mill.",
      status: "planned",
      entries: [
        { category: "locations", entryId: "the-old-mill", role: "setting", note: "" },
        { category: "npcs", entryId: "miller-thom", role: "quest-giver", note: "" }
      ],
      createdVia: "manual"
    });
    questId = quest.id;

    const campaign = await createCampaignArc(worldId, {
      name: "River's Edge Arc",
      summary: "A campaign along the river.",
      questIds: [questId],
      createdVia: "manual"
    });
    campaignId = campaign.id;

    // Fake prior Chronicle -- a Logs entry carrying a top-level
    // sessionChronicle field, same as every other category-specific extra
    // field entriesRepo/roster.js's manifest rows rely on (logType, tier,
    // roleArchetype, ...) -- entriesRepo.js's rowToManifestEntry spreads
    // raw_json (== the full entryMeta lib/fileWriter.js's save*Entry()
    // functions build) onto every manifest row, so a field only needs to
    // exist on entryMeta itself to be readable as m.<field> here. Phase 5's
    // saveLogEntry() will need to mirror log.sessionChronicle onto
    // entryMeta.sessionChronicle the same way it already mirrors
    // log.logType -- see lib/sessionAssembly.js's header comment for the
    // full contract this documents in advance of Phase 5 existing.
    await upsertEntry(worldId, "logs", {
      id: "session-1-chronicle",
      name: "Session 1: The Mill's Silence",
      subtitle: "Character(s): none",
      faction: null,
      tags: [],
      bodyHtml: "<p>test chronicle</p>",
      sessionChronicle: { questId, campaignId: null, sessionNumber: 1, worldDate: { year: 812, monthIndex: 2, day: 4 } },
      raw: { logType: "Journal" }
    });

    console.log("\nTest 1: assembleSessionContext({ questId })");
    const byQuest = await assembleSessionContext(worldId, { questId });
    check("resolves exactly one quest", byQuest.quests.length === 1);
    check("resolves both entries_json references to real entries", byQuest.quests[0].resolvedEntries.length === 2);
    check("resolved location entry has the right name", byQuest.quests[0].resolvedEntries.find((r) => r.category === "locations").entry.name === "The Old Mill");
    check("resolved npc entry has the right name", byQuest.quests[0].resolvedEntries.find((r) => r.category === "npcs").entry.name === "Miller Thom");
    check("finds the linked dungeon map", byQuest.quests[0].dungeonMaps.length === 1 && byQuest.quests[0].dungeonMaps[0].dungeonMap.imageUrl.includes("mill-map"));
    check("finds the prior Chronicle by questId", byQuest.priorChronicles.length === 1 && byQuest.priorChronicles[0].id === "session-1-chronicle");
    check("campaign is null for a bare quest call", byQuest.campaign === null);

    console.log("\nTest 2: assembleSessionContext({ campaignId })");
    const byCampaign = await assembleSessionContext(worldId, { campaignId });
    check("resolves the campaign's one quest", byCampaign.quests.length === 1 && byCampaign.quests[0].quest.id === questId);
    check("campaign row is populated", byCampaign.campaign && byCampaign.campaign.id === campaignId);
    check("still finds the prior Chronicle via the quest it belongs to", byCampaign.priorChronicles.length === 1);

    console.log("\nTest 3: dangling reference tolerance");
    const questWithGhost = await createCampaignModule(worldId, {
      name: "Ghost Quest",
      entries: [{ category: "npcs", entryId: "nobody-real", role: "", note: "" }],
      createdVia: "manual"
    });
    const ghostResult = await assembleSessionContext(worldId, { questId: questWithGhost.id });
    check("a dangling entry reference is silently dropped, not thrown", ghostResult.quests[0].resolvedEntries.length === 0);

    console.log("\nTest 4: missing questId/campaignId throws");
    let threw = false;
    try {
      await assembleSessionContext(worldId, {});
    } catch (e) {
      threw = true;
    }
  check("throws when neither questId nor campaignId is given", threw);

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
