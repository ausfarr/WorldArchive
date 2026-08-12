// scripts/test5eSurvivorFormulas.js
//
// Standalone test script for lib/rulesets/5e/survivorFormulas.js.
// Hard assertions against hand-computed HP using the PHB's official
// fixed/no-rolling method.
//
// Run with: node scripts/test5eSurvivorFormulas.js

const { computeHitPoints, abilityModifier } = require("../lib/rulesets/5e/survivorFormulas");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function testAbilityModifier() {
  console.log("\nAbility modifier:");
  check("14 -> +2", abilityModifier(14) === 2);
  check("8 -> -1", abilityModifier(8) === -1);
  check("10 -> +0", abilityModifier(10) === 0);
}

// Hand-computed: d10 hit die (Fighter), CON 14 (+2), level 1:
// 10 (max die) + 2 = 12.
function testLevel1Fighter() {
  console.log("\nLevel 1 Fighter (d10, CON 14):");
  check("HP === 12", computeHitPoints("d10", 1, 14) === 12, computeHitPoints("d10", 1, 14));
}

// Hand-computed: d10, CON 14, level 5:
// Level 1: 10+2=12. Levels 2-5 (4 levels): each (6 average + 2) = 8, x4 = 32.
// Total: 12 + 32 = 44.
function testLevel5Fighter() {
  console.log("\nLevel 5 Fighter (d10, CON 14):");
  check("HP === 44", computeHitPoints("d10", 5, 14) === 44, computeHitPoints("d10", 5, 14));
}

// Hand-computed: d6 hit die (Wizard/Sorcerer-style), CON 10 (+0), level 3:
// Level 1: 6+0=6. Levels 2-3 (2 levels): each (4+0)=4, x2=8. Total: 14.
function testLevel3Wizard() {
  console.log("\nLevel 3 d6-hit-die caster (CON 10):");
  check("HP === 14", computeHitPoints("d6", 3, 10) === 14, computeHitPoints("d6", 3, 10));
}

// Negative CON modifier shouldn't be able to push HP below 1.
function testMinimumHp() {
  console.log("\nMinimum HP floor:");
  check("d6, CON 1 (-5 mod), level 1: floored at 1, not negative", computeHitPoints("d6", 1, 1) >= 1);
}

function main() {
  testAbilityModifier();
  testLevel1Fighter();
  testLevel5Fighter();
  testLevel3Wizard();
  testMinimumHp();

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
