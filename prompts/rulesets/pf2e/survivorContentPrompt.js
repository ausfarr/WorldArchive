// prompts/rulesets/pf2e/survivorContentPrompt.js
//
// PF2e Player Character generation -- HOMEBREW TIER ONLY. A Player
// Character is "a Class instance with a name/background" (project scope
// doc) -- the model picks ability scores and writes narrative, but the
// class it's built on is GROUNDED IN A REAL CLASS ENTRY from this
// world's own archive, and every mechanical number (HP, Class DC,
// Perception, saves) is computed afterward by
// lib/rulesets/pf2e/survivorFormulas.js from that class's real
// hpTier/classDcSchedule/goodSaves -- never invented by the model.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "name": "Full Character Name",
  "classId": "the EXACT id of one class from the AVAILABLE CLASSES list below",
  "classLevel": 3,
  "abilities": { "str": 10, "dex": 14, "con": 12, "int": 8, "wis": 10, "cha": 8 },
  "armorClass": 16,
  "armorNote": "e.g. studded leather -- or null",
  "equipment": "a short list of carried gear",
  "background": "1-2 sentences: their life before becoming an adventurer",
  "backstory": "2-4 sentences, grounded in this world's lore/factions",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

const STATIC_INSTRUCTIONS = `You are creating an original Player Character for a tabletop game world archive, built on one of this world's own generated PF2e Classes. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- "classId" MUST be the exact id of one of the classes listed in AVAILABLE CLASSES below -- do not invent a class or use a name not on that list.
- "abilities" should be six scores that make sense for the chosen class's key ability, using a standard PF2e-style spread (roughly 8-18 range after boosts) -- these are the character's actual raw scores, not modifiers.
- "armorClass" should be a plausible number for the character's level and likely equipment -- your best estimate; this does not need to be perfectly derived, a GM can adjust it.
- Do NOT compute or state Hit Points, Class DC, Perception, or saving throw bonuses -- those are filled in automatically from the chosen class's real data after you respond.

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
