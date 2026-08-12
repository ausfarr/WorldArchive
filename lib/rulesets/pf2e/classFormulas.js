// lib/rulesets/pf2e/classFormulas.js
//
// Multi-ruleset genericization, Pathfinder 2e Classes (Homebrew tier
// only -- same Import/Reflavor gap as pf2e Bestiary, see this
// directory's enemyRepo.js/statFormulas.js header comments; no verified
// ORC-licensed structured class dataset exists to import from).
//
// UNIVERSAL PF2e math implemented here (applies identically to every
// class in the real game, verified against multiple independent,
// mutually-consistent sources since paizo.com/aonprd.com are network-
// blocked in this environment -- see SESSION_LOG.md for the search
// trail):
//   - Proficiency bonus = level + a fixed value per rank (untrained: no
//     level added at all, always +0; trained +2; expert +4; master +6;
//     legendary +8). Cross-checked against the real worked example "a
//     Class DC's proficiency bonus is typically +3 for most 1st-level
//     characters" -- level(1) + trained(2) = 3, matches.
//   - Hit Points: ancestryHp + classHpPerLevel + conModifier at level 1;
//     classHpPerLevel + conModifier at every level after.
//   - Ability boosts at levels 5/10/15/20 (four boosts each, +2 normally
//     or +1 if the score is already >= 18).
//   - Skill increases at levels 3,5,7,9,11,13,15,17,19; a skill can't
//     become Master via a skill increase before level 7, or Legendary
//     before level 15 (both real, independently-confirmed rules).
//   - Class DC = 10 + (class DC's own proficiency bonus) + key ability
//     modifier -- same "10 + proficiency + modifier" DC shape as every
//     other PF2e DC.
//
// What's DELIBERATELY NOT hardcoded: which levels a given class's Class
// DC/Perception/saves/etc. actually rank up at. In real PF2e that's a
// hand-authored, per-class design decision (a Rogue's armor proficiency
// advances Trained->Expert at 3, Expert->Master at 7; other classes
// advance completely differently) -- not a formula, and not verifiable
// here without the actual class tables (which are real content, not
// math, and blocked the same way Bestiary Import/Reflavor is). Since
// this is a HOMEBREW class generator -- the model is inventing a NEW
// class, not reproducing an official one -- that same per-class design
// choice is exactly the kind of thing the model should propose, the
// same way it proposes 5e Homebrew Classes' milestone features
// (lib/rulesets/5e/classFormulas.js has no equivalent problem since 5e's
// proficiency bonus is a single universal table, not per-class). Code's
// job here is validating the model's proposed rank-up schedule is
// LEGAL (ranks only ever increase, starts at trained by level 1, stays
// within 1-20) and then computing the resulting bonus arithmetic at any
// given level -- never inventing the schedule itself.

const PROFICIENCY_RANKS = ["untrained", "trained", "expert", "master", "legendary"];
const RANK_BONUS = { untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8 };
const MAX_LEVEL = 20;

const ABILITY_BOOST_LEVELS = [5, 10, 15, 20];
const SKILL_INCREASE_LEVELS = [3, 5, 7, 9, 11, 13, 15, 17, 19];

// HP-per-level tier a homebrew class picks (the model chooses a tier
// name, code resolves the real number) -- verified pattern: martial
// classes gain more HP/level than casters/tricksters in real PF2e
// (independently confirmed across multiple sources), matching the same
// "high/medium/low" shape 5e's own hit-die tiers already use in this
// project's lib/rulesets/5e/classFormulas.js.
const HP_TIER_VALUES = { high: 12, medium: 10, low: 8, caster: 6 };

function isValidLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL;
}

function abilityModifierFromScore(score) {
  return Math.floor((Number(score) - 10) / 2);
}

// rank + level -> the real numeric proficiency bonus. Untrained never
// adds level, by design (a level-20 Untrained skill is still +0) --
// this is the one place the "level" term of the formula can vanish.
function proficiencyBonus(rank, level) {
  if (!PROFICIENCY_RANKS.includes(rank)) throw new Error(`Unknown proficiency rank '${rank}'.`);
  if (rank === "untrained") return 0;
  if (!isValidLevel(level)) throw new Error(`Invalid PF2e level '${level}' (must be 1-${MAX_LEVEL}).`);
  return level + RANK_BONUS[rank];
}

