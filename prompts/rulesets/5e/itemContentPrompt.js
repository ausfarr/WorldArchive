// prompts/rulesets/5e/itemContentPrompt.js
//
// 5e Item generation -- three tiers as of R5 Phase 5 (previously Homebrew
// only; Import/Reflavor were blocked on real SRD equipment data, which
// scripts/ingestSrd5eFull.js now provides via srd_library.category =
// 'items'):
//
//   - Import: no prompt at all, no Claude call -- routes/generateItem.js
//     copies a srd_library row straight into entries.raw_json via
//     lib/rulesets/5e/srdItemMapper.js. Nothing in this file handles
//     Import; it's listed here only so this file's exports read as the
//     complete three-tier menu (same convention as
//     prompts/rulesets/5e/enemyContentPrompt.js).
//   - Reflavor: the model rewrites name/flavor/description text only.
//     Every mechanically-relevant field (resolvedStats, valueGp,
//     weightLb) is carried through UNCHANGED from the SRD source --
//     "model writes narrative, code writes math."
//   - Homebrew: the model invents a full new item. For weapon/armor
//     items, the model names a REAL base item from the SRD equipment
//     list (e.g. "longsword", "leather") and a magic bonus (+1/+2/+3) --
//     code resolves the actual damage dice / AC from
//     lib/rulesets/5e/itemFormulas.js's real lookup tables plus that
//     bonus, never trusting the model to state final numbers directly.
//     For non-weapon/armor items (wondrous items, potions, scrolls, etc.)
//     there's no lookup table to resolve against -- those are inherently
//     narrative/effect-driven, same as real 5e magic item design.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");
const { WEAPONS, ARMOR } = require("../../../lib/rulesets/5e/itemFormulas");

const BASE_WEAPON_NAMES = Object.keys(WEAPONS).join(", ");
const BASE_ARMOR_NAMES = Object.keys(ARMOR).join(", ");

// The real schema values -- kept as a constant so the route can validate
// the incoming itemType param against the same list this prompt uses,
// rather than trusting client input directly.
const ITEM_TYPES = ["weapon", "armor", "wondrous", "potion", "scroll", "ring", "rod", "staff", "wand", "other"];

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

function buildHomebrewItemSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, rarity, itemType, campaignContext }) {
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
Target rarity: ${rarity || "choose one that fills a gap in the existing roster"}
Target type: ${ITEM_TYPES.includes(itemType) ? `${itemType} (required)` : "choose one that fills a gap in the existing roster"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

const REFLAVOR_SCHEMA = `{
  "name": "New Full Name",
  "flavor": "1-2 sentences of NEW world-flavor for this item's origin/style, grounded in this world's tone/factions",
  "description": "2-4 sentences of NEW description of what this item looks like and how it functions -- keep the same mechanical function described (e.g. still a sword that cuts, still armor that protects), just reworded/reflavored",
  "designNotes": "1-2 sentences on how this reflavor fits this world"
}`;

const REFLAVOR_STATIC_INSTRUCTIONS = `You are reflavoring an official 5th Edition item's NARRATIVE presentation for a specific tabletop game world, while its mechanics stay exactly as printed. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

HARD RULE: you may rename the item and rewrite its flavor/description text -- but do not invent new mechanical effects, damage numbers, AC bonuses, or properties. The item's real stats (damage, AC, cost, weight) are resolved by code from the source item, not from anything you write.

Return JSON matching this exact schema:
${REFLAVOR_SCHEMA}`;

function buildReflavorItemSystemPrompt({ settingContext, loreContext, factionOptionsText, sourceItem, campaignContext }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

SOURCE ITEM (official 5e equipment -- reflavor its narrative, do not change its mechanics):
${JSON.stringify(sourceItem, null, 2)}${campaignContext ? `\n\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(REFLAVOR_STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildHomebrewItemSystemPrompt, buildReflavorItemSystemPrompt, ITEM_TYPES };
