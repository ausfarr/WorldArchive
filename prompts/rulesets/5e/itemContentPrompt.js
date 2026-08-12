// prompts/rulesets/5e/itemContentPrompt.js
//
// 5e Item generation -- HOMEBREW TIER ONLY (no canonical magic item
// dataset to import -- same gap as Spells/Classes).
//
// "Model writes narrative, code writes math": for weapon/armor items,
// the model names a REAL base item from the SRD equipment list (e.g.
// "longsword", "leather") and a magic bonus (+1/+2/+3) -- code resolves
// the actual damage dice / AC from lib/rulesets/5e/itemFormulas.js's
// real lookup tables plus that bonus, never trusting the model to state
// final numbers directly. For non-weapon/armor items (wondrous items,
// potions, scrolls, etc.) there's no lookup table to resolve against --
// those are inherently narrative/effect-driven, same as real 5e magic
// item design.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");
const { WEAPONS, ARMOR } = require("../../../lib/rulesets/5e/itemFormulas");

const BASE_WEAPON_NAMES = Object.keys(WEAPONS).join(", ");
const BASE_ARMOR_NAMES = Object.keys(ARMOR).join(", ");

const SCHEMA_DESCRIPTION = `{
  "name": "Full Item Name",
  "itemType": "weapon | armor | wondrous | potion | scroll | ring | rod | staff | wand | other",
  "rarity": "Common | Uncommon | Rare | Very Rare | Legendary | Artifact, or null for a purely mundane (non-magical) item",
  "requiresAttunement": false,
  "attunementRequirement": "e.g. 'by a spellcaster' -- or null",
  "baseItem": "EXACT lowercase name from the base weapon/armor list below, ONLY if itemType is 'weapon' or 'armor' -- otherwise null",
  "magicBonus": 1,
  "description": "2-4 sentences of what this item looks like and how it functions",
  "magicalProperties": ["effect 1, worded like real 5e item text", "effect 2, if any"],
  "valueGp": 500,
  "weightLb": 3,
  "flavor": "1-2 sentences of world-flavor for this item's origin/style",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

const STATIC_INSTRUCTIONS = `You are designing an original 5th Edition (D&D-compatible) item for a tabletop game world archive. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- If itemType is "weapon", "baseItem" MUST be exactly one of these real base weapons (lowercase, exact spelling): ${BASE_WEAPON_NAMES}
- If itemType is "armor", "baseItem" MUST be exactly one of these real base armors (lowercase, exact spelling): ${BASE_ARMOR_NAMES}
- For any other itemType, "baseItem" must be null and "magicBonus" must be null -- there's no base stat line to bonus.
- "magicBonus" should be null for a Common/mundane item, and typically +1 (Uncommon-Rare), +2 (Rare-Very Rare), or +3 (Legendary) for a magic weapon/armor -- match it to the rarity you chose.
- "valueGp" should roughly fit the DMG's typical range for the chosen rarity (Common ~50-100gp, Uncommon ~100-500gp, Rare ~500-5000gp, Very Rare ~5000-50000gp, Legendary 50000gp+) -- code will flag it if it's wildly off, so approximate is fine, but don't ignore the rarity entirely.
- Rare and above items typically require attunement; Common/Uncommon usually don't -- this is a norm, not an absolute rule, use judgment.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildHomebrewItemSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, rarity, campaignContext }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

EXISTING ITEM ROSTER (avoid repeating a concept or name already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the setting"}
Target rarity: ${rarity || "choose one that fills a gap in the existing roster"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildHomebrewItemSystemPrompt };
