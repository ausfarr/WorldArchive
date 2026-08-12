// prompts/rulesets/generic/classContentPrompt.js
//
// Generic-ruleset Class generation -- Homebrew only, by definition.
// Unlike 5e Classes (real leveling math to hook into), a Generic
// world has no leveling concept at all -- see
// lib/rulesets/generic/classTemplate.js's header for why this stays
// narrative-first (a themed package of features, not a level table).
// The model only picks which ONE of this world's own attributes (if
// any) the class leans on -- everything else is flavor text, nothing
// numeric to compute afterward.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

function attributeKeysLine(genericSystem) {
  const attrs = (genericSystem && genericSystem.attributes) || [];
  if (!attrs.length) return "This world hasn't defined any attributes yet -- leave \"keyAttribute\" null.";
  const lines = attrs.map((a) => `- ${a.key} ("${a.label}")`).join("\n");
  return `This world's attributes (pick ONE of these exact keys for "keyAttribute", or null if this class doesn't lean on any single one):\n${lines}`;
}

const SCHEMA_DESCRIPTION = `{
  "name": "Full Class Name",
  "keyAttribute": "one of this world's own attribute keys, or null",
  "flavor": "1-3 sentences of lore, grounded in this world's tone/factions",
  "description": "2-4 sentences: what this class is, how it plays, what role it fills",
  "features": [
    { "name": "Feature Name", "description": "what it lets a character do" }
  ],
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;

function buildHomebrewClassSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, genericSystem, campaignContext }) {
  const staticInstructions = `You are designing an original character class/archetype for a tabletop game world archive, using this world's own fully custom homebrew system. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

${attributeKeysLine(genericSystem)}

This world has NO leveling system or class-DC/proficiency math -- "features" should be a themed set of roughly 3-6 narrative abilities a character with this class can do, described in plain language. Do NOT invent numeric bonuses, levels, or dice values -- there's no formula layer for a class to hook into (only individual characters/creatures have numeric attributes in this world's system).

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

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

  return buildCacheableSystemPrompt(staticInstructions, dynamicContext);
}

module.exports = { buildHomebrewClassSystemPrompt };
