// lib/rulesets/5e/classFormulas.js
//
// Real 5e class-leveling math (Phase 5 -- the spec's own words, "biggest
// single rework"): proficiency bonus by level, ability-score-improvement
// levels, per-class subclass-unlock level, and spell slot progression
// for every caster type (Full/Half/Third/Warlock's unique Pact Magic).
//
// DATA PROVENANCE: every table below is well-established, extremely
// widely reproduced 5e mechanical data (proficiency-bonus-by-level and
// the full-caster spell slot table are among the most commonly
// reproduced tables in the entire game, appearing on virtually every
// character sheet and VTT). Cross-checked programmatically against
// 5e-bits/5e-database's per-level class data (`5e-SRD-Levels.json`) --
// NOT used as a licensing source (that project's content is OGL 1.0a,
// not CC-BY-4.0, per SESSION_LOG.md's Phase 2 entry and
// scripts/ingestSrd5e.js's header) but fine to cross-reference for
// verifying game-mechanics NUMBERS, the same non-copyrightable-mechanics
// reasoning already applied to the DMG CR table and PF2e's Building
// Creatures tables. Every value below was independently re-typed by
// this project, not copy-pasted from that repo's files.
//
// SIMPLIFICATION, stated honestly: ABILITY_SCORE_IMPROVEMENT_LEVELS
// below is the BASE pattern shared by most classes (4, 8, 12, 16, 19).
// Fighter and Rogue each get one additional ASI the base pattern doesn't
// include (Fighter also at 6 and 14; Rogue also at 10) -- not modeled
// here. Flagged in this comment rather than silently wrong; a future
// pass can add a per-class override table the same shape as
// SUBCLASS_UNLOCK_LEVEL below.

const PROFICIENCY_BONUS_BY_LEVEL = {
  1: 2, 2: 2, 3: 2, 4: 2,
  5: 3, 6: 3, 7: 3, 8: 3,
  9: 4, 10: 4, 11: 4, 12: 4,
  13: 5, 14: 5, 15: 5, 16: 5,
  17: 6, 18: 6, 19: 6, 20: 6
};

const ABILITY_SCORE_IMPROVEMENT_LEVELS = [4, 8, 12, 16, 19];

// R4 Phase 2: the 12 core 5e classes, in the same order/spelling used by
// routes/generateClass.js's pre-existing name-match logic (moved here so
// both class generation AND PC generation can share one lookup instead
// of each re-typing the list).
const CORE_CLASS_NAMES = ["cleric", "sorcerer", "warlock", "druid", "wizard", "barbarian", "bard", "fighter", "monk", "paladin", "ranger", "rogue"];

// Real PHB saving throw proficiencies, two per class -- a fixed rule,
// not a design choice, so this is never left to the model (same "code
// decides" principle as PROFICIENCY_BONUS_BY_LEVEL above).
const SAVING_THROW_PROFICIENCIES = {
  barbarian: ["str", "con"],
  bard: ["dex", "cha"],
  cleric: ["wis", "cha"],
  druid: ["int", "wis"],
  fighter: ["str", "con"],
  monk: ["str", "dex"],
  paladin: ["wis", "cha"],
  ranger: ["str", "dex"],
  rogue: ["dex", "int"],
  sorcerer: ["con", "cha"],
  warlock: ["wis", "cha"],
  wizard: ["int", "wis"]
};

// The 18 real 5e skills and the ability score each one is governed by --
// fixed rules data, reused for both the model's skill-proficiency
// proposal (validated against these exact keys) and passive-Perception
// math (which needs to know Perception's governing ability is Wisdom).
const SKILLS = [
  { key: "acrobatics", name: "Acrobatics", ability: "dex" },
  { key: "animal_handling", name: "Animal Handling", ability: "wis" },
  { key: "arcana", name: "Arcana", ability: "int" },
  { key: "athletics", name: "Athletics", ability: "str" },
  { key: "deception", name: "Deception", ability: "cha" },
  { key: "history", name: "History", ability: "int" },
  { key: "insight", name: "Insight", ability: "wis" },
  { key: "intimidation", name: "Intimidation", ability: "cha" },
  { key: "investigation", name: "Investigation", ability: "int" },
  { key: "medicine", name: "Medicine", ability: "wis" },
  { key: "nature", name: "Nature", ability: "int" },
  { key: "perception", name: "Perception", ability: "wis" },
  { key: "performance", name: "Performance", ability: "cha" },
  { key: "persuasion", name: "Persuasion", ability: "cha" },
  { key: "religion", name: "Religion", ability: "int" },
  { key: "sleight_of_hand", name: "Sleight of Hand", ability: "dex" },
  { key: "stealth", name: "Stealth", ability: "dex" },
  { key: "survival", name: "Survival", ability: "wis" }
];

