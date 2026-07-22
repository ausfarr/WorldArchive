// prompts/wizardStep3Prompt.js
//
// Step 3 (World Lore) generate-fresh path. Composes the full lore document
// as one Claude call, grounded in whatever Step 1 (Seed & Vision) fields
// were saved. Unlike the import path (lib/loreParsing.js), category tags
// here are assigned directly in routes/wizardLore.js against known section
// keys -- no keyword-guessing needed since we control the schema.

const SCHEMA_DESCRIPTION = `{
  "geography": "2-4 paragraphs: the physical world -- regions, notable locations, climate/environment, scale.",
  "peoples": "2-4 paragraphs: who lives here -- species/cultures/demographics, how they're distributed across the geography.",
  "resources": "1-3 paragraphs: what's scarce, what's valuable, how survival/economy actually works day to day.",
  "culture": "2-4 paragraphs: shared customs, beliefs, taboos, how people greet each other, what's celebrated vs. forbidden.",
  "technologyOrSupernatural": "2-4 paragraphs: the tech level and/or supernatural system in concrete, usable terms -- what it can and can't do, its costs/limits.",
  "history": "2-4 paragraphs: how the world got to its current state -- the key event(s) that shaped it, told as a broad timeline, not a full chronicle."
}`;

function buildWizardStep3SystemPrompt({ step1 }) {
  const s = step1 || {};
  const knownContext = [
    s.genre && s.genre.length ? `Genre & tone: ${Array.isArray(s.genre) ? s.genre.join(", ") : s.genre}` : null,
    s.scale ? `Scale: ${s.scale}` : null,
    s.era ? `Era/tech level: ${s.era}` : null,
    s.supernaturalSystem ? `Supernatural/speculative system: ${s.supernaturalSystem}` : null,
    s.coreTension ? `Core tension: ${s.coreTension}` : null,
    s.inspirations ? `Inspirations: ${s.inspirations}` : null,
    s.nonNegotiables ? `Non-negotiables: ${s.nonNegotiables}` : null
  ].filter(Boolean).join("\n");

  return `You are writing the foundational lore document for a new tabletop/game world, grounded in the world's Seed & Vision (chosen in an earlier step). Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

This lore document will be the ground-truth context fed into every later content generator (NPCs, enemies, items, classes, logs, survivors, factions) for this world -- write it like reference material those generators need, not like a pitch or back-cover blurb. Concrete and specific beats evocative-but-vague every time.

Factions are NOT defined yet (that's a later step) -- write history/politics in terms of forces, tensions, and unresolved questions rather than naming specific factions or leaders. It's fine (good, even) to leave open threads a later Factions step could resolve differently.

Respect every non-negotiable given below as a hard constraint, not a suggestion.

SEED & VISION (grounding context -- stay consistent with all of this):
${knownContext || "(nothing provided -- invent a coherent world from scratch, keeping every section internally consistent with the others)"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildWizardStep3SystemPrompt };
