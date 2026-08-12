// prompts/rulesets/generic/itemContentPrompt.js
//
// Generic-ruleset Item generation -- Homebrew only, narrative-first (no
// rarity/pricing system exists for a made-up world, same reasoning as
// lib/rulesets/generic/itemTemplate.js's header). The model may
// optionally tie the item to ONE of this world's own attributes with a
// flat bonus -- nothing else numeric to invent.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

function attributeKeysLine(genericSystem) {
  const attrs = (genericSystem && genericSystem.attributes) || [];
  if (!attrs.length) return "This world hasn't defined any attributes yet -- leave \"boostsAttribute\" null.";
  const lines = attrs.map((a) => `- ${a.key} ("${a.label}")`).join("\n");
  return `This world's attributes (if this item grants a bonus, pick ONE of these exact keys for "boostsAttribute", or null if it doesn't boost any attribute):\n${lines}`;
}

const SCHEMA_DESCRIPTION = `{
  "name": "Item Name",
  "boostsAttribute": "one of this world's own attribute keys, or null",
  "boostAmount": "integer bonus (positive or negative), or null if boostsAttribute is null",
  "flavor": "1-2 sentences of lore, grounded in this world's tone/factions",
  "description": "2-4 sentences: what it looks like and does",
  "designNotes": "1 sentence: how this avoids overlapping the existing roster"
}`;

function buildHomebrewItemSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, genericSystem, campaignContext }) {
  const staticInstructions = `You are designing an original item for a tabletop game world archive, using this world's own fully custom homebrew system. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

${attributeKeysLine(genericSystem)}

Most items should leave "boostsAttribute" null -- only give a mechanical bonus to something genuinely special (an enchanted or masterwork item), not everyday gear. This world has no rarity tiers or pricing system, so do not invent a rarity, value, or weight anywhere in your output.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

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

  return buildCacheableSystemPrompt(staticInstructions, dynamicContext);
}

module.exports = { buildHomebrewItemSystemPrompt };
