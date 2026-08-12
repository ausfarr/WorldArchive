// scripts/test5eSpellFormulas.js
//
// Standalone test script for lib/rulesets/5e/spellFormulas.js. Verifies
// the cantrip damage-scaling table against two real, well-known SRD
// cantrips (Fire Bolt: 1d10 base; Chill Touch: 1d8 base) -- both use the
// exact same scaling rule, so this checks the formula reproduces the
// real published damage at every breakpoint.
//
// Run with: node scripts/test5eSpellFormulas.js

const { isValidSpellLevel, cantripDiceCountForLevel, cantripScalingTable, SPELL_LEVELS } = require("../lib/rulesets/5e/spellFormulas");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function testSpellLevelValidation() {
  console.log("\nSpell level validation:");
  check("level 0 (cantrip) is valid", isValidSpellLevel(0));
  check("level 9 is valid", isValidSpellLevel(9));
  check("level 10 is invalid", !isValidSpellLevel(10));
  check("level -1 is invalid", !isValidSpellLevel(-1));
  check("SPELL_LEVELS has exactly 10 entries (0-9)", SPELL_LEVELS.length === 10);
}

// Real SRD Fire Bolt: 1d10 at levels 1-4, 2d10 at 5th, 3d10 at 11th, 4d10 at 17th.
function testFireBolt() {
  console.log("\nFire Bolt (real SRD cantrip, base 1d10):");
  check("level 1 -> 1d10", cantripDiceCountForLevel(1, 1) === 1);
  check("level 4 -> 1d10 (still base tier)", cantripDiceCountForLevel(4, 1) === 1);
  check("level 5 -> 2d10", cantripDiceCountForLevel(5, 1) === 2);
  check("level 10 -> 2d10 (still tier 2)", cantripDiceCountForLevel(10, 1) === 2);
  check("level 11 -> 3d10", cantripDiceCountForLevel(11, 1) === 3);
  check("level 16 -> 3d10 (still tier 3)", cantripDiceCountForLevel(16, 1) === 3);
  check("level 17 -> 4d10", cantripDiceCountForLevel(17, 1) === 4);
  check("level 20 -> 4d10 (still tier 4)", cantripDiceCountForLevel(20, 1) === 4);

  const table = cantripScalingTable(1, 10);
  check("scaling table produces the correct 4-row display", JSON.stringify(table) === JSON.stringify([
    { levels: "1st–4th", dice: "1d10" },
    { levels: "5th–10th", dice: "2d10" },
    { levels: "11th–16th", dice: "3d10" },
    { levels: "17th–20th", dice: "4d10" }
  ]));
}

// Real SRD Chill Touch: 1d8 base.
function testChillTouch() {
  console.log("\nChill Touch (real SRD cantrip, base 1d8):");
  const table = cantripScalingTable(1, 8);
  check("1st-4th: 1d8", table[0].dice === "1d8");
  check("5th-10th: 2d8", table[1].dice === "2d8");
  check("11th-16th: 3d8", table[2].dice === "3d8");
  check("17th-20th: 4d8", table[3].dice === "4d8");
}

function main() {
  testSpellLevelValidation();
  testFireBolt();
  testChillTouch();

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
