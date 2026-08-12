// prompts/rulesets/pf2e/spellContentPrompt.js
//
// PF2e Spell generation -- HOMEBREW TIER ONLY, same reasoning as every
// other PF2e category (no verified ORC-licensed spell dataset to
// import/reflavor from).
//
// "Model writes narrative, code writes math": for a "Heightened (+N)"
// spell, the model supplies ONLY the base dice count at the spell's
// lowest castable rank plus the per-rank increment -- code
// deterministically derives the full rank-by-rank damage table (see
// lib/rulesets/pf2e/spellFormulas.js's computeHeightenedDiceCount(),
// verified against the real cited Fireball example). The model never
// states a specific rank's total damage itself for a "+N" spell.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "name": "Full Name",
  "rank": 1,
  "isCantrip": false,
  "traits": ["evocation", "fire"],
  "actions": "e.g. Two Actions, Reaction, Free Action",
  "range": "e.g. 30 feet, touch, self",
  "targetsOrArea": "e.g. 1 creature, a 20-foot burst",
  "duration": "e.g. instantaneous, sustained up to 1 minute",
  "savingThrow": "e.g. basic Reflex, Will, or null if the spell doesn't call for one",
  "description": "the spell's full rules text, 2-5 sentences",
  "heightening": {
    "type": "plus | specific | none",
    "baseDiceCount": 6,
    "diceIncrementPerRank": 2,
    "damageType": "fire",
    "specificEntries": [{ "rank": 5, "effect": "text describing what changes at this specific rank" }]
  },
  "flavor": "1-2 sentences of world-flavor for this spell's origin/style",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

const STATIC_INSTRUCTIONS = `You are designing an original Pathfinder 2nd Edition (PF2e-compatible) spell for a tabletop game world archive's spellbook. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- "rank" must be an integer 1-10 -- this is the spell's LOWEST normally-cast rank (PF2e's term for spell level). Cantrips still set "rank": 1 and "isCantrip": true; they heighten automatically as a caster levels up, so you don't need to describe their scaling separately.
- "heightening.type": use "plus" ONLY if the spell deals damage that scales by a flat amount every rank above its base rank -- fill in "baseDiceCount" (the die count AT the base rank you chose) and "diceIncrementPerRank"; code computes every higher rank's actual total from those two numbers, so do not state a specific rank's total damage yourself. Use "specific" if the spell instead gains qualitatively different effects at particular ranks (fill in "specificEntries", each with its own rank and a plain-text description of what changes). Use "none" if the spell doesn't heighten at all (a fixed, one-rank-only effect).
- Ground the spell's flavor in this world's setting/lore, but keep its MECHANICAL shape (actions/range/duration conventions, trait list) consistent with real PF2e spell design norms.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildHomebrewSpellSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, rank, campaignContext }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

EXISTING SPELLBOOK ROSTER (avoid repeating a concept or name already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the setting"}
Target rank: ${rank != null ? rank : "choose one that fills a gap in the existing roster (ranks 1-3 are a reasonable default if genuinely unspecified)"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildHomebrewSpellSystemPrompt };
