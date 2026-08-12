// scripts/test5eItemFormulas.js
//
// Standalone test script for lib/rulesets/5e/itemFormulas.js. Hard
// assertions against real, well-known SRD equipment stats.
//
// Run with: node scripts/test5eItemFormulas.js

const { lookupWeapon, lookupArmor, rarityValueWarning, RARITY_VALUE_RANGES } = require("../lib/rulesets/5e/itemFormulas");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function testWeapons() {
  console.log("\nWeapon lookups (real SRD stats):");
  const longsword = lookupWeapon("Longsword");
  check("Longsword: 1d8 slashing, Martial Melee, Versatile", longsword.damageDice === "1d8" && longsword.damageType === "slashing" && longsword.category === "Martial Melee" && longsword.properties.includes("Versatile"));

  const greatsword = lookupWeapon("greatsword");
  check("Greatsword: 2d6 slashing, Heavy+Two-Handed", greatsword.damageDice === "2d6" && greatsword.properties.includes("Heavy") && greatsword.properties.includes("Two-Handed"));

  const dagger = lookupWeapon("Dagger");
  check("Dagger: 1d4 piercing, Finesse+Light+Thrown", dagger.damageDice === "1d4" && dagger.properties.includes("Finesse") && dagger.properties.includes("Thrown"));

  check("case-insensitive lookup works", lookupWeapon("LONGSWORD") !== null);
  check("unknown weapon returns null", lookupWeapon("Laser Rifle") === null);
}

function testArmor() {
  console.log("\nArmor lookups (real SRD stats):");
  const leather = lookupArmor("Leather");
  check("Leather: AC 11, full dex, Light, no stealth disadvantage", leather.baseAc === 11 && leather.dexBonus === "full" && leather.category === "Light" && leather.stealthDisadvantage === false);

  const chainMail = lookupArmor("chain mail");
  check("Chain Mail: AC 16, no dex bonus, Heavy, str 13 required", chainMail.baseAc === 16 && chainMail.dexBonus === "none" && chainMail.category === "Heavy" && chainMail.strengthMin === 13);

  const plate = lookupArmor("Plate");
  check("Plate: AC 18, str 15 required, stealth disadvantage", plate.baseAc === 18 && plate.strengthMin === 15 && plate.stealthDisadvantage === true);

  const shield = lookupArmor("shield");
  check("Shield: +2 AC", shield.baseAc === 2 && shield.category === "Shield");
}

function testRarityWarnings() {
  console.log("\nRarity value-range warnings (DMG table):");
  check("Common at 75gp: no warning (in range)", rarityValueWarning("Common", 75) === null);
  check("Common at 5000gp: warns (way above range)", rarityValueWarning("Common", 5000) !== null);
  check("Rare at 2000gp: no warning (in range)", rarityValueWarning("Rare", 2000) === null);
  check("Rare at 50gp: warns (below range)", rarityValueWarning("Rare", 50) !== null);
  check("Legendary at 100000gp: no warning (no upper bound)", rarityValueWarning("Legendary", 100000) === null);
  check("Artifact: never warns (no defined range)", rarityValueWarning("Artifact", 1) === null);
  check("RARITY_VALUE_RANGES has exactly 6 tiers", Object.keys(RARITY_VALUE_RANGES).length === 6);
}

function main() {
  testWeapons();
  testArmor();
  testRarityWarnings();

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
