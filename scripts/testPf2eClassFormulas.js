// scripts/testPf2eClassFormulas.js
//
// Standalone test script for lib/rulesets/pf2e/classFormulas.js.
//
// Run with: node scripts/testPf2eClassFormulas.js

const {
  proficiencyBonus,
  validateProficiencySchedule,
  proficiencyAtLevel,
  computeClassDC,
  computeHitPoints,
  abilityModifierFromScore,
  abilityBoostLevelsUpTo,
  skillIncreaseLevelsUpTo
} = require("../lib/rulesets/pf2e/classFormulas");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function testProficiencyBonus() {
  console.log("\nProficiency bonus (verified real formula: level + rank value, untrained always +0):");
  check("untrained at level 1 = 0", proficiencyBonus("untrained", 1) === 0);
  check("untrained at level 20 = 0 (level never added)", proficiencyBonus("untrained", 20) === 0);
  check("trained at level 1 = 3 (real worked example: 'typically +3 for most 1st-level characters')", proficiencyBonus("trained", 1) === 3);
  check("expert at level 5 = 9", proficiencyBonus("expert", 5) === 9);
  check("master at level 10 = 16", proficiencyBonus("master", 10) === 16);
  check("legendary at level 20 = 28", proficiencyBonus("legendary", 20) === 28);
  let threw = false;
  try { proficiencyBonus("trained", 21); } catch (e) { threw = true; }
  check("throws on out-of-range level", threw);
}

function testAbilityModifier() {
  console.log("\nAbility modifier from score (same universal floor((score-10)/2) as 5e):");
  check("score 10 -> 0", abilityModifierFromScore(10) === 0);
  check("score 18 -> +4", abilityModifierFromScore(18) === 4);
  check("score 8 -> -1", abilityModifierFromScore(8) === -1);
  check("score 20 -> +5", abilityModifierFromScore(20) === 5);
}

function testProficiencySchedule() {
  console.log("\nProficiency schedule validation (a class's own proposed rank-up levels):");
  const goodSchedule = [{ level: 1, rank: "trained" }, { level: 7, rank: "expert" }, { level: 15, rank: "master" }];
  check("well-formed ascending schedule is valid", validateProficiencySchedule(goodSchedule).valid);

  const missingLevel1 = [{ level: 3, rank: "trained" }];
  check("rejects schedule missing a level-1 entry", !validateProficiencySchedule(missingLevel1).valid);

  const decreasing = [{ level: 1, rank: "expert" }, { level: 7, rank: "trained" }];
  check("rejects a schedule where rank decreases", !validateProficiencySchedule(decreasing).valid);

  const duplicateLevel = [{ level: 1, rank: "trained" }, { level: 1, rank: "expert" }];
  check("rejects duplicate levels", !validateProficiencySchedule(duplicateLevel).valid);

  const badRank = [{ level: 1, rank: "godlike" }];
  check("rejects an unknown rank name", !validateProficiencySchedule(badRank).valid);

  const outOfRange = [{ level: 1, rank: "trained" }, { level: 25, rank: "expert" }];
  check("rejects an out-of-range level", !validateProficiencySchedule(outOfRange).valid);

  console.log("\nProficiency-at-level lookup against that same schedule:");
  check("level 1 -> trained", proficiencyAtLevel(goodSchedule, 1).rank === "trained");
  check("level 6 -> still trained (rank-up hasn't hit yet)", proficiencyAtLevel(goodSchedule, 6).rank === "trained");
  check("level 7 -> expert", proficiencyAtLevel(goodSchedule, 7).rank === "expert");
  check("level 20 -> master (last entry carries forward)", proficiencyAtLevel(goodSchedule, 20).rank === "master");
  check("level 7 bonus = 7 + 4 = 11", proficiencyAtLevel(goodSchedule, 7).bonus === 11);
}

function testClassDC() {
  console.log("\nClass DC (10 + proficiency bonus + key ability modifier -- verified real formula):");
  const schedule = [{ level: 1, rank: "trained" }, { level: 7, rank: "expert" }];
  // Level 1, trained (bonus 3), key ability score 18 (+4 mod): 10+3+4=17
  check("level 1, trained, 18 key ability -> DC 17", computeClassDC(schedule, 18, 1) === 17);
  // Level 7, expert (bonus 11), key ability score 18 (+4): 10+11+4=25
  check("level 7, expert, 18 key ability -> DC 25", computeClassDC(schedule, 18, 7) === 25);
}

function testHitPoints() {
  console.log("\nHit points (ancestryHp + classHp + conMod at level 1; classHp + conMod per level after):");
  // Ancestry 8, high tier (12/level), Con 14 (+2 mod), level 1: 8+12+2=22
  check("level 1: 8 ancestry + 12 class + 2 con = 22", computeHitPoints({ ancestryHp: 8, hpTier: "high", level: 1, conScore: 14 }) === 22);
  // level 5: 22 + 4*(12+2) = 22 + 56 = 78
  check("level 5: 22 + 4 * (12+2) = 78", computeHitPoints({ ancestryHp: 8, hpTier: "high", level: 5, conScore: 14 }) === 78);
  // caster tier, low con
  check("caster tier (6/level) computes a lower total than high tier at the same level", computeHitPoints({ ancestryHp: 8, hpTier: "caster", level: 5, conScore: 14 }) < computeHitPoints({ ancestryHp: 8, hpTier: "high", level: 5, conScore: 14 }));
  console.log("\nHP floor:");
  check("very low Con at level 1 never goes below 1", computeHitPoints({ ancestryHp: 6, hpTier: "caster", level: 1, conScore: 1 }) >= 1);
}

function testLevelMilestones() {
  console.log("\nAbility boost / skill increase level lists (verified real level sets):");
  check("ability boosts up to level 12 = [5, 10]", JSON.stringify(abilityBoostLevelsUpTo(12)) === JSON.stringify([5, 10]));
  check("ability boosts up to level 20 = [5, 10, 15, 20]", JSON.stringify(abilityBoostLevelsUpTo(20)) === JSON.stringify([5, 10, 15, 20]));
  check("skill increases up to level 8 = [3, 5, 7]", JSON.stringify(skillIncreaseLevelsUpTo(8)) === JSON.stringify([3, 5, 7]));
  check("skill increases up to level 20 has 9 entries (3..19 odd)", skillIncreaseLevelsUpTo(20).length === 9);
}

testProficiencyBonus();
testAbilityModifier();
testProficiencySchedule();
testClassDC();
testHitPoints();
testLevelMilestones();

console.log("\n" + "=".repeat(60));
if (failures.length === 0) {
  console.log("All checks passed.");
  process.exit(0);
} else {
  console.log(`${failures.length} check(s) FAILED:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
