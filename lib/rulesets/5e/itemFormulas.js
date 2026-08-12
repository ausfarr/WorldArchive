// lib/rulesets/5e/itemFormulas.js
//
// Real 5e equipment data (Phase 6): mundane weapon/armor lookup tables
// (real fixed stats, not derived formulas -- see this project's scope
// doc: "this is mostly a lookup table, not a derived formula, treat it
// that way, don't force Echoes' damage-formula shape onto it") and the
// DMG's magic item rarity value-range table.
//
// DATA PROVENANCE: standard SRD equipment stats (weapon damage dice/
// properties/cost/weight, armor AC/dex-bonus-cap/strength-requirement/
// stealth-disadvantage) -- among the most widely reproduced tables in
// the entire game. Cross-checked programmatically against
// 5e-bits/5e-database's equipment JSON (cross-reference only, same
// non-licensing-source reasoning as every other formula file in this
// project -- that repo's content stays excluded per Phase 2's OGL 1.0a
// finding). Magic item rarity value ranges verified against the DMG's
// well-known table via search cross-reference.

const WEAPONS = {
  // Simple Melee
  club: { category: "Simple Melee", damageDice: "1d4", damageType: "bludgeoning", properties: ["Light", "Monk"], costGp: 0.1, weightLb: 2 },
  dagger: { category: "Simple Melee", damageDice: "1d4", damageType: "piercing", properties: ["Finesse", "Light", "Thrown", "Monk"], costGp: 2, weightLb: 1 },
  greatclub: { category: "Simple Melee", damageDice: "1d8", damageType: "bludgeoning", properties: ["Two-Handed"], costGp: 0.2, weightLb: 10 },
  handaxe: { category: "Simple Melee", damageDice: "1d6", damageType: "slashing", properties: ["Light", "Thrown", "Monk"], costGp: 5, weightLb: 2 },
  javelin: { category: "Simple Melee", damageDice: "1d6", damageType: "piercing", properties: ["Thrown", "Monk"], costGp: 0.5, weightLb: 2 },
  "light hammer": { category: "Simple Melee", damageDice: "1d4", damageType: "bludgeoning", properties: ["Light", "Thrown", "Monk"], costGp: 2, weightLb: 2 },
  mace: { category: "Simple Melee", damageDice: "1d6", damageType: "bludgeoning", properties: ["Monk"], costGp: 5, weightLb: 4 },
  quarterstaff: { category: "Simple Melee", damageDice: "1d6", damageType: "bludgeoning", properties: ["Versatile", "Monk"], costGp: 0.2, weightLb: 4 },
  sickle: { category: "Simple Melee", damageDice: "1d4", damageType: "slashing", properties: ["Light", "Monk"], costGp: 1, weightLb: 2 },
  spear: { category: "Simple Melee", damageDice: "1d6", damageType: "piercing", properties: ["Thrown", "Versatile", "Monk"], costGp: 1, weightLb: 3 },
  // Simple Ranged
  "light crossbow": { category: "Simple Ranged", damageDice: "1d8", damageType: "piercing", properties: ["Ammunition", "Loading", "Two-Handed"], costGp: 25, weightLb: 5 },
  dart: { category: "Simple Ranged", damageDice: "1d4", damageType: "piercing", properties: ["Finesse", "Thrown"], costGp: 0.05, weightLb: 0.25 },
  shortbow: { category: "Simple Ranged", damageDice: "1d6", damageType: "piercing", properties: ["Ammunition", "Two-Handed"], costGp: 25, weightLb: 2 },
  sling: { category: "Simple Ranged", damageDice: "1d4", damageType: "bludgeoning", properties: ["Ammunition"], costGp: 0.1, weightLb: 0 },
  // Martial Melee
  battleaxe: { category: "Martial Melee", damageDice: "1d8", damageType: "slashing", properties: ["Versatile"], costGp: 10, weightLb: 4 },
  flail: { category: "Martial Melee", damageDice: "1d8", damageType: "bludgeoning", properties: [], costGp: 10, weightLb: 2 },
  glaive: { category: "Martial Melee", damageDice: "1d10", damageType: "slashing", properties: ["Heavy", "Reach", "Two-Handed"], costGp: 20, weightLb: 6 },
  greataxe: { category: "Martial Melee", damageDice: "1d12", damageType: "slashing", properties: ["Heavy", "Two-Handed"], costGp: 30, weightLb: 7 },
  greatsword: { category: "Martial Melee", damageDice: "2d6", damageType: "slashing", properties: ["Heavy", "Two-Handed"], costGp: 50, weightLb: 6 },
  halberd: { category: "Martial Melee", damageDice: "1d10", damageType: "slashing", properties: ["Heavy", "Reach", "Two-Handed"], costGp: 20, weightLb: 6 },
  longsword: { category: "Martial Melee", damageDice: "1d8", damageType: "slashing", properties: ["Versatile"], costGp: 15, weightLb: 3 },
  maul: { category: "Martial Melee", damageDice: "2d6", damageType: "bludgeoning", properties: ["Heavy", "Two-Handed"], costGp: 10, weightLb: 10 },
  morningstar: { category: "Martial Melee", damageDice: "1d8", damageType: "piercing", properties: [], costGp: 15, weightLb: 4 },
  rapier: { category: "Martial Melee", damageDice: "1d8", damageType: "piercing", properties: ["Finesse"], costGp: 25, weightLb: 2 },
  scimitar: { category: "Martial Melee", damageDice: "1d6", damageType: "slashing", properties: ["Finesse", "Light"], costGp: 25, weightLb: 3 },
  shortsword: { category: "Martial Melee", damageDice: "1d6", damageType: "piercing", properties: ["Finesse", "Light", "Monk"], costGp: 10, weightLb: 2 },
  warhammer: { category: "Martial Melee", damageDice: "1d8", damageType: "bludgeoning", properties: ["Versatile"], costGp: 15, weightLb: 2 },
  whip: { category: "Martial Melee", damageDice: "1d4", damageType: "slashing", properties: ["Finesse", "Reach"], costGp: 2, weightLb: 3 },
  // Martial Ranged
  "hand crossbow": { category: "Martial Ranged", damageDice: "1d6", damageType: "piercing", properties: ["Ammunition", "Light", "Loading"], costGp: 75, weightLb: 3 },
  "heavy crossbow": { category: "Martial Ranged", damageDice: "1d10", damageType: "piercing", properties: ["Ammunition", "Heavy", "Loading", "Two-Handed"], costGp: 50, weightLb: 18 },
  longbow: { category: "Martial Ranged", damageDice: "1d8", damageType: "piercing", properties: ["Ammunition", "Heavy", "Two-Handed"], costGp: 50, weightLb: 2 }
};

