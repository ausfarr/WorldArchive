// prompts/rulesets/pf2e/enemyContentPrompt.js
//
// PF2e Bestiary generation -- HOMEBREW TIER ONLY. Import and Reflavor
// are not available for PF2e: no verified ORC-licensed monster stat
// block dataset exists to import from (see SESSION_LOG.md's PF2e
// research entry and lib/rulesets/pf2e/statFormulas.js's header comment
// -- the level-budget MATH used here is safely sourced, but that's a
// different thing from licensed monster CONTENT). If a genuinely
// ORC-licensed monster dataset turns up later, Import/Reflavor can be
// added the same way Phase 3 added them for 5e -- this file's shape
// deliberately mirrors prompts/rulesets/5e/enemyContentPrompt.js's
// Homebrew builder for that reason.
//
// Unlike 5e's Homebrew tier (model proposes numbers, code ESTIMATES a
// CR from them), PF2e's own design method lets code assign the numbers
// directly and deterministically once a level + role is chosen (see
// lib/rulesets/pf2e/statFormulas.js's buildCreatureBudget) -- so this
// prompt asks the model for NARRATIVE and for STRIKE/ACTION NAMES/
// DESCRIPTIONS only, not raw numbers. The numbers are already resolved
// by the time this prompt's response comes back and gets merged in
// routes/generateEnemy.js.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "name": "Full Name",
  "traits": ["Trait1", "Trait2"],
  "senses": "e.g. darkvision, low-light vision -- or null",
  "languages": "free text or null",
  "items": "carried gear/loot, free text, or null",
  "immunities": "free text or null",
  "resistances": "free text or null",
  "weaknesses": "free text or null",
  "speed": "e.g. 25 feet, climb 25 feet",
  "melee": [{ "name": "Strike name, e.g. Claw, Jaws, Fist", "traits": ["agile", "finesse"], "damageDescription": "e.g. 1d8 piercing plus 1d6 poison" }],
  "ranged": [],
  "otherActions": [{ "name": "Action Name", "description": "rules text" }],
  "flavor": "2-4 sentences of lore, grounded in this world's tone/factions",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

const STATIC_INSTRUCTIONS = `You are designing an original Pathfinder 2nd Edition (Remaster) creature's NARRATIVE and ability list for a tabletop game world archive's bestiary. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

You are given this creature's TARGET LEVEL and ROLE below, plus the exact numeric budget code has already computed for that level/role (AC, HP, saves, Perception, Strike bonus, Strike damage dice) -- do NOT invent different numbers. Your job is naming and describing Strikes/Actions that make narrative sense for this concept while staying mechanically consistent with the given numbers:
- Every melee/ranged Strike's "damageDescription" should incorporate the EXACT strike damage dice given to you (you may add a flavorful secondary damage type in addition, e.g. "plus 1d6 fire", but do not change the base damage dice).
- "traits" on a Strike are PF2e weapon traits (agile, finesse, reach, sweep, etc.) -- pick ones that fit the creature concept, they don't affect the numbers.
- 1-3 "otherActions" for non-Strike abilities (special attacks, defensive abilities, movement tricks) -- describe their effect in words; if one needs a DC, use the Spellcasting/Class DC number given to you if provided, otherwise avoid stating a specific DC.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildHomebrewPf2eEnemySystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, faction, level, role, budget, campaignContext }) {
  const budgetText = `Level: ${budget.level}
Ability modifiers: Str ${budget.abilities.str >= 0 ? "+" : ""}${budget.abilities.str}, Dex ${budget.abilities.dex >= 0 ? "+" : ""}${budget.abilities.dex}, Con ${budget.abilities.con >= 0 ? "+" : ""}${budget.abilities.con}, Int ${budget.abilities.int >= 0 ? "+" : ""}${budget.abilities.int}, Wis ${budget.abilities.wis >= 0 ? "+" : ""}${budget.abilities.wis}, Cha ${budget.abilities.cha >= 0 ? "+" : ""}${budget.abilities.cha}
AC: ${budget.armorClass}
HP: ${budget.hitPoints}
Saving throws: Fort +${budget.savingThrows.fort}, Ref +${budget.savingThrows.ref}, Will +${budget.savingThrows.will}
Perception: +${budget.perception}
Strike bonus (use for every Strike's to-hit): +${budget.strikeBonus}
Strike damage dice (use as the base damage for your primary Strike): ${budget.strikeDamage}${budget.spellcastingDcAttack ? `\nSpellcasting/Class DC: ${budget.spellcastingDcAttack}` : ""}`;

  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

EXISTING BESTIARY ROSTER (avoid repeating a concept or name already used):
${rosterContext}

THIS CREATURE'S PRE-COMPUTED BUDGET (use these numbers exactly, see instructions above):
${budgetText}

USER INPUT:
Name: ${name || "generate one fitting the faction/setting"}
Faction: ${faction || "choose one that fills a gap in the existing roster, or null if faction-agnostic"}
Role concept: ${role || "generalist -- no strong archetype lean"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildHomebrewPf2eEnemySystemPrompt };