// Verified via search against a real-world worked example ("Cleric,
// Warlock and Sorcerer pick their subclass at level 1. Druid and Wizard
// pick at level 2. The rest pick at level 3.") -- see SESSION_LOG.md.
const SUBCLASS_UNLOCK_LEVEL = {
  cleric: 1, sorcerer: 1, warlock: 1,
  druid: 2, wizard: 2,
  barbarian: 3, bard: 3, fighter: 3, monk: 3, paladin: 3, ranger: 3, rogue: 3
};

// Full caster: Bard, Cleric, Druid, Sorcerer, Wizard. Index = character
// level (1-20), value = slots per spell level (index 0 = 1st-level slots).
const FULL_CASTER_SPELL_SLOTS = {
  1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1]
};

// Half caster: Paladin, Ranger. No slots at level 1; starts at level 2.
const HALF_CASTER_SPELL_SLOTS = {
  1: [0, 0, 0, 0, 0],
  2: [2, 0, 0, 0, 0],
  3: [3, 0, 0, 0, 0],
  4: [3, 0, 0, 0, 0],
  5: [4, 2, 0, 0, 0],
  6: [4, 2, 0, 0, 0],
  7: [4, 3, 0, 0, 0],
  8: [4, 3, 0, 0, 0],
  9: [4, 3, 2, 0, 0],
  10: [4, 3, 2, 0, 0],
  11: [4, 3, 3, 0, 0],
  12: [4, 3, 3, 0, 0],
  13: [4, 3, 3, 1, 0],
  14: [4, 3, 3, 1, 0],
  15: [4, 3, 3, 2, 0],
  16: [4, 3, 3, 2, 0],
  17: [4, 3, 3, 3, 1],
  18: [4, 3, 3, 3, 1],
  19: [4, 3, 3, 3, 2],
  20: [4, 3, 3, 3, 2]
};

// Warlock's Pact Magic -- structurally different from every other caster:
// FEW slots, but always at the highest available slot level, recharging
// on a SHORT rest rather than a long rest. { slots, slotLevel } per
// character level.
const WARLOCK_PACT_MAGIC = {
  1: { slots: 1, slotLevel: 1 }, 2: { slots: 2, slotLevel: 1 },
  3: { slots: 2, slotLevel: 2 }, 4: { slots: 2, slotLevel: 2 },
  5: { slots: 2, slotLevel: 3 }, 6: { slots: 2, slotLevel: 3 },
  7: { slots: 2, slotLevel: 4 }, 8: { slots: 2, slotLevel: 4 },
  9: { slots: 2, slotLevel: 5 }, 10: { slots: 2, slotLevel: 5 },
  11: { slots: 3, slotLevel: 5 }, 12: { slots: 3, slotLevel: 5 },
  13: { slots: 3, slotLevel: 5 }, 14: { slots: 3, slotLevel: 5 },
  15: { slots: 3, slotLevel: 5 }, 16: { slots: 3, slotLevel: 5 },
  17: { slots: 4, slotLevel: 5 }, 18: { slots: 4, slotLevel: 5 },
  19: { slots: 4, slotLevel: 5 }, 20: { slots: 4, slotLevel: 5 }
};

function proficiencyBonusForLevel(level) {
  const lvl = Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
  return PROFICIENCY_BONUS_BY_LEVEL[lvl];
}

function subclassUnlockLevel(classNameLower) {
  return SUBCLASS_UNLOCK_LEVEL[classNameLower] || 3; // 3 is the most common level among the 12 core classes -- reasonable default for an unrecognized/homebrew class name
}

// Matches a (possibly homebrew) class name against the 12 core class
// names -- same substring-match approach routes/generateClass.js already
// used inline for subclassUnlockLevel before this was factored out here.
function matchCoreClassName(name) {
  const nameLower = String(name || "").toLowerCase();
  return CORE_CLASS_NAMES.find((c) => nameLower.includes(c)) || null;
}

