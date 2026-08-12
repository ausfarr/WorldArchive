// lib/rulesets/pf2e/spellFormulas.js
//
// Multi-ruleset genericization, PF2e Spells (Homebrew tier only -- same
// gap as every other PF2e category, no verified ORC-licensed spell
// dataset to import/reflavor from).
//
// VERIFIED real rules (cross-checked against multiple independent,
// mutually-consistent sources since paizo.com/aonprd.com are network-
// blocked here -- see SESSION_LOG.md):
//   - A spell's rank (1-10, PF2e's replacement term for "spell level")
//     you can cast tops out at ceil(characterLevel / 2), capped at 10.
//     Verified worked examples: rank 1 at level 1, rank 10 at level 19
//     (and it stays 10 at level 20 -- there is no 11th rank).
//   - Cantrips heighten automatically to that same rank -- "a cantrip
//     is always automatically heightened to half your level, rounded
//     up... its rank is equal to the highest rank of spell slot you
//     have" (direct quote from an independent explainer, matching the
//     same ceil(level/2) formula above).
//   - Heightening comes in two real, independently-confirmed formats:
//     "Heightened (+1)" -- a fixed per-rank increment applies
//     cumulatively for every rank above the spell's base/lowest rank
//     (verified real worked example: Fireball is 6d6 at rank 3 with
//     "Heightened (+1): damage increases by 2d6" -> 8d6 at rank 4, 10d6
//     at rank 5); and "Heightened (Nth)" -- a specific-rank override
//     with its own stated effect, which this project does NOT attempt
//     to compute automatically (it's a bespoke per-spell design choice,
//     not a formula -- the model states each override rank's effect as
//     flavor/rules text directly, same as any other spell effect text).

const MAX_SPELL_RANK = 10;

function isValidLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= 20;
}

function isValidRank(rank) {
  return Number.isInteger(rank) && rank >= 1 && rank <= MAX_SPELL_RANK;
}

// The highest spell rank a full caster (or an auto-heightening cantrip)
// can access at a given character level -- verified ceil(level/2),
// capped at 10.
function maxSpellRankForLevel(level) {
  if (!isValidLevel(level)) throw new Error(`Invalid PF2e character level '${level}' (must be 1-20).`);
  return Math.min(MAX_SPELL_RANK, Math.ceil(level / 2));
}

// Cantrips use the exact same formula as a full caster's top spell
// slot rank -- kept as its own named function since it's a distinct
// real rule (verified independently, not just an alias by assumption),
// even though the underlying arithmetic is identical.
function cantripRankForLevel(level) {
  return maxSpellRankForLevel(level);
}

// "Heightened (+N)" cumulative scaling -- verified real formula shape
// (Fireball worked example above). baseDiceCount is the die count at
// the spell's own baseRank (its lowest normally-cast rank); returns the
// die count at castRank, which must be >= baseRank.
function computeHeightenedDiceCount(baseDiceCount, baseRank, diceIncrementPerRank, castRank) {
  if (!isValidRank(baseRank) || !isValidRank(castRank)) throw new Error("baseRank and castRank must be 1-10.");
  if (castRank < baseRank) throw new Error(`castRank (${castRank}) cannot be lower than the spell's baseRank (${baseRank}).`);
  const ranksAbove = castRank - baseRank;
  return (Number(baseDiceCount) || 0) + ranksAbove * (Number(diceIncrementPerRank) || 0);
}

module.exports = {
  MAX_SPELL_RANK,
  isValidLevel,
  isValidRank,
  maxSpellRankForLevel,
  cantripRankForLevel,
  computeHeightenedDiceCount
};
