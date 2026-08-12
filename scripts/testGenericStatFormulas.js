// scripts/testGenericStatFormulas.js
//
// Standalone test script for lib/rulesets/generic/statFormulas.js.
//
// Run with: node scripts/testGenericStatFormulas.js

const { evaluateDerivedStat, computeDerivedStats, validateAttributeKeys } = require("../lib/rulesets/generic/statFormulas");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function testEvaluateDerivedStat() {
  console.log("\nSingle formula evaluation:");
  const formula = { key: "hitPoints", label: "Hit Points", attributeKey: "might", coefficient: 3, base: 5 };
  check("might=10 -> 5 + 3*10 = 35", evaluateDerivedStat(formula, { might: 10 }) === 35);
  check("missing attribute treated as 0 -> base only", evaluateDerivedStat(formula, {}) === 5);
  check("negative coefficient works", evaluateDerivedStat({ ...formula, coefficient: -1 }, { might: 10 }) === -5);
}

function testComputeDerivedStats() {
  console.log("\nFull derived-stats computation:");
  const genericSystem = {
    attributes: [{ key: "might", label: "Might" }, { key: "grit", label: "Grit" }],
    useFormula: true,
    derivedStats: [
      { key: "hitPoints", label: "Hit Points", attributeKey: "might", coefficient: 4, base: 10 },
      { key: "armor", label: "Armor", attributeKey: "grit", coefficient: 1, base: 5 }
    ]
  };
  const result = computeDerivedStats(genericSystem, { might: 8, grit: 3 });
  check("hitPoints = 10 + 4*8 = 42", result.hitPoints === 42, JSON.stringify(result));
  check("armor = 5 + 1*3 = 8", result.armor === 8, JSON.stringify(result));

  console.log("\nFlavor-text-only worlds (useFormula: false):");
  const noFormulaSystem = { attributes: [{ key: "might", label: "Might" }], useFormula: false };
  const empty = computeDerivedStats(noFormulaSystem, { might: 8 });
  check("returns {} when useFormula is false -- never forces computed math where none was requested", Object.keys(empty).length === 0, JSON.stringify(empty));
  check("returns {} when genericSystem is null", Object.keys(computeDerivedStats(null, { might: 8 })).length === 0);
}

function testValidateAttributeKeys() {
  console.log("\nAttribute key validation:");
  const genericSystem = { attributes: [{ key: "might", label: "Might" }, { key: "grit", label: "Grit" }] };
  check("valid keys pass", validateAttributeKeys(genericSystem, { might: 8, grit: 3 }).valid === true);
  const invalid = validateAttributeKeys(genericSystem, { might: 8, luck: 5 });
  check("unknown key caught", invalid.valid === false && invalid.unknownKeys.includes("luck"), JSON.stringify(invalid));
  check("no genericSystem -> always valid (nothing to validate against)", validateAttributeKeys(null, { anything: 1 }).valid === true);
}

function main() {
  testEvaluateDerivedStat();
  testComputeDerivedStats();
  testValidateAttributeKeys();

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
