// prompts/rulesets/5e/classContentPrompt.js
//
// 5e Class generation -- three tiers as of R5 Phase 5 (previously
// Homebrew only; Import/Reflavor were blocked on real SRD class data,
// which scripts/ingestSrd5eFull.js now provides via
// srd_library.category = 'classes'):
//
//   - Import: no prompt at all, no Claude call -- routes/generateClass.js
//     copies a srd_library row straight into entries.raw_json via
//     lib/rulesets/5e/srdClassMapper.js. Nothing in this file handles
//     Import; it's listed here only so this file's exports read as the
//     complete three-tier menu.
//   - Reflavor: the model rewrites the class's flavor and its features'
//     names/descriptions, but the mechanical shape (hit die, primary
//     ability, saving throws, caster type, subclass-unlock level, and
//     how many features exist at which levels) is carried through
//     UNCHANGED from the SRD source.
//   - Homebrew: the model invents a full new class (unchanged from
//     before this phase). "Model writes narrative, code writes math"
//     applied here: the model proposes feature NAMES/DESCRIPTIONS at
//     meaningful milestone levels (not a mechanical line for all 20
//     levels -- real published subclasses don't have a unique feature
//     every single level either) and picks the class's caster type. Code
//     then builds the FULL 1-20 table (proficiency bonus, spell slots,
//     the subclass-unlock level, ASI levels) deterministically from
//     classFormulas.js -- the model never invents the subclass-unlock
//     level or spell slot counts, both of which are real, fixed 5e
//     rules, not creative-design choices.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "name": "Full Class Name",
  "hitDie": "e.g. d8, d10, d12",
  "primaryAbility": "str | dex | con | int | wis | cha",
  "savingThrowProficiencies": ["str", "con"],
  "casterType": "full | half | third | warlock | none",
  "spellcastingAbility": "int | wis | cha, or null if casterType is 'none'",
  "features": [
    { "level": 1, "name": "Feature Name", "description": "rules text" }
  ],
  "subclassName": "this class's archetype-category label, in the style of a real 5e term, e.g. 'Draconic Bloodline', 'Martial Archetype', 'Sacred Oath'",
  "subclasses": [
    {
      "name": "Subclass Option Name",
      "flavor": "1-2 sentences",
      "features": [{ "level": 3, "name": "Feature Name", "description": "rules text" }]
    }
  ],
  "flavor": "2-4 sentences of lore, grounded in this world's tone/factions",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

const STATIC_INSTRUCTIONS = `You are designing an original 5th Edition (D&D-compatible) character class for a tabletop game world archive. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- "features" should cover roughly 6-10 MEANINGFUL milestone levels (1, and others of your choosing that fit the class's power curve) -- do NOT write a unique feature for every level 1-20; real published classes don't either (many levels are proficiency-bonus or spell-slot increases only, which the archive computes automatically and will display alongside your features).
- Do NOT specify a subclass-unlock level or write features for levels 4, 8, 12, 16, or 19 (Ability Score Improvement) -- those are inserted automatically from the real rules, not up to you.
- "subclasses" should include AT LEAST 2 distinct options, each with 2-4 of their own features at levels appropriate for a subclass path (typically starting at the class's actual unlock level and continuing at a few higher levels) -- the exact unlock level will be corrected automatically if it doesn't match this class's real rules-determined level, so approximate is fine.
- "casterType" must be exactly one of: full (like Wizard/Cleric), half (like Paladin/Ranger -- starts casting at level 2), third (like Eldritch Knight -- rare, only for a class explicitly designed as a light dabbler in magic), warlock (Pact Magic -- few slots, always highest level, short-rest recharge -- only use this for a class explicitly modeled on pact-based magic), or none (no spellcasting at all).

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildHomebrewClassSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, campaignContext }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

EXISTING CLASS ROSTER (avoid repeating a concept, name, or mechanical niche already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the setting"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

const REFLAVOR_SCHEMA = `{
  "flavor": "2-4 sentences of NEW lore, grounded in this world's tone/factions",
  "features": [
    { "level": 1, "name": "New Feature Name (may rename, keep the SAME mechanical effect worded in the description)", "description": "..." }
  ],
  "subclassFlavor": "1-2 sentences of NEW lore for the class's single subclass option",
  "designNotes": "1-2 sentences on how this reflavor fits this world"
}`;

const REFLAVOR_STATIC_INSTRUCTIONS = `You are reflavoring an official 5th Edition class's NARRATIVE presentation for a specific tabletop game world, while its mechanics stay exactly as printed. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

HARD RULE: you may rename features and rewrite their flavor text, and rewrite the class's overall flavor -- but every feature's MECHANICAL EFFECT (any numeric value, die roll, or rules effect) must stay IDENTICAL to the source class provided below, and you must return exactly the same number of features at exactly the same levels as the source (do not add, remove, or move any). Do not touch hit die, primary ability, saving throws, caster type, or the subclass-unlock level -- those are not part of your output.

Return JSON matching this exact schema (the "features" array must be the same length, same levels, same order, as the source class's features):
${REFLAVOR_SCHEMA}`;

function buildReflavorClassSystemPrompt({ settingContext, loreContext, factionOptionsText, sourceClass, campaignContext }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

SOURCE CLASS (official 5e class -- reflavor its narrative, do not change its mechanics):
${JSON.stringify(sourceClass, null, 2)}${campaignContext ? `\n\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(REFLAVOR_STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildHomebrewClassSystemPrompt, buildReflavorClassSystemPrompt };
