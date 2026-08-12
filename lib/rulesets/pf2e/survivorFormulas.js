// lib/rulesets/pf2e/survivorFormulas.js
//
// Phase 8 pattern, PF2e version: a Player Character is "a Class instance
// with a name/background" -- this file computes character-level derived
// numbers (HP, Class DC, Perception, saves) FROM an existing pf2e Class
// entry's own data (its hpTier/classDcSchedule/goodSaves from Phase 9's
// Classes work), reusing lib/rulesets/pf2e/classFormulas.js's real
// tables directly rather than re-deriving them -- same "reuse it, don't
// fork it" this project used for 5e's survivorFormulas.js.
const {
  computeHitPoints,
  computeClassDC,
  proficiencyAtLevel,
  abilityModifierFromScore,
  DEFAULT_GOOD_SAVE_SCHEDULE,
  DEFAULT_POOR_SAVE_SCHEDULE,
  DEFAULT_PERCEPTION_SCHEDULE
} = require("./classFormulas");

const ALL_SAVES = ["fortitude", "reflex", "will"];

// Resolves a PC's full mechanical profile at their current level from
// their chosen class's own data (hpTier/classDcSchedule/goodSaves) plus
// their own ability scores -- the one place PC-specific numbers
// (Con score for HP, key ability score for Class DC) combine with the
// class-level math built in Phase 9.
function computePcProfile({ classContent, level, abilities }) {
  const conScore = (abilities && abilities.con) || 10;
  const keyAbilityScore = (abilities && abilities[classContent.keyAbility]) || 10;

  const hitPoints = computeHitPoints({ ancestryHp: 8, hpTier: classContent.hpTier, level, conScore });
  const classDC = computeClassDC(classContent.classDcSchedule, keyAbilityScore, level);
  const perception = proficiencyAtLevel(DEFAULT_PERCEPTION_SCHEDULE, level);
  const goodSaves = classContent.goodSaves || [];
  const savingThrows = {};
  for (const save of ALL_SAVES) {
    const schedule = goodSaves.includes(save) ? DEFAULT_GOOD_SAVE_SCHEDULE : DEFAULT_POOR_SAVE_SCHEDULE;
    savingThrows[save] = proficiencyAtLevel(schedule, level).bonus;
  }

  return { hitPoints, classDC, perception: perception.bonus, savingThrows };
}

module.exports = {
  computePcProfile,
  abilityModifierFromScore
};
