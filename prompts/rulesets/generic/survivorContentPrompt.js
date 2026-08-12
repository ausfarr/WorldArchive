// prompts/rulesets/generic/survivorContentPrompt.js
//
// Generic-ruleset Player Character generation -- Homebrew only. A PC is
// "a Class instance with a name/background" (same framing every
// ruleset's Phase 8 used), built on one of this world's own generated
// Generic Classes. The model proposes attribute VALUES (validated
// against this world's real attribute keys) and, if this world uses a
// formula layer, code computes every derived stat afterward -- never
// model-stated, same "model writes narrative, code writes math" split
// Bestiary's Generic Homebrew tier already established.

const { buildCacheableSystemPrompt } = require("../../../lib/claude");

function attributeSchemaLine(genericSystem) {
  const attrs = (genericSystem && genericSystem.attributes) || [];
  if (!attrs.length) return `"attributes": {}`;
  const fields = attrs.map((a) => `"${a.key}": 0`).join(", ");
  return `"attributes": { ${fields} }`;
}

function attributeInstructions(genericSystem) {
  const attrs = (genericSystem && genericSystem.attributes) || [];
  if (!attrs.length) return "This world hasn't defined any attributes yet -- leave \"attributes\" as an empty object.";
  const lines = attrs.map((a) => `- ${a.key} ("${a.label}")`).join("\n");
  return `This world's attributes (use EXACTLY these keys, no others, values roughly 1-20 unless this world's existing roster suggests a different typical range):\n${lines}`;
}

function buildSchemaDescription(genericSystem) {
  const useFormula = !!(genericSystem && genericSystem.useFormula);
  return `{
  "name": "Full Character Name",
  "classId": "the EXACT id of one class from the AVAILABLE CLASSES list below",
  ${attributeSchemaLine(genericSystem)},
  ${useFormula ? "" : "\"flavorStats\": \"free-text description of this character's rough capabilities -- since this world has no computed formula layer, this text IS the mechanical picture\",\n  "}"equipment": "a short list of carried gear",
  "background": "1-2 sentences: their life before becoming an adventurer",
  "backstory": "2-4 sentences, grounded in this world's lore/factions",
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster"
}`;
}

function buildHomebrewSurvivorSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, availableClassesText, name, faction, genericSystem, campaignContext }) {
  const useFormula = !!(genericSystem && genericSystem.useFormula);
  const staticInstructions = `You are creating an original Player Character for a tabletop game world archive, built on one of this world's own generated Classes and using this world's own fully custom homebrew attribute system. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

RULES:
- "classId" MUST be the exact id of one of the classes listed in AVAILABLE CLASSES below -- do not invent a class or use a name not on that list.
- ${attributeInstructions(genericSystem)}
- ${useFormula ? "This world computes derived stats from a formula using these attributes -- you only need to provide \"attributes\"; the archive computes everything else automatically after you respond. Do not invent your own derived-stat numbers." : "This world has NO computed-stat formula -- describe this character's rough capabilities directly in \"flavorStats\" (free text), in addition to their attribute values."}

Return JSON matching this exact schema:
${buildSchemaDescription(genericSystem)}`;

  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD:
${factionOptionsText}

WORLD LORE — GROUND TRUTH:
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}

AVAILABLE CLASSES (choose "classId" from EXACTLY one of these):
${availableClassesText}

EXISTING PLAYER CHARACTER ROSTER (avoid repeating a concept, class combo, or name already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the setting"}
Faction: ${faction || "choose one that fills a gap in the existing roster, or null if faction-agnostic"}${campaignContext ? `\nCampaign context: ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(staticInstructions, dynamicContext);
}

module.exports = { buildHomebrewSurvivorSystemPrompt };
