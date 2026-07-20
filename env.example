const BASE = 10;

const TIER_BUDGET = { Trash: 30, Elite: 55, Boss: 100 };

function effectiveSkill(tier) {
  const budget = TIER_BUDGET[tier] || TIER_BUDGET.Elite;
  return Math.round(budget * 0.6);
}

// Formulas from references/attributes_and_formulas.md. ATHLETICS/WEAPON
// SKILL/BIOLOGY are all approximated by the same flat "effective skill"
// value per tier, per the reference doc's guidance for non-leveling enemies.
function computeDerivedStats(attributes, tier) {
  const { body, reflex, knowledge, presence, sanity, fate } = attributes;
  const skill = effectiveSkill(tier);

  const maxHealth = Math.round((body * 2) + (sanity * 2) + BASE);
  const maxEnergy = Math.round((knowledge * 2) + (fate * 2) + BASE);
  const dodgeChance = Number((BASE + (reflex / 4) + (skill / 4)).toFixed(1));
  const critChance = Number((BASE + (fate / 3) + (skill / 5)).toFixed(1));
  const accuracy = Number((BASE + (reflex / 2) + (skill / 2)).toFixed(1));
  const moveSpeed = Number((BASE + (reflex / 5) + (skill / 10)).toFixed(1));

  return {
    maxHealth,
    maxEnergy,
    dodgeChance,
    critChance,
    accuracy,
    moveSpeed,
    base: BASE,
    effectiveSkill: skill
  };
}

// Loose sanity check, not a hard validator — the reference doc explicitly
// says to nudge off the baseline split for flavor, so this only warns.
function attributeBudgetWarning(attributes, tier) {
  const sum = Object.values(attributes).reduce((a, b) => a + b, 0);
  const budget = TIER_BUDGET[tier] || TIER_BUDGET.Elite;
  const pctOff = Math.abs(sum - budget) / budget;
  if (pctOff > 0.35) {
    return `Attribute sum (${sum}) is ${Math.round(pctOff * 100)}% off the ${tier} budget (~${budget}) — may be intentional flavor, but worth a glance.`;
  }
  return null;
}

module.exports = { computeDerivedStats, attributeBudgetWarning, TIER_BUDGET, BASE, effectiveSkill };
