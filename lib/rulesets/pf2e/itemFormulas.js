// lib/rulesets/pf2e/itemFormulas.js
//
// Multi-ruleset genericization, PF2e Items (Homebrew tier only -- no
// verified ORC-licensed structured item/weapon dataset exists to import
// from, same gap as PF2e Bestiary/Classes). Everything in this file is
// either a VERIFIED universal PF2e system rule (cross-checked against
// multiple independent, mutually-consistent sources since paizo.com/
// aonprd.com are network-blocked in this environment -- see
// SESSION_LOG.md for the search trail) or is explicitly labeled as this
// project's own approximate guidance where the real numbers couldn't be
// independently confirmed -- per this project's own rule: if unsure,
// label it as an estimate rather than assert a fabricated fact.
//
// VERIFIED real rules:
//   - Bulk: 10 Light items = 1 Bulk (round down fractions of the
//     total). Encumbered at more than 5 + Strength modifier Bulk.
//     Max carry capacity is 10 + Strength modifier Bulk.
//   - Fundamental weapon runes: a Potency rune tier of 1/2/3 grants a
//     +1/+2/+3 item bonus to attack rolls and 1/2/3 property rune slots.
//     A Striking rune tier of 1/2/3 (Striking/Greater Striking/Major
//     Striking) adds 1/2/3 extra weapon damage dice. Confirmed the +1
//     Potency rune is specifically item level 2 -- the exact item
//     levels for every other tier could NOT be independently confirmed
//     here (only the BONUS values were verifiable, not the full
//     level-gating table), so this file does not assert specific item
//     levels for tiers 2/3 as fact -- see POTENCY_TIERS/STRIKING_TIERS'
//     comments.
//   - Fundamental armor runes are documented as mirroring the weapon
//     rune structure exactly (a Potency tier grants +1/+2/+3 AC, a
//     Resilient tier grants +1/+2/+3 to saving throws) -- included here
//     by that confirmed structural symmetry, not independently
//     re-verified number-by-number the way the weapon runes were.
//
// NOT hardcoded (deliberately): a full item-price-by-level table. Only
// two data points could be independently confirmed (roughly 15gp at
// item level 1, roughly 70,000gp+ at item level 20, for permanent
// items) -- PRICE_BRACKETS below is this project's OWN smoothed
// interpolation between those two verified endpoints, explicitly
// presented to users as approximate guidance ("estimated — for GM
// reference"), never as an authoritative reproduction of the real
// treasure-by-level table, the same "estimated" honesty this project
// already applies to 5e's Challenge Rating (see
// world_forge_scope.md's "Important: 5e Challenge Rating is an estimate"
// section -- the same "does the source game treat this as a strict
// formula or a guideline" question applies here, and price-by-level in
// PF2e is explicitly GM guidance, not a hard formula, even in the real
// rules).

const POTENCY_TIERS = {
  1: { attackOrAcBonus: 1, runeSlots: 1 },
  2: { attackOrAcBonus: 2, runeSlots: 2 },
  3: { attackOrAcBonus: 3, runeSlots: 3 }
};

const STRIKING_TIERS = {
  1: { extraDice: 1, label: "Striking" },
  2: { extraDice: 2, label: "Greater Striking" },
  3: { extraDice: 3, label: "Major Striking" }
};

const RESILIENT_TIERS = {
  1: { saveBonus: 1, label: "Resilient" },
  2: { saveBonus: 2, label: "Greater Resilient" },
  3: { saveBonus: 3, label: "Major Resilient" }
};

const BULK_TOKENS = { negligible: 0, light: 0.1, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 };

// This project's own smoothed interpolation between two verified real
// anchor points (level 1 ≈ 15gp, level 20 ≈ 70,000gp for a "primary"
// permanent item) -- see this file's header. NOT an official table.
const PRICE_BRACKETS = [
  { minLevel: 0, maxLevel: 4, minGp: 1, maxGp: 60 },
  { minLevel: 5, maxLevel: 9, minGp: 60, maxGp: 500 },
  { minLevel: 10, maxLevel: 14, minGp: 500, maxGp: 5000 },
  { minLevel: 15, maxLevel: 19, minGp: 5000, maxGp: 40000 },
  { minLevel: 20, maxLevel: 20, minGp: 40000, maxGp: 70000 }
];

