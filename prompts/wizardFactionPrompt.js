// prompts/wizardFactionPrompt.js
//
// Step 4 (Factions) generator. Deliberately separate from
// prompts/factionContentPrompt.js (the legacy Echoes-specific generator,
// which pulls FACTION_SEEDS + the Echoes World Bible) -- this one grounds
// itself in whatever THIS world's own lore_sections say instead, since
// there's no hardcoded seed list for a user-defined world. See
// lib/loreContext.js's header comment for the full reasoning.

const SCHEMA_DESCRIPTION = `{
  "name": "Faction name",
  "concept": "One sentence, punchy -- what this faction IS in a single line.",
  "politics": "1-2 paragraphs: internal power structure, how decisions actually get made, who really has influence vs. who appears to.",
  "government": "1 paragraph: the formal structure/title system, if any -- can be informal/absent if that fits the faction better.",
  "economy": "1 paragraph: how this faction sustains itself materially -- resources, trade, extraction, labor.",
  "military": "1 paragraph: how this faction projects or defends force, if at all -- can be non-martial if that fits.",
  "tensions": "1-2 paragraphs: internal fractures/disagreements AND external conflicts with other forces in the world, plus one genuine secret this faction is hiding (folded into this section, not a separate field)."
}`;

// mode: "fill" (name/concept given, fill in the rest) or "invent" (name
// not given, invent everything including the name/concept).
function buildWizardFactionSystemPrompt({ loreContext, existingFactions, name, concept, mode }) {
  const existingNames = (existingFactions || []).map((f) => f.name).filter(Boolean);
  const overlapBlock = existingNames.length
    ? `\n\nALREADY-DEFINED FACTIONS IN THIS WORLD (don't reinvent these, don't duplicate their core concept, but you may reference tension/rivalry with them where it fits naturally): ${existingNames.join(", ")}\n`
    : "";

  const inputBlock = mode === "invent"
    ? "Invent a faction name and one-line concept, then fill out the rest. Make sure it's distinct from anything already defined below."
    : `Faction Name: ${name}\nConcept: ${concept || "(not given -- infer a fitting one-line concept from the name and the world's lore below)"}`;

  return `You are writing a faction profile for a tabletop/game world, grounded in the world's established lore. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

Stay consistent with the world's lore given below -- don't contradict its geography, history, tone, or established peoples/culture. A faction should feel like it grew out of this specific world's conditions, not a generic archetype dropped in.

WORLD LORE — GROUND TRUTH (stay consistent with this):
${loreContext || "(no lore saved yet for this world -- invent a faction consistent with general genre conventions)"}
${overlapBlock}
YOUR TASK:
${inputBlock}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildWizardFactionSystemPrompt };
