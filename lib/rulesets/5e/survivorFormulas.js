// lib/rulesets/5e/survivorFormulas.js
//
// Phase 8 (Player Characters -- rework of Survivors): a 5e Player
// Character is fundamentally "a Class instance with a name/background,"
// per the project's scope doc -- this file computes the character-level
// derived numbers (hit points, proficiency bonus, spell slots) FROM an
// existing Class entry's data rather than maintaining a separate
// mechanical model, reusing lib/rulesets/5e/classFormulas.js's Phase 5
// tables directly instead of re-deriving them.
//
// HIT POINTS: the PHB's official fixed/no-rolling method -- max hit die
// at 1st level, then a fixed per-level average for every level after
// (d6->4, d8->5, d10->6, d12->7 -- verified via search cross-reference),
// plus the Constitution modifier at every level. Deterministic and
// testable, unlike an actual dice roll.

const { proficiencyBonusForLevel, spellSlotsForLevel } = require("./classFormulas");

const HIT_DIE_AVERAGE = { 6: 4, 8: 5, 10: 6, 12: 7 };

function parseHitDieSize(hitDie) {
  const m = String(hitDie || "").match(/d(\d+)/i);
  return m ? Number(m[1]) : 8; // d8 is a reasonable generic fallback, matches the most common class hit die
}

function abilityModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

// hitDie: e.g. "d10" (from the linked Class entry). level: 1-20.
function computeHitPoints(hitDie, level, conScore) {
  const dieSize = parseHitDieSize(hitDie);
  const conMod = abilityModifier(conScore);
  const lvl = Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
  const perLevelAverage = HIT_DIE_AVERAGE[dieSize] || Math.ceil(dieSize / 2) + 1; // formula fallback for a non-standard die size
  let hp = dieSize + conMod; // level 1: max die + CON mod
  for (let l = 2; l <= lvl; l++) {
    hp += perLevelAverage + conMod;
  }
  return Math.max(1, hp); // a character can never have 0 or negative max HP
}

// R4 Phase 2: PASSIVE PERCEPTION is the PHB's "10 + all applicable
// modifiers" rule applied specifically to Perception (Wisdom-governed) --
// code-computed rather than model-stated so it can never drift from the
// character's actual Wisdom score/proficiency status.
function passivePerception(wisScore, proficiencyBonus, isPerceptionProficient) {
  return 10 + abilityModifier(wisScore) + (isPerceptionProficient ? Number(proficiencyBonus) || 0 : 0);
}

// INITIATIVE is Dexterity modifier plus any flat bonus from feats (e.g.
// Alert) -- featBonus defaults to 0 since Feats aren't wired in until
// Phase 5, but the parameter exists now so that phase only has to pass a
// real number through, not touch this formula again.
function initiativeBonus(dexScore, featBonus) {
  return abilityModifier(dexScore) + (Number(featBonus) || 0);
}

// Thin re-export so callers of this file don't also need to import
// classFormulas.js directly for the two other numbers a PC sheet needs.
module.exports = {
  abilityModifier,
  computeHitPoints,
  parseHitDieSize,
  passivePerception,
  initiativeBonus,
  proficiencyBonusForLevel,
  spellSlotsForLevel
};
