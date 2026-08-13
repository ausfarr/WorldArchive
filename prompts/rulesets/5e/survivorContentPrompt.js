// prompts/rulesets/5e/survivorContentPrompt.js
//
// 5e Player Character generation -- HOMEBREW TIER ONLY. A Player
// Character is "a Class instance with a name/background" (project scope
// doc) -- the model picks ability scores and writes narrative
// (personality/backstory/equipment), but the class it's built on is
// GROUNDED IN A REAL CLASS ENTRY from this world's own archive (passed
// in below), and every mechanical number (HP, proficiency bonus, spell
// slots) is computed afterward by
// lib/rulesets/5e/survivorFormulas.js/classFormulas.js from that class's
// real hitDie/casterType -- never invented by the model.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");
const { SKILLS, ABILITY_SCORE_IMPROVEMENT_LEVELS } = require("../../../lib/rulesets/5e/classFormulas");
const { CORE_BACKGROUNDS, CORE_FEATS } = require("../../../lib/rulesets/5e/backgroundsAndFeats");

const SKILL_KEYS_TEXT = SKILLS.map((s) => s.key).join(", ");
const BACKGROUND_KEYS_TEXT = CORE_BACKGROUNDS.map((b) => `${b.key} (${b.name})`).join(", ");
const FEAT_KEYS_TEXT = CORE_FEATS.map((f) => `${f.key} (${f.name})`).join(", ");
const FIRST_ASI_LEVEL = Math.min(...ABILITY_SCORE_IMPROVEMENT_LEVELS);

const SCHEMA_DESCRIPTION = `{
  "name": "Full Character Name",
  "classes": [
    { "classId": "the EXACT id of one class from the AVAILABLE CLASSES list below", "classLevel": 5 }
    /* almost always exactly ONE entry -- only use a second entry for a genuinely multiclassed character (a deliberate narrative/mechanical choice, not the default), and never more than two */
  ],
  "abilities": { "str": 10, "dex": 14, "con": 12, "int": 8, "wis": 10, "cha": 8 },
  "skillProficiencies": ["stealth", "perception"],
  "backgroundKey": "the EXACT key of one background from the list below",
  "featKey": "the EXACT key of one feat from the list below, or null to take the flat Ability Score Improvement instead -- only meaningful once total character level (summed across all classes) is 4 or higher",
  "armorClass": 14,
  "armorNote": "e.g. studded leather -- or null",
  "equipment": "a short list of carried gear",
  "background": "1-2 sentences: their life before becoming an adventurer -- narrative flavor, separate from the mechanical Background pick above",
  "ideals": "one sentence",
  "bonds": "one sentence",
  "flaws": "one sentence",
  "backstory": "2-4 sentences, grounded in this world's lore/factions",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

const STATIC_INSTRUCTIONS = `You are creating an original Player Character for a tabletop game world archive, built on one of this world's own generated Classes. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- Each "classId" in "classes" MUST be the exact id of one of the classes listed in AVAILABLE CLASSES below -- do not invent a class or use a name not on that list.
- "classes" should almost always have exactly ONE entry. Only give a character a second entry when multiclassing is a genuinely deliberate part of the concept (e.g. "a knight who dabbled in wizardry") -- most Player Characters, including high-level ones, stay single-class. Never use more than two entries, and never repeat the same classId twice.
- "abilities" should be six scores that make sense for the chosen class(es)' likely primary/secondary abilities, using a standard array feel (roughly 8-15 range, not maxed out) -- these are the character's actual raw scores, not modifiers.
- "armorClass" should be a plausible number for the character's total level and likely equipment (10-20 range depending on level/armor/class) -- your best estimate; this does not need to be perfectly derived, a GM can adjust it.
- "skillProficiencies" must be 2-4 keys chosen from EXACTLY this list (lowercase, exact spelling): ${SKILL_KEYS_TEXT} -- pick ones that fit the chosen class(es) and concept (e.g. a stealthy Rogue-type gets "stealth"/"sleight_of_hand", not "religion").
- "backgroundKey" MUST be the exact key of one of these: ${BACKGROUND_KEYS_TEXT} -- pick whichever fits the character's life before adventuring; the "background" narrative field below should be consistent with it but doesn't need to restate it.
- "featKey" only matters once the character's TOTAL level (summed across every entry in "classes") is ${FIRST_ASI_LEVEL} or higher (below that, no Ability Score Improvement has been reached yet, so it should be null). At total level ${FIRST_ASI_LEVEL}+, choose EITHER null (the character took the flat ability score bump, the more common real-play default) OR the exact key of one of these feats if it fits the concept well: ${FEAT_KEYS_TEXT}.
- Do NOT compute or state hit points, proficiency bonus, spell slots, saving throw proficiencies, passive Perception, or initiative -- those are filled in automatically from the chosen class(es)' real data and this character's ability scores after you respond.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildHomebrewSurvivorSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, availableClassesText, name, faction, classLevel, campaignContext }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

AVAILABLE CLASSES (choose "classId" from EXACTLY one of these):
${availableClassesText}

EXISTING PLAYER CHARACTER ROSTER (avoid repeating a concept, class combo, or name already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the setting"}
Faction: ${faction || "choose one that fills a gap in the existing roster, or null if faction-agnostic"}
Target total level: ${classLevel || "choose one that fills a gap in the existing roster (level 1-5 is a reasonable default if genuinely unspecified)"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildHomebrewSurvivorSystemPrompt };
