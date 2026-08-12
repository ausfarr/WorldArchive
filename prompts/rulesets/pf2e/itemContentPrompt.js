// prompts/rulesets/pf2e/itemContentPrompt.js
//
// PF2e Item generation -- HOMEBREW TIER ONLY, same reasoning as PF2e
// Bestiary/Classes: no verified ORC-licensed item dataset exists to
// import/reflavor from.
//
// "Model writes narrative, code writes math": the model picks a level,
// price category, Bulk, and which fundamental rune tiers (if any) this
// item has, plus flavor names for property runes. Code then computes
// the ACTUAL price guidance (itemFormulas.js's priceGuidance(), clearly
// labeled an estimate -- see that file's header for why an exact
// official price-by-level table isn't asserted here) and resolves every
// rune tier's real numeric bonus -- the model never states a final gp
// price or a rune's bonus number directly.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "name": "Item Name",
  "itemType": "weapon | armor | other",
  "level": 0,
  "priceCategory": "primary | secondary | tertiary",
  "bulk": "negligible | light | 1 | 2 | 3",
  "potencyTier": 1, 2, 3, or null,
  "strikingTier": 1, 2, 3, or null,
  "resilientTier": 1, 2, 3, or null,
  "propertyRuneNames": ["Flaming", "..."],
  "description": "2-4 sentences: what it looks like and does mechanically in plain language",
  "flavor": "1-3 sentences of lore, grounded in this world's tone/factions",
  "designNotes": "1 sentence: how this avoids overlapping the existing roster"
}`;

const STATIC_INSTRUCTIONS = `You are designing an original Pathfinder 2nd Edition (PF2e-compatible) item for a tabletop game world archive. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- "level" (0-20) is the item's rarity/power level -- higher means rarer and more powerful. Most everyday gear is level 0-4; only reserve high levels for genuinely late-game items.
- "priceCategory": "primary" for a weapon/armor/core combat item, "secondary" for a significant utility/support item, "tertiary" for a niche/flavor item. This affects its suggested price, which the archive computes automatically -- do not state a gp price yourself.
- "potencyTier"/"strikingTier"/"resilientTier" are OPTIONAL fundamental rune upgrades, null if this item doesn't have them. A weapon can have potencyTier AND strikingTier; an armor can have potencyTier AND resilientTier; strikingTier never applies to armor and resilientTier never applies to a weapon. A mundane (non-magical) item should leave all three null.
- "propertyRuneNames" should have at most as many entries as the item's potencyTier allows (tier 1 = 1 slot, tier 2 = 2 slots, tier 3 = 3 slots) -- leave it an empty array if potencyTier is null.
- "bulk" describes how unwieldy the item is to carry -- most small/handheld items are "light", a few are "negligible" (coins, rings, tiny items), heavier gear (armor, big weapons) is "1" or higher.
- Do NOT invent a final gp price or a numeric rune bonus anywhere in your output -- those are computed automatically from the tier/level you chose.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildHomebrewItemSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, campaignContext }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

EXISTING ITEM ROSTER (avoid repeating a concept or name already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the setting"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildHomebrewItemSystemPrompt };
