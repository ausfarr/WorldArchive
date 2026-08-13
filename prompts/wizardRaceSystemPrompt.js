// prompts/wizardRaceSystemPrompt.js
//
// R4 Phase 3: generates ONE new race/species entry at a time (the "+ Add
// Race (AI)" / per-race "Regenerate" actions on the Stats & Skills wizard
// step), matching lib/rulesets/5e/starterRaces.js's shape exactly. 5e
// ability-score-increase totals are a real, fixed-budget mechanical
// concept (SRD races land at +2/+1 or +1x6 total, never more) -- the
// model is told this budget explicitly rather than trusted to invent
// wildly unbalanced numbers, same "model writes narrative, code doesn't
// need to re-derive a fixed rule" split used elsewhere, just enforced via
// prompt instruction here since there's no single downstream formula to
// clamp against (unlike CR or spell slots).

const { buildCacheableSystemPrompt } = require("../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "key": "lowercase-hyphenated-slug",
  "name": "Race/Species Name",
  "abilityScoreIncrease": { "str": 0, "dex": 0, "con": 0, "int": 0, "wis": 0, "cha": 0 },
  "choiceNote": "e.g. 'players may reassign the +1s freely' -- or null if the bonuses above are fixed",
  "size": "Small | Medium",
  "speed": 25,
  "traits": [
    { "name": "Trait Name", "description": "1-2 sentences, mechanical or narrative" }
  ],
  "flavor": "1-2 sentences of world-flavor for this people's culture/origin"
}`;

const STATIC_INSTRUCTIONS = `You are designing an original playable race/species for a 5th Edition (D&D-compatible) tabletop game world archive. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- "abilityScoreIncrease" total bonus points must equal 3 (matching real SRD races' fixed budget), distributed as EITHER one +2 and one +1 to two different abilities, OR +1 to three different abilities -- never more than +2 to any single ability, never a total above 3.
- "size" must be exactly "Small" or "Medium".
- "speed" should be 25 (a Small race with a shorter stride) or 30 (the common default) unless there's a strong narrative reason otherwise.
- "traits" should include 1-3 distinct mechanical or narrative traits that make this race feel different to play, grounded in this world's setting -- not a copy of Human/Elf/Dwarf/etc.'s traits.
- "key" must be a lowercase, hyphenated slug derived from "name" (e.g. "Stone Kin" -> "stone-kin").

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildWizardRaceSystemPrompt({ settingContext, loreContext, existingRacesText, name }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

EXISTING RACES IN THIS WORLD (avoid repeating a concept, name, or mechanical niche already used):
${existingRacesText || "None yet -- any concept is available."}

USER INPUT:
Name: ${name || "generate one fitting the setting"}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildWizardRaceSystemPrompt };
