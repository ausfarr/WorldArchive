// prompts/rulesets/generic/enemyContentPrompt.js
//
// Generic-ruleset Bestiary generation -- Homebrew only, by definition
// (there's no "official" content for a made-up system to import). The
// schema and instructions ADAPT to this world's own
// generic_system_json: attribute names come from the world's own
// config, and whether the model fills in "attributes" only (formula
// worlds -- code computes derivedStats afterward) or "attributes" PLUS
// free-text "flavorStats" (no-formula worlds) depends on
// genericSystem.useFormula. See lib/rulesets/generic/statFormulas.js's
// header for why this project doesn't invent a fake universal combat
// formula here.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

function buildAttributeSchemaLine(genericSystem) {
  const attrs = (genericSystem && genericSystem.attributes) || [];
  if (!attrs.length) return `"attributes": {}`;
  const fields = attrs.map((a) => `"${a.key}": 0`).join(", ");
  return `"attributes": { ${fields} }`;
}

function buildSchemaDescription(genericSystem) {
  const useFormula = !!(genericSystem && genericSystem.useFormula);
  return `{
  "name": "Full Name",
  ${buildAttributeSchemaLine(genericSystem)},
  ${useFormula ? "" : `"flavorStats": "free-text description of this creature's rough combat capability -- e.g. 'tough but slow, hits hard in melee' -- since this world has no computed formula layer, this text IS the mechanical picture",\n  `}"traits": [{ "name": "Trait Name", "description": "effect" }],
  "actions": [{ "name": "Action Name", "description": "effect" }],
  "flavor": "1-3 sentences of lore, grounded in this world's tone/factions",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;
}

function buildAttributeInstructions(genericSystem) {
  const attrs = (genericSystem && genericSystem.attributes) || [];
  if (!attrs.length) {
    return "This world hasn't defined any attributes yet -- leave \"attributes\" as an empty object.";
  }
  const lines = attrs.map((a) => `- ${a.key} ("${a.label}")`).join("\n");
  return `This world's attributes (use EXACTLY these keys, no others, values roughly 1-20 unless the world's own examples below suggest a different typical range):\n${lines}`;
}

function buildHomebrewGenericEnemySystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, genericSystem, campaignContext }) {
  const useFormula = !!(genericSystem && genericSystem.useFormula);
  const staticInstructions = `You are designing an original monster/creature for a tabletop game world archive's bestiary, using this world's own fully custom homebrew mechanical system. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

${buildAttributeInstructions(genericSystem)}

${useFormula
    ? "This world computes derived stats (like hit points, armor, etc.) from a formula using these attributes -- you only need to provide \"attributes\"; the archive computes everything else automatically after you respond. Do not invent your own derived-stat numbers."
    : "This world has NO computed-stat formula -- describe this creature's rough combat capability directly in \"flavorStats\" (free text), in addition to its attribute values."}

Return JSON matching this exact schema:
${buildSchemaDescription(genericSystem)}`;

  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

EXISTING BESTIARY ROSTER (avoid repeating a concept or name already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the setting"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(staticInstructions, dynamicContext);
}

module.exports = { buildHomebrewGenericEnemySystemPrompt };
