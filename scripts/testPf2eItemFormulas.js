// scripts/testPf2eItemFormulas.js
//
// Standalone test script for lib/rulesets/pf2e/itemFormulas.js.
//
// Run with: node scripts/testPf2eItemFormulas.js

const {
  priceGuidance,
  potencyTier,
  strikingTier,
  resilientTier,
  bulkValue,
  computeTotalBulk,
  encumberedThreshold,
  maxCarryCapacity
} = require("../lib/rulesets/pf2e/itemFormulas");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function testRuneTiers() {
  console.log("\nFundamental rune tiers (verified bonus values):");
  check("potency tier 1 -> +1 bonus, 1 rune slot", potencyTier(1).attackOrAcBonus === 1 && potencyTier(1).runeSlots === 1);
  check("potency tier 3 -> +3 bonus, 3 rune slots", potencyTier(3).attackOrAcBonus === 3 && potencyTier(3).runeSlots === 3);
  check("striking tier 1 -> +1 extra die, labeled 'Striking'", strikingTier(1).extraDice === 1 && strikingTier(1).label === "Striking");
  check("striking tier 2 -> +2 extra dice, labeled 'Greater Striking'", strikingTier(2).extraDice === 2 && strikingTier(2).label === "Greater Striking");
  check("resilient tier 3 -> +3 save bonus, labeled 'Major Resilient'", resilientTier(3).saveBonus === 3 && resilientTier(3).label === "Major Resilient");

  let threw = false;
  try { potencyTier(4); } catch (e) { threw = true; }
  check("rejects an unknown potency tier", threw);
}

function testBulk() {
  console.log("\nBulk (verified: 10 Light = 1 Bulk, round down fractions):");
  check("light item token = 0.1", bulkValue("light") === 0.1);
  check("negligible token = 0", bulkValue("negligible") === 0);
  check("9 light items = 0 total Bulk (real worked example: 'round down fractions')", computeTotalBulk([{ bulk: "light", quantity: 9 }]) === 0);
  check("11 light items = 1 total Bulk", computeTotalBulk([{ bulk: "light", quantity: 11 }]) === 1);
  check("10 light items = 1 total Bulk exactly", computeTotalBulk([{ bulk: "light", quantity: 10 }]) === 1);
  check("mixed items sum correctly: 2x Bulk-1 + 5 light = 2.5 -> floors to 2", computeTotalBulk([{ bulk: "1", quantity: 2 }, { bulk: "light", quantity: 5 }]) === 2);
  check("empty item list = 0 Bulk", computeTotalBulk([]) === 0);

  console.log("\nEncumbrance thresholds (verified: 5 + Str mod encumbered, 10 + Str mod max):");
  check("Str mod +2 -> encumbered at 7 Bulk", encumberedThreshold(2) === 7);
  check("Str mod +2 -> max carry 12 Bulk", maxCarryCapacity(2) === 12);
  check("Str mod -1 -> encumbered at 4 Bulk", encumberedThreshold(-1) === 4);
}

function testPriceGuidance() {
  console.log("\nPrice guidance (this project's own labeled-estimate interpolation, not an official table):");
  const lvl1 = priceGuidance(1, "primary");
  check("level 1 primary item is marked estimated", lvl1.estimated === true);
  check("level 1 bracket matches the verified ~15gp anchor's range (1-60gp)", lvl1.minGp === 1 && lvl1.maxGp === 60);

  const lvl20 = priceGuidance(20, "primary");
  check("level 20 bracket matches the verified ~70,000gp anchor", lvl20.maxGp === 70000);

  console.log("\nCategory position within a bracket (primary > secondary > tertiary):");
  const primary = priceGuidance(10, "primary").suggestedGp;
  const secondary = priceGuidance(10, "secondary").suggestedGp;
  const tertiary = priceGuidance(10, "tertiary").suggestedGp;
  check("primary > secondary > tertiary at the same level", primary > secondary && secondary > tertiary, `${primary} / ${secondary} / ${tertiary}`);

  let threw = false;
  try { priceGuidance(25, "primary"); } catch (e) { threw = true; }
  check("rejects an out-of-range item level", threw);
}

testRuneTiers();
testBulk();
testPriceGuidance();

console.log("\n" + "=".repeat(60));
if (failures.length === 0) {
  console.log("All checks passed.");
  process.exit(0);
} else {
  console.log(`${failures.length} check(s) FAILED:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
