// scripts/testPf2eStatFormulas.js
//
// Standalone test script for lib/rulesets/pf2e/statFormulas.js, same
// convention as every other scripts/test*.js in this codebase.
//
// Unlike scripts/test5eStatFormulas.js, there's no "reverse-engineer
// from real monster stats" check here -- no verified ORC-licensed PF2e
// monster dataset exists to check against (see SESSION_LOG.md). What
// IS checked: the table lookups are internally correct (exact values at
// known rows, matching what was extracted from the source data),
// clamping/fallback behavior at the edges, and that buildCreatureBudget()
// assembles a full, sane creature from a level + role template.
//
// Run with: node scripts/testPf2eStatFormulas.js

const {
  LEVELS,
  ROLE_TEMPLATES,
  clampLevel,
  abilityModifier,
  armorClass,
  hitPoints,
  perceptionOrSave,
  strikeBonus,
  strikeDamage,
  buildCreatureBudget
} = require("../lib/rulesets/pf2e/statFormulas");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function testTableCoverage() {
  console.log("\nTable coverage (all 26 levels, -1 through 24):");
  check("LEVELS has 26 entries", LEVELS.length === 26, LEVELS.length);
  check("LEVELS starts at -1", LEVELS[0] === -1);
  check("LEVELS ends at 24", LEVELS[LEVELS.length - 1] === 24);
  LEVELS.forEach((lvl) => {
    check(`level ${lvl} has a moderate AC value`, typeof armorClass(lvl, "moderate") === "number", armorClass(lvl, "moderate"));
    check(`level ${lvl} has a moderate strike damage string`, typeof strikeDamage(lvl, "moderate") === "string", strikeDamage(lvl, "moderate"));
  });
}

function testKnownValues() {
  console.log("\nKnown-value spot checks (extracted directly from the source table -- see statFormulas.js header for provenance):");
  check("Level 1 moderate AC === 15", armorClass(1, "moderate") === 15, armorClass(1, "moderate"));
  check("Level 1 moderate HP === 20", hitPoints(1, "moderate") === 20, hitPoints(1, "moderate"));
  check("Level 1 moderate strike bonus === 7", strikeBonus(1, "moderate") === 7, strikeBonus(1, "moderate"));
  check("Level 1 moderate strike damage === '1d6+2'", strikeDamage(1, "moderate") === "1d6+2", strikeDamage(1, "moderate"));
  check("Level -1 low HP === 5", hitPoints(-1, "low") === 5, hitPoints(-1, "low"));
  check("Level 24 extreme AC === 54", armorClass(24, "extreme") === 54, armorClass(24, "extreme"));
  check("Level 1 moderate ability modifier === 3", abilityModifier(1, "moderate") === 3, abilityModifier(1, "moderate"));
}

function testMonotonicity() {
  console.log("\nMonotonicity sanity check (every category should never DECREASE as level increases, for a fixed tier -- catches transcription errors like the one caught in the 5e CR table):");
  ["extreme", "high", "moderate", "low"].forEach((tier) => {
    let prevAc = -Infinity;
    let brokenAc = false;
    LEVELS.forEach((lvl) => {
      const v = armorClass(lvl, tier);
      if (v < prevAc) brokenAc = true;
      prevAc = v;
    });
    check(`AC (${tier} tier) is monotonically non-decreasing across all levels`, !brokenAc);
  });
}

function testClamping() {
  console.log("\nLevel clamping:");
  check("clampLevel(30) === 24", clampLevel(30) === 24, clampLevel(30));
  check("clampLevel(-10) === -1", clampLevel(-10) === -1, clampLevel(-10));
  check("clampLevel(3.7) rounds to 4", clampLevel(3.7) === 4, clampLevel(3.7));
}

function testBuildCreatureBudget() {
  console.log("\nbuildCreatureBudget() assembly:");
  const moderate = buildCreatureBudget(1, {});
  check("default (unspecified) tiers resolve to moderate values", moderate.armorClass === 15 && moderate.hitPoints === 20, JSON.stringify(moderate));

  const brute = buildCreatureBudget(3, ROLE_TEMPLATES.brute);
  check("brute template: high CON > moderate CON at the same level", brute.abilities.con > buildCreatureBudget(3, {}).abilities.con);
  check("brute template: low AC < moderate AC at the same level", brute.armorClass < buildCreatureBudget(3, {}).armorClass);
  check("brute template: extreme strike damage differs from moderate", brute.strikeDamage !== buildCreatureBudget(3, {}).strikeDamage);

  Object.keys(ROLE_TEMPLATES).forEach((roleName) => {
    const budget = buildCreatureBudget(5, ROLE_TEMPLATES[roleName]);
    check(`role '${roleName}' produces a complete budget at level 5`, budget.armorClass > 0 && budget.hitPoints > 0 && typeof budget.strikeDamage === "string");
  });
}

function main() {
  testTableCoverage();
  testKnownValues();
  testMonotonicity();
  testClamping();
  testBuildCreatureBudget();

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
