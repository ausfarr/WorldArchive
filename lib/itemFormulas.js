const BASE = 10;

const WEAPON_ROLL_RANGES = {
  "Heavy Weapons": [16, 20],
  "Light Weapons": [6, 9],
  "Polearm": [11, 14],
  "Unarmed": [4, 7],
  "Ballistics": [14, 18],
  "Archery": [8, 12],
  "Catalysts": [9, 13]
};

// Weapon damage is now fully item-intrinsic: no assumed wielder stat or
// skill level. MIN is a standard hit at this weapon's own rolled value;
// MAX is that same roll on a critical hit. This is what a weapon sitting
// in a loot table should show — the same range whether a fresh recruit
// or a veteran ends up carrying it. Which class/level actually wields it
// is exactly the thing this deliberately does NOT try to guess at.
//
// relevantStat is no longer folded into this math (see
// lib/itemTemplate.js's separate "Scales With" row) -- it's flavor
// grounding for which attribute this weapon synergizes with narratively,
// not a numeric multiplier. Previously this whole function used two
// hardcoded constants (a fixed "reference" stat value of 15 and skill
// level of 20) for every single item regardless of its own power level,
// which is the bug this replaces.
const CRIT_MULTIPLIER = 1.5;

function computeWeaponDamage(weaponRoll) {
  const min = weaponRoll;
  const max = Number((weaponRoll * CRIT_MULTIPLIER).toFixed(1));
  return {
    min,
    max,
    formulaText: `MIN = WEAPON_ROLL (standard hit). MAX = WEAPON_ROLL × ${CRIT_MULTIPLIER} (critical hit) — WEAPON_ROLL ${weaponRoll}. Real damage in actual play also scales further with the wielder's relevant attribute and skill investment.`
  };
}

function computeArmorDR(effectorTier) {
  const dr = (effectorTier * 5) + (BASE / 2);
  return {
    value: Number(dr.toFixed(1)),
    formulaText: `(Effector Tier × 5) + (BASE/2) = (${effectorTier} × 5) + (${BASE}/2) — provisional, not canonical`
  };
}

function weaponRollInRange(weaponSkill, requestedRoll) {
  const range = WEAPON_ROLL_RANGES[weaponSkill];
  if (!range) return requestedRoll;
  const [min, max] = range;
  if (requestedRoll < min || requestedRoll > max) {
    return Math.min(Math.max(requestedRoll, min), max); // clamp into valid range
  }
  return requestedRoll;
}

module.exports = { computeWeaponDamage, computeArmorDR, weaponRollInRange, WEAPON_ROLL_RANGES, BASE, CRIT_MULTIPLIER };
