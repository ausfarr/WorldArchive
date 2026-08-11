// scripts/test5eClassFormulas.js
//
// Standalone test script for lib/rulesets/5e/classFormulas.js. Hard
// assertions against the same real, cross-referenced values documented
// in that file's header comment (Wizard full-caster slots at levels
// 1/3/5/9/17/20, Paladin half-caster slots, Warlock Pact Magic
// progression, proficiency bonus by level, subclass unlock levels).
//
// Run with: node scripts/test5eClassFormulas.js

const {
  proficiencyBonusForLevel,
  subclassUnlockLevel,
  spellSlotsForLevel,
  ABILITY_SCORE_IMPROVEMENT_LEVELS
} = require("../lib/rulesets/5e/classFormulas");

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
  console.log("\nProficiency bonus by level:");
  check("level 1 -> +2", proficiencyBonusForLevel(1) === 2);
  check("level 4 -> +2", proficiencyBonusForLevel(4) === 2);
  check("level 5 -> +3", proficiencyBonusForLevel(5) === 3);
  check("level 8 -> +3", proficiencyBonusForLevel(8) === 3);
  check("level 9 -> +4", proficiencyBonusForLevel(9) === 4);
  check("level 12 -> +4", proficiencyBonusForLevel(12) === 4);
  check("level 13 -> +5", proficiencyBonusForLevel(13) === 5);
  check("level 16 -> +5", proficiencyBonusForLevel(16) === 5);
  check("level 17 -> +6", proficiencyBonusForLevel(17) === 6);
  check("level 20 -> +6", proficiencyBonusForLevel(20) === 6);
}

function testSubclassUnlockLevels() {
  console.log("\nSubclass unlock levels (verified real values):");
  check("Cleric unlocks at 1", subclassUnlockLevel("cleric") === 1);
  check("Sorcerer unlocks at 1", subclassUnlockLevel("sorcerer") === 1);
  check("Warlock unlocks at 1", subclassUnlockLevel("warlock") === 1);
  check("Druid unlocks at 2", subclassUnlockLevel("druid") === 2);
  check("Wizard unlocks at 2", subclassUnlockLevel("wizard") === 2);
  ["barbarian", "bard", "fighter", "monk", "paladin", "ranger", "rogue"].forEach((c) => {
    check(`${c} unlocks at 3`, subclassUnlockLevel(c) === 3);
  });
}

function testAsiLevels() {
  console.log("\nAbility Score Improvement levels (base pattern):");
  check("ASI levels are [4, 8, 12, 16, 19]", JSON.stringify(ABILITY_SCORE_IMPROVEMENT_LEVELS) === JSON.stringify([4, 8, 12, 16, 19]));
}

// Real Wizard (full caster) spell slots, verified against independent
// cross-reference data -- see classFormulas.js header.
function testFullCasterSlots() {
  console.log("\nFull caster spell slots (real, cross-referenced Wizard progression):");
  check("level 1: [2,0,0,0,0,0,0,0,0]", JSON.stringify(spellSlotsForLevel("full", 1)) === JSON.stringify([2, 0, 0, 0, 0, 0, 0, 0, 0]));
  check("level 3: [4,2,0,0,0,0,0,0,0]", JSON.stringify(spellSlotsForLevel("full", 3)) === JSON.stringify([4, 2, 0, 0, 0, 0, 0, 0, 0]));
  check("level 5: [4,3,2,0,0,0,0,0,0]", JSON.stringify(spellSlotsForLevel("full", 5)) === JSON.stringify([4, 3, 2, 0, 0, 0, 0, 0, 0]));
  check("level 9: [4,3,3,3,1,0,0,0,0]", JSON.stringify(spellSlotsForLevel("full", 9)) === JSON.stringify([4, 3, 3, 3, 1, 0, 0, 0, 0]));
  check("level 17: [4,3,3,3,2,1,1,1,1]", JSON.stringify(spellSlotsForLevel("full", 17)) === JSON.stringify([4, 3, 3, 3, 2, 1, 1, 1, 1]));
  check("level 20: [4,3,3,3,3,2,2,1,1]", JSON.stringify(spellSlotsForLevel("full", 20)) === JSON.stringify([4, 3, 3, 3, 3, 2, 2, 1, 1]));
}

// Real Paladin (half caster) spell slots.
function testHalfCasterSlots() {
  console.log("\nHalf caster spell slots (real, cross-referenced Paladin progression):");
  check("level 1: no slots yet", JSON.stringify(spellSlotsForLevel("half", 1)) === JSON.stringify([0, 0, 0, 0, 0]));
  check("level 2: [2,0,0,0,0]", JSON.stringify(spellSlotsForLevel("half", 2)) === JSON.stringify([2, 0, 0, 0, 0]));
  check("level 5: [4,2,0,0,0]", JSON.stringify(spellSlotsForLevel("half", 5)) === JSON.stringify([4, 2, 0, 0, 0]));
  check("level 9: [4,3,2,0,0]", JSON.stringify(spellSlotsForLevel("half", 9)) === JSON.stringify([4, 3, 2, 0, 0]));
  check("level 17: [4,3,3,3,1]", JSON.stringify(spellSlotsForLevel("half", 17)) === JSON.stringify([4, 3, 3, 3, 1]));
  check("level 20: [4,3,3,3,2]", JSON.stringify(spellSlotsForLevel("half", 20)) === JSON.stringify([4, 3, 3, 3, 2]));
}

// Real Warlock Pact Magic progression.
function testWarlockPactMagic() {
  console.log("\nWarlock Pact Magic (real, cross-referenced progression):");
  check("level 1: 1 slot at slot-level 1", JSON.stringify(spellSlotsForLevel("warlock", 1)) === JSON.stringify({ slots: 1, slotLevel: 1 }));
  check("level 2: 2 slots at slot-level 1", JSON.stringify(spellSlotsForLevel("warlock", 2)) === JSON.stringify({ slots: 2, slotLevel: 1 }));
  check("level 5: 2 slots at slot-level 3", JSON.stringify(spellSlotsForLevel("warlock", 5)) === JSON.stringify({ slots: 2, slotLevel: 3 }));
  check("level 9: 2 slots at slot-level 5", JSON.stringify(spellSlotsForLevel("warlock", 9)) === JSON.stringify({ slots: 2, slotLevel: 5 }));
  check("level 11: 3 slots at slot-level 5", JSON.stringify(spellSlotsForLevel("warlock", 11)) === JSON.stringify({ slots: 3, slotLevel: 5 }));
  check("level 17: 4 slots at slot-level 5 (caps here)", JSON.stringify(spellSlotsForLevel("warlock", 17)) === JSON.stringify({ slots: 4, slotLevel: 5 }));
}

function testThirdCaster() {
  console.log("\nThird caster (computed via floor(level/3) into the full-caster table -- the real multiclassing RAW rule):");
  const level9Third = spellSlotsForLevel("third", 9); // floor(9/3)=3 -> full caster level 3 row
  check("level 9 third-caster matches full-caster level 3", JSON.stringify(level9Third) === JSON.stringify([4, 2, 0, 0, 0, 0, 0, 0, 0]), JSON.stringify(level9Third));
}

function main() {
  testProficiencyBonus();
  testSubclassUnlockLevels();
  testAsiLevels();
  testFullCasterSlots();
  testHalfCasterSlots();
  testWarlockPactMagic();
  testThirdCaster();

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