const ARMOR = {
  padded: { category: "Light", baseAc: 11, dexBonus: "full", strengthMin: 0, stealthDisadvantage: true, costGp: 5, weightLb: 8 },
  leather: { category: "Light", baseAc: 11, dexBonus: "full", strengthMin: 0, stealthDisadvantage: false, costGp: 10, weightLb: 10 },
  "studded leather": { category: "Light", baseAc: 12, dexBonus: "full", strengthMin: 0, stealthDisadvantage: false, costGp: 45, weightLb: 13 },
  hide: { category: "Medium", baseAc: 12, dexBonus: "max2", strengthMin: 0, stealthDisadvantage: false, costGp: 10, weightLb: 12 },
  "chain shirt": { category: "Medium", baseAc: 13, dexBonus: "max2", strengthMin: 0, stealthDisadvantage: false, costGp: 50, weightLb: 20 },
  "scale mail": { category: "Medium", baseAc: 14, dexBonus: "max2", strengthMin: 0, stealthDisadvantage: true, costGp: 50, weightLb: 45 },
  breastplate: { category: "Medium", baseAc: 14, dexBonus: "max2", strengthMin: 0, stealthDisadvantage: false, costGp: 400, weightLb: 20 },
  "half plate": { category: "Medium", baseAc: 15, dexBonus: "max2", strengthMin: 0, stealthDisadvantage: true, costGp: 750, weightLb: 40 },
  "ring mail": { category: "Heavy", baseAc: 14, dexBonus: "none", strengthMin: 0, stealthDisadvantage: true, costGp: 30, weightLb: 40 },
  "chain mail": { category: "Heavy", baseAc: 16, dexBonus: "none", strengthMin: 13, stealthDisadvantage: true, costGp: 75, weightLb: 55 },
  splint: { category: "Heavy", baseAc: 17, dexBonus: "none", strengthMin: 15, stealthDisadvantage: true, costGp: 200, weightLb: 60 },
  plate: { category: "Heavy", baseAc: 18, dexBonus: "none", strengthMin: 15, stealthDisadvantage: true, costGp: 1500, weightLb: 65 },
  shield: { category: "Shield", baseAc: 2, dexBonus: "none", strengthMin: 0, stealthDisadvantage: false, costGp: 10, weightLb: 6 }
};

// DMG's rarity value-range table -- the correct value RANGE per rarity,
// used to sanity-check (not dictate) a Homebrew item's proposed price.
// "typicallyAttunement" reflects the DMG's general guidance (most Rare+
// items require attunement; Common/Uncommon items usually don't) -- a
// per-item judgment call the model still makes, this is just the
// baseline expectation to nudge it toward.
const RARITY_VALUE_RANGES = {
  Common: { minGp: 50, maxGp: 100, typicallyAttunement: false },
  Uncommon: { minGp: 101, maxGp: 500, typicallyAttunement: false },
  Rare: { minGp: 501, maxGp: 5000, typicallyAttunement: true },
  "Very Rare": { minGp: 5001, maxGp: 50000, typicallyAttunement: true },
  Legendary: { minGp: 50001, maxGp: null, typicallyAttunement: true },
  Artifact: { minGp: null, maxGp: null, typicallyAttunement: true }
};

function lookupWeapon(name) {
  return WEAPONS[String(name || "").toLowerCase()] || null;
}
function lookupArmor(name) {
  return ARMOR[String(name || "").toLowerCase()] || null;
}

// Loose sanity check on a Homebrew magic item's proposed price against
// its stated rarity -- same "warn, don't block" spirit as Echoes'
// attributeBudgetWarning (lib/statFormulas.js), since actual DM/designer
// judgment can legitimately deviate.
function rarityValueWarning(rarity, proposedValueGp) {
  const range = RARITY_VALUE_RANGES[rarity];
  if (!range || proposedValueGp == null) return null;
  if (range.minGp != null && proposedValueGp < range.minGp) {
    return `${proposedValueGp}gp is below the typical ${rarity} range (${range.minGp}-${range.maxGp || "∞"}gp) -- may be intentional, but worth a glance.`;
  }
  if (range.maxGp != null && proposedValueGp > range.maxGp) {
    return `${proposedValueGp}gp is above the typical ${rarity} range (${range.minGp}-${range.maxGp}gp) -- may be intentional, but worth a glance.`;
  }
  return null;
}

module.exports = { WEAPONS, ARMOR, RARITY_VALUE_RANGES, lookupWeapon, lookupArmor, rarityValueWarning };
