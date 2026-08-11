// lib/rulesets/5e/spellFormulas.js
//
// The one genuinely formulaic piece of 5e spell design: cantrip damage
// scaling by character level. Verified against the real, consistent
// wording every official cantrip uses ("This spell's damage increases
// by 1d... when you reach 5th level (2d...), 11th level (3d...), and
// 17th level (4d...)") -- levels 1-4 use the base die count, 5-10 add
// one die, 11-16 add two, 17-20 add three.
//
// Deliberately does NOT attempt a "spell power budget" formula the way
// lib/rulesets/5e/statFormulas.js has one for monster CR -- unlike
// Challenge Rating, 5e spell design has no official per-level damage/
// effect budget table in the source material. Inventing one here would
// be fabricating a rule that doesn't exist, not implementing a verified
// one. What IS validated: spell level bounds (0-9) and the cantrip
// scaling table above. Everything else about whether a Homebrew spell
// is "balanced" for its stated level is left to GM judgment, same as it
// is for a real homebrewing DM -- the schema just keeps the model
// honest about SHOWING its scaling math consistently, not about
// GENERATING a formulaically "correct" answer that doesn't exist to
// generate.

const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function isValidSpellLevel(level) {
  return SPELL_LEVELS.includes(Number(level));
}

// characterLevel: 1-20. baseDiceCount/dieSize describe the cantrip's
// damage at character levels 1-4 (e.g. Fire Bolt is 1d10 -> baseDiceCount
// 1, dieSize 10). Returns the correctly-scaled dice count for the given
// character level -- this is deterministic, not a guess.
function cantripDiceCountForLevel(characterLevel, baseDiceCount = 1) {
  const lvl = Math.max(1, Math.min(20, Number(characterLevel) || 1));
  let steps = 0;
  if (lvl >= 17) steps = 3;
  else if (lvl >= 11) steps = 2;
  else if (lvl >= 5) steps = 1;
  return baseDiceCount + steps;
}

// Produces the standard four-tier display table a real cantrip stat
// block shows ("1st-4th: 1d10, 5th-10th: 2d10, ..."), from just the
// base die count/size -- used so the model only has to supply the base
// damage once (level 1-4) and code derives the rest, rather than trusting
// the model to compute three more tiers correctly by hand.
function cantripScalingTable(baseDiceCount, dieSize) {
  return [
    { levels: "1st–4th", dice: `${cantripDiceCountForLevel(1, baseDiceCount)}d${dieSize}` },
    { levels: "5th–10th", dice: `${cantripDiceCountForLevel(5, baseDiceCount)}d${dieSize}` },
    { levels: "11th–16th", dice: `${cantripDiceCountForLevel(11, baseDiceCount)}d${dieSize}` },
    { levels: "17th–20th", dice: `${cantripDiceCountForLevel(17, baseDiceCount)}d${dieSize}` }
  ];
}

const SPELL_SCHOOLS = [
  "Abjuration", "Conjuration", "Divination", "Enchantment",
  "Evocation", "Illusion", "Necromancy", "Transmutation"
];

module.exports = { SPELL_LEVELS, isValidSpellLevel, cantripDiceCountForLevel, cantripScalingTable, SPELL_SCHOOLS };
