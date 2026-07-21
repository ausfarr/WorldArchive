const BASE = 10;
const REFERENCE_STAT_VALUE = 15; // fixed convention, per the real scrap-shiv sample
const REFERENCE_SKILL_LEVEL = 20; // fixed convention, per rarity_and_effects.md

const WEAPON_ROLL_RANGES = {
  "Heavy Weapons": [16, 20],
  "Light Weapons": [6, 9],
  "Polearm": [11, 14],
  "Unarmed": [4, 7],
  "Ballistics": [14, 18],
  "Archery": [8, 12],
  "Catalysts": [9, 13]
};

function computeWeaponDamage(weaponRoll, relevantStatName) {
  const damage = (weaponRoll * (1 + (REFERENCE_STAT_VALUE / 25))) + (REFERENCE_SKILL_LEVEL / 2);
  return {
    value: Number(damage.toFixed(1)),
    formulaText: `(WEAPON_ROLL × (1 + (RELEVANT_STAT/25))) + (SKILL_LEVEL/2) = (${weaponRoll} × (1 + (${REFERENCE_STAT_VALUE}/25))) + (${REFERENCE_SKILL_LEVEL}/2) — WEAPON_ROLL ${weaponRoll}, RELEVANT_STAT ${relevantStatName} ${REFERENCE_STAT_VALUE}, SKILL_LEVEL ${REFERENCE_SKILL_LEVEL}`
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

module.exports = { computeWeaponDamage, computeArmorDR, weaponRollInRange, WEAPON_ROLL_RANGES, BASE, REFERENCE_STAT_VALUE, REFERENCE_SKILL_LEVEL };
