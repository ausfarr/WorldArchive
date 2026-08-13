// lib/rulesets/5e/srdClassMapper.js
//
// R5 Phase 5: converts a srd_library row's raw ingested data_json (see
// scripts/ingestSrd5eFull.js's parseClasses) into the shape
// lib/rulesets/5e/classTemplate.js already expects. Same role as
// lib/rulesets/5e/srdMonsterMapper.js plays for Bestiary Import/Reflavor.
//
// Saving throw proficiencies and the subclass-unlock level are pulled
// from classFormulas.js's own hand-verified tables (SAVING_THROW_
// PROFICIENCIES / SUBCLASS_UNLOCK_LEVEL) rather than re-parsed from the
// ingested text -- since an imported class's name IS one of the 12 core
// class names exactly, matchCoreClassName() always matches, so this reuses
// the same ground-truth data routes/generateClass.js's Homebrew tier
// already resolves real facts from instead of parsing "Strength and
// Constitution" back into ability keys a second way.
//
// casterType / spellcastingAbility have no equivalent table in
// classFormulas.js (nothing else in this codebase needed them as a
// standalone per-class fact before this), so they're a small hand-typed
// lookup here, same "well-established rules fact" treatment as every
// other table in this ruleset -- which of the 12 core classes cast spells,
// and using which ability, is not in dispute.

const {
  matchCoreClassName,
  savingThrowProficienciesForClass,
  subclassUnlockLevel
} = require("./classFormulas");

const CASTER_TYPE_BY_CORE_CLASS = {
  bard: "full", cleric: "full", druid: "full", sorcerer: "full", wizard: "full",
  paladin: "half", ranger: "half",
  warlock: "warlock",
  barbarian: "none", fighter: "none", monk: "none", rogue: "none"
};

const SPELLCASTING_ABILITY_BY_CORE_CLASS = {
  bard: "cha", sorcerer: "cha", warlock: "cha", paladin: "cha",
  cleric: "wis", druid: "wis", ranger: "wis",
  wizard: "int"
};

function mapSrdClassMechanics(dataJson) {
  const coreKey = matchCoreClassName(dataJson.name);
  const casterType = (coreKey && CASTER_TYPE_BY_CORE_CLASS[coreKey]) || "none";
  const spellcastingAbility = casterType !== "none" ? (SPELLCASTING_ABILITY_BY_CORE_CLASS[coreKey] || null) : null;

  const subclass = dataJson.subclass
    ? { name: dataJson.subclass.name, flavor: null, features: dataJson.subclass.features || [] }
    : null;

  return {
    hitDie: dataJson.hitDie ? `d${dataJson.hitDie}` : null,
    primaryAbility: dataJson.primaryAbility || null,
    savingThrowProficiencies: savingThrowProficienciesForClass(coreKey, null),
    casterType,
    spellcastingAbility,
    features: dataJson.features || [],
    subclassName: subclass ? subclass.name : null,
    subclassUnlockLevel: subclassUnlockLevel(coreKey || ""),
    subclasses: subclass ? [subclass] : []
  };
}

module.exports = { mapSrdClassMechanics };