// "primary" items (weapons, armor, core combat gear) sit near the top
// of their level's price bracket; "secondary" mid-bracket; "tertiary"
// (niche/utility items) near the bottom -- matches the real game's own
// documented primary/secondary/tertiary item-value guidance (verified),
// even though the exact gp numbers within each bracket are this
// project's own approximation.
const CATEGORY_POSITION = { primary: 0.85, secondary: 0.5, tertiary: 0.2 };

function isValidLevel(level) {
  return Number.isInteger(level) && level >= 0 && level <= 20;
}

function priceGuidance(level, category = "secondary") {
  if (!isValidLevel(level)) throw new Error(`Invalid PF2e item level '${level}' (must be 0-20).`);
  const bracket = PRICE_BRACKETS.find((b) => level >= b.minLevel && level <= b.maxLevel);
  const position = Object.prototype.hasOwnProperty.call(CATEGORY_POSITION, category) ? CATEGORY_POSITION[category] : CATEGORY_POSITION.secondary;
  const gp = Math.round(bracket.minGp + (bracket.maxGp - bracket.minGp) * position);
  return { minGp: bracket.minGp, maxGp: bracket.maxGp, suggestedGp: gp, estimated: true };
}

function potencyTier(tier) {
  if (!Object.prototype.hasOwnProperty.call(POTENCY_TIERS, tier)) throw new Error(`Unknown potency tier '${tier}' (must be 1, 2, or 3).`);
  return POTENCY_TIERS[tier];
}

function strikingTier(tier) {
  if (!Object.prototype.hasOwnProperty.call(STRIKING_TIERS, tier)) throw new Error(`Unknown striking tier '${tier}' (must be 1, 2, or 3).`);
  return STRIKING_TIERS[tier];
}

function resilientTier(tier) {
  if (!Object.prototype.hasOwnProperty.call(RESILIENT_TIERS, tier)) throw new Error(`Unknown resilient tier '${tier}' (must be 1, 2, or 3).`);
  return RESILIENT_TIERS[tier];
}

function bulkValue(token) {
  if (!Object.prototype.hasOwnProperty.call(BULK_TOKENS, token)) throw new Error(`Unknown bulk token '${token}'.`);
  return BULK_TOKENS[token];
}

// Sums a list of { bulk: <token>, quantity } items into a total Bulk
// number, rounding down fractional Bulk at the END per the real rule
// ("10 light items = 1 Bulk, round down fractions") rather than
// per-item, so e.g. 9 Light items correctly comes out to 0 total Bulk
// while 11 comes out to 1, not 0.9/1.1 rounded individually.
function computeTotalBulk(items) {
  const raw = (items || []).reduce((sum, item) => sum + bulkValue(item.bulk) * (item.quantity != null ? item.quantity : 1), 0);
  // Floating-point addition of repeating 0.1 fractions (Light items) can
  // land a hair below the true value (e.g. 9 * 0.1 -> 0.8999999999999999)
  // -- round to 2 decimal places before flooring so that never causes an
  // off-by-one against the real "10 light items = 1 Bulk" rule.
  return Math.floor(Math.round(raw * 100) / 100);
}

function encumberedThreshold(strengthModifier) {
  return 5 + Number(strengthModifier);
}

function maxCarryCapacity(strengthModifier) {
  return 10 + Number(strengthModifier);
}

module.exports = {
  POTENCY_TIERS,
  STRIKING_TIERS,
  RESILIENT_TIERS,
  BULK_TOKENS,
  PRICE_BRACKETS,
  isValidLevel,
  priceGuidance,
  potencyTier,
  strikingTier,
  resilientTier,
  bulkValue,
  computeTotalBulk,
  encumberedThreshold,
  maxCarryCapacity
};