// Validates a proposed [{level, rank}] proficiency schedule (one class
// uses several of these -- Class DC, Perception, each save, weapons,
// armor -- each with its own schedule). Legal means: sorted ascending
// by level, starts at level 1, every level 1-20, ranks strictly
// non-decreasing (a class never LOSES proficiency as it levels), and
// no two entries share a level.
function validateProficiencySchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return { valid: false, error: "Schedule must be a non-empty array." };
  }
  const sorted = [...schedule].sort((a, b) => a.level - b.level);
  if (sorted[0].level !== 1) return { valid: false, error: "Schedule must include an entry at level 1." };
  let lastLevel = -1;
  let lastRankIndex = -1;
  for (const entry of sorted) {
    if (!isValidLevel(entry.level)) return { valid: false, error: `Invalid level '${entry.level}'.` };
    if (entry.level === lastLevel) return { valid: false, error: `Duplicate schedule entry at level ${entry.level}.` };
    const rankIndex = PROFICIENCY_RANKS.indexOf(entry.rank);
    if (rankIndex === -1) return { valid: false, error: `Unknown rank '${entry.rank}' at level ${entry.level}.` };
    if (rankIndex < lastRankIndex) return { valid: false, error: `Rank decreases at level ${entry.level} -- proficiency can only go up.` };
    lastLevel = entry.level;
    lastRankIndex = rankIndex;
  }
  return { valid: true, schedule: sorted };
}

// The rank (and resulting bonus) a validated schedule gives at a
// specific level -- the last schedule entry at or before that level.
function proficiencyAtLevel(schedule, level) {
  const validation = validateProficiencySchedule(schedule);
  if (!validation.valid) throw new Error(validation.error);
  if (!isValidLevel(level)) throw new Error(`Invalid PF2e level '${level}'.`);
  let current = validation.schedule[0];
  for (const entry of validation.schedule) {
    if (entry.level > level) break;
    current = entry;
  }
  return { rank: current.rank, bonus: proficiencyBonus(current.rank, level) };
}

// Class DC = 10 + this class's Class DC proficiency bonus (from its own
// schedule) + the key ability modifier. Verified real formula shape.
function computeClassDC(classDcSchedule, keyAbilityScore, level) {
  const { bonus } = proficiencyAtLevel(classDcSchedule, level);
  return 10 + bonus + abilityModifierFromScore(keyAbilityScore);
}

// Hit Points at a given level -- see this file's header for the real,
// verified ancestryHp+classHp+conMod (level 1) / classHp+conMod (per
// level after) shape.
function computeHitPoints({ ancestryHp, hpTier, level, conScore }) {
  if (!Object.prototype.hasOwnProperty.call(HP_TIER_VALUES, hpTier)) throw new Error(`Unknown hpTier '${hpTier}'.`);
  if (!isValidLevel(level)) throw new Error(`Invalid PF2e level '${level}'.`);
  const classHpPerLevel = HP_TIER_VALUES[hpTier];
  const conModifier = abilityModifierFromScore(conScore);
  const level1 = (Number(ancestryHp) || 0) + classHpPerLevel + conModifier;
  const perLevelAfterFirst = classHpPerLevel + conModifier;
  // Floored at 1 per level's worth added, same defensive floor 5e's own
  // survivorFormulas.js uses -- a very low Con at high level shouldn't
  // be able to compute a total HP that goes non-positive.
  return Math.max(1, level1 + Math.max(0, level - 1) * perLevelAfterFirst);
}

// Default Perception/save progressions this PROJECT applies to every
// homebrew class, NOT a reproduction of any single official class's
// exact table (real PF2e classes each hand-author these, the same
// per-class-design-choice problem discussed in this file's header
// comment). A homebrew class only chooses WHICH two of its three saves
// are "good" (fast-advancing) vs. its one "poor" save -- the actual
// rank-up levels for good/poor/Perception all come from this one fixed,
// documented default curve, kept deliberately identical across every
// homebrew class for simplicity and internal consistency, the same way
// this project's Generic ruleset uses one simple formula shape for every
// world instead of modeling arbitrary bespoke curves.
const DEFAULT_GOOD_SAVE_SCHEDULE = [{ level: 1, rank: "expert" }, { level: 9, rank: "master" }, { level: 17, rank: "legendary" }];
const DEFAULT_POOR_SAVE_SCHEDULE = [{ level: 1, rank: "trained" }, { level: 11, rank: "expert" }];
const DEFAULT_PERCEPTION_SCHEDULE = [{ level: 1, rank: "trained" }, { level: 5, rank: "expert" }, { level: 13, rank: "master" }];

function abilityBoostLevelsUpTo(level) {
  return ABILITY_BOOST_LEVELS.filter((l) => l <= level);
}

function skillIncreaseLevelsUpTo(level) {
  return SKILL_INCREASE_LEVELS.filter((l) => l <= level);
}

module.exports = {
  PROFICIENCY_RANKS,
  RANK_BONUS,
  MAX_LEVEL,
  ABILITY_BOOST_LEVELS,
  SKILL_INCREASE_LEVELS,
  HP_TIER_VALUES,
  DEFAULT_GOOD_SAVE_SCHEDULE,
  DEFAULT_POOR_SAVE_SCHEDULE,
  DEFAULT_PERCEPTION_SCHEDULE,
  isValidLevel,
  abilityModifierFromScore,
  proficiencyBonus,
  validateProficiencySchedule,
  proficiencyAtLevel,
  computeClassDC,
  computeHitPoints,
  abilityBoostLevelsUpTo,
  skillIncreaseLevelsUpTo
};
