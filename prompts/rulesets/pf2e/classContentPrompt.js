// prompts/rulesets/pf2e/classContentPrompt.js
//
// PF2e Class generation -- HOMEBREW TIER ONLY, same reasoning as PF2e
// Bestiary (prompts/rulesets/pf2e/enemyContentPrompt.js): no verified
// ORC-licensed class dataset exists to import/reflavor from.
//
// "Model writes narrative, code writes math," with one PF2e-specific
// wrinkle explained at length in lib/rulesets/pf2e/classFormulas.js's
// header: the exact levels a class's Class DC ranks up at are a genuine
// per-class DESIGN CHOICE in real PF2e (not a universal formula the way
// 5e's proficiency bonus table is), so the model proposes that schedule
// -- code only validates it's LEGAL (ranks never decrease, starts at
// level 1, stays in 1-20) and does 100% of the resulting bonus/DC
// arithmetic. Perception and the three saving throws are NOT
// model-proposed at all -- they follow this project's own fixed default
// curve (classFormulas.js's DEFAULT_GOOD_SAVE_SCHEDULE/
// DEFAULT_POOR_SAVE_SCHEDULE/DEFAULT_PERCEPTION_SCHEDULE); the model
// only picks WHICH two of the three saves get the faster "good" curve.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "name": "Full Class Name",
  "keyAbility": "str | dex | con | int | wis | cha",
  "hpTier": "high (12/level, front-line martial) | medium (10/level, hybrid) | low (8/level, skirmisher/trickster) | caster (6/level, dedicated spellcaster)",
  "goodSaves": ["fortitude", "will"],
  "classDcSchedule": [
    { "level": 1, "rank": "trained" }
    // additional entries where THIS class's Class DC proficiency ranks up, e.g. { "level": 7, "rank": "expert" }, { "level": 15, "rank": "master" }
    // must start at level 1, ranks may only ever increase (never go backward), stay within levels 1-20
  ],
  "features": [
    { "level": 1, "name": "Feature Name", "description": "rules text" }
  ],
  "flavor": "2-4 sentences of lore, grounded in this world's tone/factions",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

const STATIC_INSTRUCTIONS = `You are designing an original Pathfinder 2nd Edition (PF2e-compatible) character class for a tabletop game world archive. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- "goodSaves" must contain exactly 2 of "fortitude"/"reflex"/"will" -- the one you leave out is this class's "poor" save (a real PF2e class design convention: every class has one save that lags behind the other two).
- "classDcSchedule" is YOUR design choice for how fast this class's core Class DC improves -- a front-line martial class typically ranks up faster/earlier than a support-focused one, but there's no single correct answer; just keep it internally consistent with the class's concept and power level. Do not include Perception or the three saving throws in your schedule -- those are computed automatically from a fixed project-wide curve, not up to you.
- "features" should cover roughly 6-10 MEANINGFUL milestone levels (1, and others of your choosing that fit the class's power curve) -- do NOT write a unique feature for every level 1-20. Do NOT write features for the levels where Ability Boosts (5, 10, 15, 20) or Skill Increases (3, 5, 7, 9, 11, 13, 15, 17, 19) occur -- those are inserted automatically.
- "hpTier" should reflect the class's actual battlefield role -- don't default every class to "high" just because more HP sounds better; a caster or trickster class should honestly pick "caster" or "low".

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

module.exports = { buildHomebrewClassSystemPrompt };
