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
const { SKILLS } = require("../../../lib/rulesets/5e/classFormulas");

const SKILL_KEYS_TEXT = SKILLS.map((s) => s.key).join(", ");

const SCHEMA_DESCRIPTION = `{
  "name": "Full Character Name",
  "classId": "the EXACT id of one class from the AVAILABLE CLASSES list below",
  "classLevel": 3,
  "abilities": { "str": 10, "dex": 14, "con": 12, "int": 8, "wis": 10, "cha": 8 },
  "skillProficiencies": ["stealth", "perception"],
  "armorClass": 14,
  "armorNote": "e.g. studded leather -- or null",
  "equipment": "a short list of carried gear",
  "background": "1-2 sentences: their life before becoming an adventurer",
  "ideals": "one sentence",
  "bonds": "one sentence",
  "flaws": "one sentence",
  "backstory": "2-4 sentences, grounded in this world's lore/factions",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

const STATIC_INSTRUCTIONS = `You are creating an original Player Character for a tabletop game world archive, built on one of this world's own generated Classes. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- "classId" MUST be the exact id of one of the classes listed in AVAILABLE CLASSES below -- do not invent a class or use a name not on that list.
- "abilities" should be six scores that make sense for the chosen class's likely primary/secondary abilities, using a standard array feel (roughly 8-15 range, not maxed out) -- these are the character's actual raw scores, not modifiers.
- "armorClass" should be a plausible number for the character's level and likely equipment (10-20 range depending on level/armor/class) -- your best estimate; this does not need to be perfectly derived, a GM can adjust it.
- "skillProficiencies" must be 2-4 keys chosen from EXACTLY this list (lowercase, exact spelling): ${SKILL_KEYS_TEXT} -- pick ones that fit the chosen class and concept (e.g. a stealthy Rogue-type gets "stealth"/"sleight_of_hand", not "religion").
- Do NOT compute or state hit points, proficiency bonus, spell slots, saving throw proficiencies, passive Perception, or initiative -- those are filled in automatically from the chosen class's real data and this character's ability scores after you respond.

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
Target level: ${classLevel || "choose one that fills a gap in the existing roster (level 1-5 is a reasonable default if genuinely unspecified)"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildHomebrewSurvivorSystemPrompt };
