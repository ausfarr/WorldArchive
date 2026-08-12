// lib/rulesets/pf2e/npcCombatDefaults.js
//
// Phase 7 pattern, PF2e version: every NPC in a pf2e-ruleset world gets
// a lightweight default combat profile at creation so an un-stat'd NPC
// is never a hard dead-end if players attack them.
//
// Unlike 5e's DEFAULT_NPC_COMBAT_PROFILE (lib/rulesets/5e/npcCombatDefaults.js),
// which could be cross-checked against the real SRD Commoner's exact
// published numbers, PF2e has no verified ORC-licensed statblock to
// check a "generic weak civilian" profile against -- the same content
// gap as PF2e Bestiary Import/Reflavor. Instead, this default is
// computed directly from this project's own VERIFIED Building Creatures
// budget math (lib/rulesets/pf2e/statFormulas.js's buildCreatureBudget),
// at level 0 with every category set to "low" -- the same real,
// tested formula the Bestiary Homebrew tier uses for every other
// creature, just applied at its weakest setting rather than hand-
// invented numbers. This is honestly a computed default, not a claimed
// reproduction of any official "Commoner"-equivalent statblock.
const { buildCreatureBudget } = require("./statFormulas");

const LOW_EVERYTHING = { str: "low", dex: "low", con: "low", int: "low", wis: "low", cha: "low", ac: "low", hp: "low", perception: "low", fort: "low", ref: "low", will: "low", strikeBonus: "low", strikeDamage: "low" };
const budget = buildCreatureBudget(0, LOW_EVERYTHING);

const DEFAULT_NPC_COMBAT_PROFILE = {
  ruleset: "pf2e", // lib/entryTemplate.js's combatProfileBlock() reads this to pick the right embedded renderer.
  level: budget.level,
  role: null,
  traits: ["Humanoid"],
  perception: budget.perception,
  skills: [],
  abilities: budget.abilities,
  armorClass: budget.armorClass,
  savingThrows: budget.savingThrows,
  hitPoints: budget.hitPoints,
  speed: "25 feet",
  melee: [{ name: "Fist", bonus: budget.strikeBonus, traits: ["agile", "nonlethal"], description: budget.strikeDamage }],
  ranged: [],
  otherActions: [],
  isDefaultProfile: true // distinguishes "never upgraded" from a real Combatant stat block, for UI purposes -- same marker 5e's default uses
};

module.exports = { DEFAULT_NPC_COMBAT_PROFILE };
