// scripts/testPf2eSurvivorFormulas.js
//
// Standalone test script for lib/rulesets/pf2e/survivorFormulas.js.
//
// Run with: node scripts/testPf2eSurvivorFormulas.js

const { computePcProfile } = require("../lib/rulesets/pf2e/survivorFormulas");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

const TEST_CLASS = {
  keyAbility: "str",
  hpTier: "high",
  classDcSchedule: [{ level: 1, rank: "trained" }, { level: 7, rank: "expert" }],
  goodSaves: ["fortitude", "will"]
};

function testComputePcProfile() {
  console.log("\nPC profile at level 1 (Str 18 [+4 mod], Con 14 [+2 mod]):");
  const abilities = { str: 18, con: 14 };
  const profile = computePcProfile({ classContent: TEST_CLASS, level: 1, abilities });
  // HP: ancestry 8 + high tier 12 + con mod 2 = 22
  check("HP = 8 + 12 + 2 = 22", profile.hitPoints === 22, profile.hitPoints);
  // Class DC: level 1, trained (bonus 3), key ability (str, +4): 10+3+4=17
  check("Class DC = 10 + 3 + 4 = 17", profile.classDC === 17, profile.classDC);
  // Good saves (fortitude, will): expert at level 1 -> bonus = level(1)+4 = 5
  check("Fortitude (good save) = 5", profile.savingThrows.fortitude === 5, profile.savingThrows.fortitude);
  check("Will (good save) = 5", profile.savingThrows.will === 5, profile.savingThrows.will);
  // Poor save (reflex): trained at level 1 -> bonus = level(1)+2 = 3
  check("Reflex (poor save) = 3", profile.savingThrows.reflex === 3, profile.savingThrows.reflex);
  // Perception: trained at level 1 -> 1+2=3
  check("Perception = 3", profile.perception === 3, profile.perception);

  console.log("\nPC profile at level 7 (Class DC schedule ranks up to expert here):");
  const profile7 = computePcProfile({ classContent: TEST_CLASS, level: 7, abilities });
  // Class DC: level 7, expert (bonus 11), +4 mod: 10+11+4=25
  check("Class DC at level 7 = 10 + 11 + 4 = 25", profile7.classDC === 25, profile7.classDC);
  // Good save at level 7: still expert tier (ranks up to master at 9): bonus = 7+4=11
  check("Fortitude at level 7 still expert-tier = 11", profile7.savingThrows.fortitude === 11, profile7.savingThrows.fortitude);

  console.log("\nMissing ability scores default to 10 (modifier 0):");
  const profileDefault = computePcProfile({ classContent: TEST_CLASS, level: 1, abilities: {} });
  // HP: 8 + 12 + 0 = 20
  check("HP with no Con given = 8 + 12 + 0 = 20", profileDefault.hitPoints === 20, profileDefault.hitPoints);
}

testComputePcProfile();

console.log("\n" + "=".repeat(60));
if (failures.length === 0) {
  console.log("All checks passed.");
  process.exit(0);
} else {
  console.log(`${failures.length} check(s) FAILED:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
