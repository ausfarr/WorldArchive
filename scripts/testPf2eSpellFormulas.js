// scripts/testPf2eSpellFormulas.js
//
// Standalone test script for lib/rulesets/pf2e/spellFormulas.js.
//
// Run with: node scripts/testPf2eSpellFormulas.js

const { maxSpellRankForLevel, cantripRankForLevel, computeHeightenedDiceCount, isValidRank } = require("../lib/rulesets/pf2e/spellFormulas");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function testMaxSpellRank() {
  console.log("\nMax spell rank by level (verified: ceil(level/2), capped at 10):");
  check("level 1 -> rank 1", maxSpellRankForLevel(1) === 1);
  check("level 2 -> rank 1", maxSpellRankForLevel(2) === 1);
  check("level 3 -> rank 2", maxSpellRankForLevel(3) === 2);
  check("level 19 -> rank 10 (real worked example)", maxSpellRankForLevel(19) === 10);
  check("level 20 -> still rank 10 (no 11th rank exists)", maxSpellRankForLevel(20) === 10);

  console.log("\nCantrip rank (verified: same formula as max spell rank):");
  check("cantrip at level 1 -> rank 1", cantripRankForLevel(1) === 1);
  check("cantrip at level 20 -> rank 10", cantripRankForLevel(20) === 10);

  let threw = false;
  try { maxSpellRankForLevel(21); } catch (e) { threw = true; }
  check("rejects out-of-range level", threw);
}

function testHeightening() {
  console.log("\nHeightened (+N) cumulative scaling (real worked example: Fireball 6d6 at rank 3, +2d6/rank):");
  check("cast at base rank 3 -> 6d6 (no increase)", computeHeightenedDiceCount(6, 3, 2, 3) === 6);
  check("cast at rank 4 -> 8d6 (real cited value)", computeHeightenedDiceCount(6, 3, 2, 4) === 8);
  check("cast at rank 5 -> 10d6 (real cited value)", computeHeightenedDiceCount(6, 3, 2, 5) === 10);
  check("cast at rank 10 -> 6 + 2*7 = 20d6", computeHeightenedDiceCount(6, 3, 2, 10) === 20);

  let threw = false;
  try { computeHeightenedDiceCount(6, 3, 2, 2); } catch (e) { threw = true; }
  check("rejects casting below the spell's base rank", threw);
}

function testValidRank() {
  console.log("\nRank validation:");
  check("rank 1 valid", isValidRank(1));
  check("rank 10 valid", isValidRank(10));
  check("rank 11 invalid", !isValidRank(11));
  check("rank 0 invalid", !isValidRank(0));
}

testMaxSpellRank();
testHeightening();
testValidRank();

console.log("\n" + "=".repeat(60));
if (failures.length === 0) {
  console.log("All checks passed.");
  process.exit(0);
} else {
  console.log(`${failures.length} check(s) FAILED:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
