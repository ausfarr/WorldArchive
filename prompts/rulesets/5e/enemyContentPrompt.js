// prompts/rulesets/5e/enemyContentPrompt.js
//
// Three generation tiers for the 5e Bestiary (Phase 3 proof of concept
// for the whole multi-ruleset pattern -- see
// session_addendum_ruleset_genericization.md):
//
//   - Import: no prompt at all, no Claude call -- routes/generateEnemy.js
//     copies an srd_library row straight into entries.raw_json verbatim.
//     Nothing in this file handles Import; it's listed here only so this
//     file's exports read as the complete three-tier menu.
//   - Reflavor: the model rewrites name/flavor/traits/action FLAVOR TEXT
//     only. Every number that feeds CR math (armorClass, hitPoints,
//     abilities, action to-hit/damage) is carried through UNCHANGED from
//     the SRD source -- the model is told this explicitly and never
//     shown a path to edit those fields, same "model writes narrative,
//     code writes math" split this whole project follows.
//   - Homebrew: the model invents a full new monster (narrative +
//     ability list + proposed combat numbers). Those proposed numbers
//     are a STARTING POINT the model estimates for flavor consistency
//     with the requested CR -- routes/generateEnemy.js runs them through
//     lib/rulesets/5e/statFormulas.js's computeChallengeRating()
//     afterward and stores the CODE's computed CR as authoritative
//     (challengeRating.estimated: true), same as Echoes' own
//     attributeBudgetWarning pattern of "model proposes, code verifies."
//
// PROMPT CACHING: same static/dynamic split as prompts/enemyContentPrompt.js
// -- see that file's header comment for the full reasoning.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

const HOMEBREW_SCHEMA = `{
  "id": "kebab-case-slug",
  "name": "Full Name",
  "size": "Tiny | Small | Medium | Large | Huge | Gargantuan",
  "type": "e.g. beast, humanoid, fiend, undead",
  "alignment": "e.g. chaotic evil, unaligned",
  "armorClass": 13,
  "armorNote": "e.g. natural armor, leather armor -- or null",
  "hitPoints": 22,
  "hitDice": "e.g. 4d8+4",
  "speed": "e.g. 30 ft., fly 60 ft.",
  "abilities": { "str": 10, "dex": 14, "con": 12, "int": 8, "wis": 10, "cha": 8 },
  "savingThrows": [{ "ability": "dex", "bonus": 4 }],
  "skills": [{ "name": "Stealth", "bonus": 6 }],
  "damageVulnerabilities": "free text or null",
  "damageResistances": "free text or null",
  "damageImmunities": "free text or null",
  "conditionImmunities": "free text or null",
  "senses": "e.g. darkvision 60 ft., passive Perception 12",
  "languages": "free text or '—'",
  "targetChallengeRating": "the CR you're designing toward, e.g. '1/2' -- code will compute the REAL estimated CR from the numbers above; this is your design target, not what gets stored",
  "traits": [{ "name": "Trait Name", "description": "rules text" }],
  "actions": [{ "name": "Action Name", "description": "rules text including to-hit and damage dice, e.g. 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) slashing damage.'", "toHit": 4, "damageDice": "1d6+2" }],
  "legendaryActions": [],
  "flavor": "1-3 sentences of lore, grounded in this world's tone/factions",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

const HOMEBREW_STATIC_INSTRUCTIONS = `You are designing an original 5th Edition (D&D-compatible) monster stat block for a tabletop game world archive's bestiary. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

You are given 1-2 REAL official 5e monsters of the same target CR below as STRUCTURAL REFERENCE ONLY -- match their general power level and stat-block shape, but do NOT copy their name, flavor, or exact numbers. Invent something new and consistent with this world's own lore/factions.

MECHANICAL ACCURACY MATTERS: "actions" entries with an attack need BOTH "toHit" (a number) and "damageDice" (valid dice notation like "2d6+3") filled in accurately -- these numbers get run through a real Challenge Rating calculator after you respond, so keep them internally consistent with the ability scores you chose (a Dexterity 16 rogue-type creature should have a plausible dex-based to-hit, not an arbitrary number).

Return JSON matching this exact schema:
${HOMEBREW_SCHEMA}`;

function buildHomebrewEnemySystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, faction, targetCr, referenceMonsters, campaignContext }) {
  const referenceText = (referenceMonsters || [])
    .map((m) => `- ${m.name} (CR ${m.cr}): ${JSON.stringify(m.data_json)}`)
    .join("\n") || "(no same-CR reference monster available -- use your own knowledge of 5e monster design norms)";

  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

EXISTING BESTIARY ROSTER (avoid repeating a concept, name, or exact ability already used):
${rosterContext}

STRUCTURAL REFERENCE MONSTERS (same target CR, real official stat blocks -- reference only, do not copy):
${referenceText}

USER INPUT:
Name: ${name || "generate one fitting the faction/setting"}
Faction: ${faction || "choose one that fills a gap in the existing roster, or null if faction-agnostic"}
Target Challenge Rating: ${targetCr || "choose one that fills a gap in the existing roster (CR 1/2 to 3 is a reasonable default if genuinely unspecified)"}${campaignContext ? `\nCampaign context (this monster is needed for a specific encounter -- ground the concept in this): ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(HOMEBREW_STATIC_INSTRUCTIONS, dynamicContext);
}

const REFLAVOR_SCHEMA = `{
  "name": "New Full Name",
  "flavor": "1-3 sentences of NEW lore/flavor, grounded in this world's tone/factions",
  "traits": [{ "name": "New Trait Name (may rename, keep the SAME mechanical effect worded in the description)", "description": "..." }],
  "actions": [{ "name": "New Action Name (may rename, keep the SAME to-hit/damage numbers)", "description": "..." }],
  "designNotes": "1-2 sentences on how this reflavor fits this world"
}`;

const REFLAVOR_STATIC_INSTRUCTIONS = `You are reflavoring an official 5th Edition monster's NARRATIVE presentation for a specific tabletop game world, while its mechanics stay exactly as printed. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

HARD RULE: you may rename the monster, rewrite its flavor text, and rename/reword its traits and actions -- but every trait/action's MECHANICAL EFFECT (to-hit bonus, damage dice, saving throw DC, any numeric value) must stay IDENTICAL to the source stat block provided below. If a trait's description contains a number or die roll, that number must appear unchanged in your rewritten description. Do not add, remove, or resize abilities.

Return JSON matching this exact schema (traits/actions arrays must be the same length, same order, as the source):
${REFLAVOR_SCHEMA}`;

function buildReflavorEnemySystemPrompt({ settingContext, loreContext, factionOptionsText, sourceMonster, faction, campaignContext }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

SOURCE MONSTER (official 5e stat block -- reflavor its narrative, do not change its mechanics):
${JSON.stringify(sourceMonster, null, 2)}

USER INPUT:
Faction (if this monster should read as belonging to one): ${faction || "faction-agnostic is fine"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(REFLAVOR_STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildHomebrewEnemySystemPrompt, buildReflavorEnemySystemPrompt };