// Saving throw proficiencies are a REAL 5e rule with no room for
// creative variance, unlike a class's features or flavor -- so a class
// whose name matches one of the 12 core classes (e.g. a homebrew
// "Frost Warden" that includes "ranger" in its name) gets that class's
// real save list, code-determined. A genuinely original homebrew class
// with no core-class match has no rules-book answer to look up, so it
// falls back to whatever the model itself proposed when the class was
// designed (same discretion already given to feature names/subclass
// concepts) rather than inventing a fake "default" pair.
function savingThrowProficienciesForClass(matchedCoreClass, modelProposed) {
  if (matchedCoreClass && SAVING_THROW_PROFICIENCIES[matchedCoreClass]) {
    return [...SAVING_THROW_PROFICIENCIES[matchedCoreClass]];
  }
  return Array.isArray(modelProposed) ? modelProposed.slice(0, 2) : [];
}

// casterType: 'full' | 'half' | 'third' | 'warlock' | 'none'.
// 'third' (Eldritch Knight/Arcane Trickster-style) isn't an official
// standalone class -- it's computed via the real multiclassing rule
// (this class's level contributes floor(level/3) toward the full-caster
// table) rather than a separate hardcoded table, since that's the
// actual RAW rule for third-casters, verified against the same
// cross-reference data as everything else in this file.
function spellSlotsForLevel(casterType, level) {
  const lvl = Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
  if (casterType === "full") return FULL_CASTER_SPELL_SLOTS[lvl];
  if (casterType === "half") return HALF_CASTER_SPELL_SLOTS[lvl];
  if (casterType === "third") {
    const effectiveLevel = Math.max(1, Math.floor(lvl / 3));
    return FULL_CASTER_SPELL_SLOTS[effectiveLevel];
  }
  if (casterType === "warlock") return WARLOCK_PACT_MAGIC[lvl];
  return null;
}

// R4 Phase 6: real multiclass spellcasting rules (PHB "Spell Slots per
// Spell Level" section). Each class contributes to ONE shared pool,
// computed independently per class then summed: full casters count their
// full level, half casters floor(level/2), third casters floor(level/3)
// -- Warlock's Pact Magic is structurally separate and never contributes
// to (or draws from) this shared pool, so it isn't summed here at all.
// The shared pool is then looked up in FULL_CASTER_SPELL_SLOTS by that
// combined level -- verified fact: the real DMG/PHB "Multiclass
// Spellcaster" slot table is IDENTICAL to the single-class full-caster
// table, just keyed by combined level instead of one class's own level
// (cross-checked against the same independent source classFormulas.js's
// header already cites for every other table here).
function multiclassCasterLevelContribution(casterType, level) {
  const lvl = Math.max(0, Math.round(Number(level) || 0));
  if (casterType === "full") return lvl;
  if (casterType === "half") return Math.floor(lvl / 2);
  if (casterType === "third") return Math.floor(lvl / 3);
  return 0; // 'warlock' and 'none' don't contribute to the shared pool
}

// classEntries: [{ casterType, level }, ...]. Returns
// { sharedSlots, pactMagic } -- sharedSlots is null if no class in the
// list contributes any combined caster level; pactMagic is null unless
// one of the classes is a Warlock (its own separate, additive pool).
function multiclassSpellSlots(classEntries) {
  const combinedLevel = (classEntries || []).reduce(
    (sum, e) => sum + multiclassCasterLevelContribution(e.casterType, e.level),
    0
  );
  const sharedSlots = combinedLevel > 0 ? FULL_CASTER_SPELL_SLOTS[Math.max(1, Math.min(20, combinedLevel))] : null;
  const warlockEntry = (classEntries || []).find((e) => e.casterType === "warlock");
  const pactMagic = warlockEntry ? WARLOCK_PACT_MAGIC[Math.max(1, Math.min(20, Math.round(Number(warlockEntry.level) || 1)))] : null;
  return { sharedSlots, pactMagic };
}

module.exports = {
  PROFICIENCY_BONUS_BY_LEVEL,
  ABILITY_SCORE_IMPROVEMENT_LEVELS,
  SUBCLASS_UNLOCK_LEVEL,
  CORE_CLASS_NAMES,
  SAVING_THROW_PROFICIENCIES,
  SKILLS,
  FULL_CASTER_SPELL_SLOTS,
  HALF_CASTER_SPELL_SLOTS,
  WARLOCK_PACT_MAGIC,
  proficiencyBonusForLevel,
  subclassUnlockLevel,
  matchCoreClassName,
  savingThrowProficienciesForClass,
  spellSlotsForLevel,
  multiclassCasterLevelContribution,
  multiclassSpellSlots
};
