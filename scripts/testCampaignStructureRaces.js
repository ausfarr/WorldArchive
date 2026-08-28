// scripts/testCampaignStructureRaces.js
//
// Regression test for the check-then-act races fixed in lib/campaignArcRepo.js's
// removeQuestFromAllCampaignArcs() and lib/campaignModuleRepo.js's
// removeEntryFromAllCampaignModules() -- both used to read a row (questIds /
// entries), compute a filtered array in JS, then write it back with a plain
// update() and no lock, the same shape of bug already fixed for
// appendQuestToArc() (see CHANGELOG.md's "appendQuestToArc() had a
// check-then-act race" entry). Uses the same fakeSupabase.js real-macrotask-
// yield fake scripts/testEntryDriftSuggestions.js's Test 9 relies on to
// actually reproduce interleaved concurrent calls.
//
// Run with: node scripts/testCampaignStructureRaces.js

require("./lib/fakeSupabase").install();

const {
  createCampaignArc, getCampaignArc, appendQuestToArc, removeQuestFromAllCampaignArcs
} = require("../lib/campaignArcRepo");
const {
  createCampaignModule, getCampaignModule, removeEntryFromAllCampaignModules
} = require("../lib/campaignModuleRepo");

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Campaign Structure race regression test ==\n");

  console.log("Test 1: removeQuestFromAllCampaignArcs racing appendQuestToArc on the same arc");
  // Arc starts referencing quest-old (about to be deleted). Concurrently:
  // deleting quest-old (fires removeQuestFromAllCampaignArcs) and creating
  // quest-new off the same arc's unmatched stage (fires appendQuestToArc)
  // both read the arc's questIds before either write lands -- pre-fix, the
  // second write would silently undo the first's change.
  const arc = await createCampaignArc(WORLD_ID, {
    name: "Test Arc", summary: "", questIds: ["quest-old"],
    pendingStages: [{ id: "stage-1", title: "Stage 1", concept: "" }], createdVia: "manual"
  });
  await Promise.all([
    removeQuestFromAllCampaignArcs(WORLD_ID, "quest-old"),
    appendQuestToArc(WORLD_ID, arc.id, "quest-new", "stage-1")
  ]);
  const arcAfter = await getCampaignArc(WORLD_ID, arc.id);
  check("quest-old was removed", !arcAfter.questIds.includes("quest-old"));
  check("quest-new was added (not lost to the race)", arcAfter.questIds.includes("quest-new"));
  check("stage-1 was cleared from pendingStages", !arcAfter.pendingStages.some((s) => s.id === "stage-1"));

  console.log("\nTest 2: two concurrent removeQuestFromAllCampaignArcs calls on the same arc, different quests");
  const arc2 = await createCampaignArc(WORLD_ID, {
    name: "Test Arc 2", summary: "", questIds: ["quest-a", "quest-b", "quest-c"],
    pendingStages: [], createdVia: "manual"
  });
  await Promise.all([
    removeQuestFromAllCampaignArcs(WORLD_ID, "quest-a"),
    removeQuestFromAllCampaignArcs(WORLD_ID, "quest-b")
  ]);
  const arc2After = await getCampaignArc(WORLD_ID, arc2.id);
  check("quest-a was removed", !arc2After.questIds.includes("quest-a"));
  check("quest-b was removed (not lost to the race)", !arc2After.questIds.includes("quest-b"));
  check("quest-c (untouched) is still present", arc2After.questIds.includes("quest-c"));

  console.log("\nTest 3: two concurrent removeEntryFromAllCampaignModules calls on the same Quest, different entries");
  const quest = await createCampaignModule(WORLD_ID, {
    name: "Test Quest", summary: "", status: "planned",
    entries: [
      { category: "npcs", entryId: "npc-1", role: "", note: "" },
      { category: "npcs", entryId: "npc-2", role: "", note: "" },
      { category: "items", entryId: "item-1", role: "", note: "" }
    ],
    createdVia: "manual"
  });
  await Promise.all([
    removeEntryFromAllCampaignModules(WORLD_ID, "npcs", "npc-1"),
    removeEntryFromAllCampaignModules(WORLD_ID, "npcs", "npc-2")
  ]);
  const questAfter = await getCampaignModule(WORLD_ID, quest.id);
  const remainingIds = questAfter.entries.map((e) => e.entryId);
  check("npc-1 was removed", !remainingIds.includes("npc-1"));
  check("npc-2 was removed (not lost to the race)", !remainingIds.includes("npc-2"));
  check("item-1 (untouched) is still present", remainingIds.includes("item-1"));

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
