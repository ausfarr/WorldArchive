// lib/rulesets/5e/npcCombatDefaults.js
//
// Phase 7 (NPCs): every NPC in a 5e-ruleset world gets a lightweight
// default combat profile at creation so an un-stat'd NPC is never a
// hard dead-end if players attack them -- per the project's scope doc.
//
// DEFAULT_NPC_COMBAT_PROFILE matches the real SRD Commoner (the
// simplest, most generic humanoid stat block in the game -- AC 10, HP 4,
// every ability score 10, one weak attack) -- cross-checked against
// 5e-bits/5e-database's monster JSON for the exact numbers (again, a
// numbers-only cross-reference, not a content source; this is coded
// here as a plain generic default, not ingested SRD content, the same
// way the DMG's CR table and PF2e's budget tables are coded defaults
// rather than imported text). Same shape as an enemyTemplate.js entry so
// it can be rendered with the shared buildEmbeddedCombatProfileHtml()
// helper and, if a GM later invokes the "Combatant" upgrade
// (routes/npcCombatant.js), fully replaced by a real generated stat
// block from the exact same pipeline Bestiary uses.
const DEFAULT_NPC_COMBAT_PROFILE = {
  armorClass: 10,
  armorNote: null,
  hitPoints: 4,
  hitDice: "1d8",
  speed: "30 ft.",
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  savingThrows: "",
  skills: "",
  damageVulnerabilities: null,
  damageResistances: null,
  damageImmunities: null,
  conditionImmunities: null,
  senses: "passive Perception 10",
  languages: "any one language (usually Common)",
  challengeRating: { cr: "0", xp: 10, estimated: false },
  traits: [],
  actions: [{ name: "Club", description: "Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 2 (1d4) bludgeoning damage." }],
  legendaryActions: [],
  isDefaultProfile: true // distinguishes "never upgraded" from a real Combatant stat block, for UI purposes
};

module.exports = { DEFAULT_NPC_COMBAT_PROFILE };
