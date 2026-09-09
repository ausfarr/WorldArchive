// scripts/testWizardDraftSaveRace.js
//
// Regression test for the check-then-act race fixed in
// lib/worldConfigRepo.js's saveDraftStep() -- routes/wizard.js's
// POST /wizard/save-draft autosaves on every field blur/change (not
// debounced or serialized client-side), so tabbing through several
// fields on one wizard step fires several concurrent saveDraftStep()
// calls. Each one used to read world_config.draft_json, shallow-merge
// its own field into a JS copy, and write the whole column back with a
// plain update() -- no lock. Two calls landing close together could
// both read the same pre-write draft_json and each write back a merge
// that silently drops the other's field. Same shape of bug already
// fixed for entriesRepo.js's patchEntryMeta() / entryLinker.js's backfill
// rebake (scripts/testEntryMetaPatchRace.js) and the Campaign Arc/Quest
// cleanup helpers (scripts/testCampaignStructureRaces.js) -- this was the
// one progressive-commit wizard path that still had it.
//
// Uses the same fakeSupabase.js real-macrotask-yield fake those other
// race tests rely on to actually reproduce interleaved concurrent calls.
//
// Run with: node scripts/testWizardDraftSaveRace.js

const { install, db } = require("./lib/fakeSupabase");
install();

const { saveDraftStep, getDraft } = require("../lib/worldConfigRepo");

const WORLD = "test-world";

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail !== undefined ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function resetDb() {
  db.world_config.length = 0;
}

async function testConcurrentSavesSameStepBothLand() {
  console.log("\nTest 1: two concurrent saves to different fields on the SAME step both survive");
  resetDb();

  // Simulates tabbing from the genre field to the scale field on Step 1 --
  // both blur handlers fire their own autosave call before either resolves.
  await Promise.all([
    saveDraftStep(WORLD, 1, { genre: "solarpunk" }),
    saveDraftStep(WORLD, 1, { scale: "regional" })
  ]);

  const draft = await getDraft(WORLD);
  check("genre survived", draft["1"] && draft["1"].genre === "solarpunk", JSON.stringify(draft["1"]));
  check("scale survived too (not lost to the race)", draft["1"] && draft["1"].scale === "regional", JSON.stringify(draft["1"]));
}

async function testConcurrentSavesDifferentStepsBothLand() {
  console.log("\nTest 2: two concurrent saves to DIFFERENT steps both survive (same draft_json column)");
  resetDb();

  // Every step's fields live in the same draft_json column on the same
  // world_config row -- a save to step 2 racing a save to step 1 hits the
  // exact same column-level race as two saves to the same step.
  await Promise.all([
    saveDraftStep(WORLD, 1, { genre: "solarpunk" }),
    saveDraftStep(WORLD, 2, { factionCount: 4 })
  ]);

  const draft = await getDraft(WORLD);
  check("step 1 survived", draft["1"] && draft["1"].genre === "solarpunk", JSON.stringify(draft["1"]));
  check("step 2 survived too (not lost to the race)", draft["2"] && draft["2"].factionCount === 4, JSON.stringify(draft["2"]));
}

async function testSequentialSavesStillMerge() {
  console.log("\nTest 3: sequential saves to the same step still shallow-merge (lock doesn't break the happy path)");
  resetDb();

  await saveDraftStep(WORLD, 1, { genre: "solarpunk" });
  await saveDraftStep(WORLD, 1, { scale: "regional" });

  const draft = await getDraft(WORLD);
  check("both fields present after sequential saves", draft["1"].genre === "solarpunk" && draft["1"].scale === "regional", JSON.stringify(draft["1"]));
}

async function main() {
  await testConcurrentSavesSameStepBothLand();
  await testConcurrentSavesDifferentStepsBothLand();
  await testSequentialSavesStillMerge();

  console.log(`\n${failures.length === 0 ? "All checks passed." : `${failures.length} check(s) FAILED:`}`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
