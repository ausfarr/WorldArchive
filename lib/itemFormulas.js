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

function computeArmorDR(effectorTier) {
  const dr = (effectorTier * 5) + (BASE / 2);
  return {
    value: Number(dr.toFixed(1)),
    formulaText: `(Effector Tier × 5) + (BASE/2) = (${effectorTier} × 5) + (${BASE}/2) — provisional, not canonical`
  };
}

// Damage is now two numbers the model generates directly (see
// prompts/itemContentPrompt.js), not derived from a formula -- this just
// keeps them sane: damageMin clamped into the weapon skill's canonical
// range, damageMax guaranteed to actually be higher than min (bumped up
// if the model returned an equal/lower value), and capped from growing
// absurdly large relative to the category's own ceiling.
function clampDamageRange(weaponSkill, requestedMin, requestedMax) {
  const range = WEAPON_ROLL_RANGES[weaponSkill];
  if (!range) return { min: requestedMin, max: requestedMax };
  const [rangeMin, rangeMax] = range;

  const min = Math.min(Math.max(requestedMin, rangeMin), rangeMax);
  const maxCeiling = rangeMax * 2; // generous headroom for rarity-driven spread
  let max = Math.min(Math.max(requestedMax, min + 1), maxCeiling);
  if (max <= min) max = min + 1;

  return { min, max };
}

module.exports = { computeArmorDR, clampDamageRange, WEAPON_ROLL_RANGES, BASE };
