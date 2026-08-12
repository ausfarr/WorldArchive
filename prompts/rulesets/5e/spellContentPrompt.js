// prompts/rulesets/5e/spellContentPrompt.js
//
// 5e Spell generation -- HOMEBREW TIER ONLY: no verified CC-BY-4.0
// STRUCTURED spell dataset exists to import from (Tabyltop/CC-SRD only
// ships monsters as structured JSON -- see scripts/ingestSrd5e.js's
// header). If one turns up later, Import/Reflavor can be added the same
// shape Phase 3 used for Bestiary.
//
// Unlike Bestiary's Homebrew tier, there's no "code computes the real
// answer from proposed numbers" step here for spell level -- 5e spell
// design has no official per-level power-budget formula the way
// Challenge Rating does for monsters (see
// lib/rulesets/5e/spellFormulas.js's header for why). What code DOES
// own: if this is a cantrip, the model supplies ONLY the base (1st-4th
// character level) damage, and code deterministically derives the
// correct 5th/11th/17th-level scaling table -- never trusting the model
// to compute that itself.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "name": "Full Name",
  "level": 0,
  "school": "Abjuration | Conjuration | Divination | Enchantment | Evocation | Illusion | Necromancy | Transmutation",
  "ritual": false,
  "concentration": false,
  "castingTime": "e.g. 1 action, 1 reaction, 1 minute",
  "range": "e.g. 60 feet, Self, Touch",
  "components": "e.g. V, S, M",
  "materialComponent": "material component description, or null if no M component",
  "duration": "e.g. Instantaneous, Concentration, up to 1 minute",
  "classes": ["Wizard", "Sorcerer"],
  "description": "the spell's full rules text, 2-5 sentences",
  "atHigherLevels": "how this spell scales when cast with a higher-level slot (leveled spells only) -- null for cantrips",
  "cantripBaseDamage": { "diceCount": 1, "dieSize": 10, "damageType": "fire" },
  "flavor": "1-2 sentences of world-flavor for this spell's origin/style",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

const STATIC_INSTRUCTIONS = `You are designing an original 5th Edition (D&D-compatible) spell for a tabletop game world archive's spellbook. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- "level" must be an integer 0-9 (0 = cantrip).
- If level is 0 (a cantrip) AND the spell deals damage, fill in "cantripBaseDamage" with the BASE damage at character levels 1st-4th only (e.g. a cantrip that deals 1d10 fire at low levels: { "diceCount": 1, "dieSize": 10, "damageType": "fire" }) -- do NOT write out the 5th/11th/17th-level scaling yourself, code computes that from your base value. Leave "cantripBaseDamage" null for non-damaging cantrips and for every leveled spell (level 1+).
- If level is 1-9, "atHigherLevels" should describe how the spell improves when cast with a higher-level slot (typical pattern: "+1d6 damage per slot level above Nth", but use your judgment for the spell's actual effect).
- Ground the spell's flavor in this world's setting/lore, but keep its MECHANICAL shape (casting time/range/components/duration conventions) consistent with real 5e spell design norms.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildHomebrewSpellSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, level, school, campaignContext }) {
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
Target level: ${level != null ? level : "choose one that fills a gap in the existing roster (levels 0-3 are a reasonable default if genuinely unspecified)"}
School (if requested): ${school || "choose one that fits the concept"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildHomebrewSpellSystemPrompt };
