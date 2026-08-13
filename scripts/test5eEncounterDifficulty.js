// scripts/test5eEncounterDifficulty.js
//
// Standalone test script for lib/rulesets/5e/encounterDifficulty.js.
// Hard assertions against hand-computed values using the real DMG
// "Building an Encounter" tables.
//
// Run with: node scripts/test5eEncounterDifficulty.js

const {
  computePartyThresholds,
  encounterMultiplier,
  computeEncounterXp,
  computeEncounterDifficulty
} = require("../lib/rulesets/5e/encounterDifficulty");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

// Hand-computed against the real per-level table: a level 1 party of 4
// sums 4x{25,50,75,100} = {100,200,300,400}.
function testPartyThresholdsLevel1x4() {
  console.log("\nParty thresholds, four level-1 characters:");
  const t = computePartyThresholds([1, 1, 1, 1]);
  check("easy === 100", t.easy === 100, t.easy);
  check("medium === 200", t.medium === 200, t.medium);
  check("hard === 300", t.hard === 300, t.hard);
  check("deadly === 400", t.deadly === 400, t.deadly);
}

// Mixed-level party: level 3 (75/150/225/400) + level 5 (250/500/750/1100)
// = 325/650/975/1500.
function testPartyThresholdsMixedLevels() {
  console.log("\nParty thresholds, mixed levels (3 + 5):");
  const t = computePartyThresholds([3, 5]);
  check("easy === 325", t.easy === 325, t.easy);
  check("medium === 650", t.medium === 650, t.medium);
  check("hard === 975", t.hard === 975, t.hard);
  check("deadly === 1500", t.deadly === 1500, t.deadly);
}

// Real DMG multiplier table, party size 3-5 (no adjustment).
function testEncounterMultiplierTable() {
  console.log("\nEncounter multiplier by monster count (party size 4, no size adjustment):");
  check("1 monster -> x1", encounterMultiplier(1, 4) === 1);
  check("2 monsters -> x1.5", encounterMultiplier(2, 4) === 1.5);
  check("3 monsters -> x2", encounterMultiplier(3, 4) === 2);
  check("6 monsters -> x2", encounterMultiplier(6, 4) === 2);
  check("7 monsters -> x2.5", encounterMultiplier(7, 4) === 2.5);
  check("10 monsters -> x2.5", encounterMultiplier(10, 4) === 2.5);
  check("11 monsters -> x3", encounterMultiplier(11, 4) === 3);
  check("14 monsters -> x3", encounterMultiplier(14, 4) === 3);
  check("15 monsters -> x4", encounterMultiplier(15, 4) === 4);
  check("30 monsters -> x4 (caps here)", encounterMultiplier(30, 4) === 4);
}

// Real DMG rule: small party (<3) bumps the multiplier row up; large
// party (6+) drops it down.
function testEncounterMultiplierPartySizeAdjustment() {
  console.log("\nEncounter multiplier party-size adjustment:");
  check("3 monsters, party of 2 (small) -> bumped from x2 to x2.5", encounterMultiplier(3, 2) === 2.5, encounterMultiplier(3, 2));
  check("3 monsters, party of 6 (large) -> dropped from x2 to x1.5", encounterMultiplier(3, 6) === 1.5, encounterMultiplier(3, 6));
  check("1 monster, party of 1 (small) -> bumped from x1 to x1.5", encounterMultiplier(1, 1) === 1.5, encounterMultiplier(1, 1));
}

// Real CR->XP values (statFormulas.js's XP_BY_CR): CR 1/4 = 50 XP, CR 2 = 450 XP.
function testEncounterXp() {
  console.log("\nEncounter total XP (real CR->XP table):");
  const r = computeEncounterXp(["1/4", "2", "2"]);
  check("totalXp === 950 (50 + 450 + 450)", r.totalXp === 950, r.totalXp);
  check("monsterCount === 3", r.monsterCount === 3);
  const unknown = computeEncounterXp(["1/4", "not-a-real-cr"]);
  check("unrecognized CR contributes 0 rather than throwing", unknown.totalXp === 50, unknown.totalXp);
}

// Full end-to-end: 4 level-5 PCs vs 4 CR-2 monsters.
// Party thresholds: 4x{250,500,750,1100} = {1000,2000,3000,4400}.
// Monster XP: 4x450=1800, monsterCount=4 -> multiplier x2 -> adjusted 3600.
// 3600 >= hard(3000) but < deadly(4400) -> Hard.
function testFullEncounterHard() {
  console.log("\nFull encounter: 4 level-5 PCs vs 4 CR-2 monsters (expect Hard):");
  const r = computeEncounterDifficulty([5, 5, 5, 5], ["2", "2", "2", "2"]);
  check("thresholds.hard === 3000", r.thresholds.hard === 3000, r.thresholds.hard);
  check("thresholds.deadly === 4400", r.thresholds.deadly === 4400, r.thresholds.deadly);
  check("totalXp === 1800", r.totalXp === 1800, r.totalXp);
  check("multiplier === 2", r.multiplier === 2, r.multiplier);
  check("adjustedXp === 3600", r.adjustedXp === 3600, r.adjustedXp);
  check('difficulty === "Hard"', r.difficulty === "Hard", r.difficulty);
}

// A trivial mismatch: 4 level-10 PCs vs a single CR-1/8 monster.
// Party easy threshold alone (4x600=2400) dwarfs a 25 XP monster.
function testFullEncounterTrivial() {
  console.log("\nFull encounter: 4 level-10 PCs vs a single CR-1/8 monster (expect Trivial):");
  const r = computeEncounterDifficulty([10, 10, 10, 10], ["1/8"]);
  check('difficulty === "Trivial"', r.difficulty === "Trivial", r.difficulty);
}

// A real Deadly case: a solo level-3 PC vs a CR-3 monster.
// Threshold: {75,150,225,400}. Monster XP 700, monsterCount=1 -> x1
// (but party size 1 < 3, bumps multiplier row 1 monster from x1 to x1.5)
// -> adjusted = 1050, well above deadly(400).
function testFullEncounterDeadlySoloParty() {
  console.log("\nFull encounter: solo level-3 PC vs a CR-3 monster (expect Deadly):");
  const r = computeEncounterDifficulty([3], ["3"]);
  check("multiplier === 1.5 (small-party bump)", r.multiplier === 1.5, r.multiplier);
  check("adjustedXp === 1050", r.adjustedXp === 1050, r.adjustedXp);
  check('difficulty === "Deadly"', r.difficulty === "Deadly", r.difficulty);
}

function main() {
  testPartyThresholdsLevel1x4();
  testPartyThresholdsMixedLevels();
  testEncounterMultiplierTable();
  testEncounterMultiplierPartySizeAdjustment();
  testEncounterXp();
  testFullEncounterHard();
  testFullEncounterTrivial();
  testFullEncounterDeadlySoloParty();

  console.log("\n" + "=".repeat(50));
  if (failures.length) {
    console.log(`${failures.length} assertion(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log("All assertions passed.");
  }
}

main();
