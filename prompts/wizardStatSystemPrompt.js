// prompts/wizardStatSystemPrompt.js
//
// Step 5 (Stat System). Skinning ONLY -- the six canonical attributes and
// their formulas (lib/statFormulas.js) never change; this just generates
// a fitting label + one-line flavor description for each, in the world's
// own terminology. One combined call for all six, same "related fields,
// one call" precedent as Step 1 and Step 3.

const SCHEMA_DESCRIPTION = `{
  "body": { "label": "world-flavored name for this attribute", "description": "one sentence: what it represents in-fiction" },
  "reflex": { "label": "...", "description": "..." },
  "knowledge": { "label": "...", "description": "..." },
  "presence": { "label": "...", "description": "..." },
  "sanity": { "label": "...", "description": "..." },
  "fate": { "label": "...", "description": "..." }
}`;

// What each canonical stat actually governs mechanically (from
// lib/statFormulas.js) -- given to the model so its flavor labels stay
// grounded in what the stat DOES, not just vibes.
const STAT_MECHANICS = {
  body: "physical power/toughness -- drives max health and physical resilience",
  reflex: "speed and reaction -- drives dodge chance, accuracy, and move speed",
  knowledge: "mental capacity/proficiency -- drives max energy and skill-based effects",
  presence: "force of personality/influence -- drives buff and debuff potency",
  sanity: "mental stability/willpower -- contributes to max health, resistance to breaking under stress",
  fate: "luck/destiny -- drives crit chance and max energy"
};

function buildWizardStatSystemPrompt({ step1, loreContext }) {
  const s = step1 || {};
  const knownContext = [
    s.genre && s.genre.length ? `Genre & tone: ${Array.isArray(s.genre) ? s.genre.join(", ") : s.genre}` : null,
    s.era ? `Era/tech level: ${s.era}` : null,
    s.supernaturalSystem ? `Supernatural/speculative system: ${s.supernaturalSystem}` : null
  ].filter(Boolean).join("\n");

  const mechanicsBlock = Object.entries(STAT_MECHANICS)
    .map(([key, desc]) => `- ${key.toUpperCase()}: ${desc}`)
    .join("\n");

  return `You are renaming a tabletop/game world's six core character attributes to fit its own setting and tone. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

The underlying mechanics of each attribute are FIXED and do not change -- only the label and flavor description change. A good label makes mechanical sense given what the stat actually does (see below), and reads as native to this world's own vocabulary rather than a generic fantasy/sci-fi reskin.

WHAT EACH ATTRIBUTE MECHANICALLY GOVERNS (do not contradict this in your labels/descriptions):
${mechanicsBlock}

SEED & VISION (grounding context):
${knownContext || "(nothing provided -- use general genre conventions)"}

WORLD LORE (grounding context, if available):
${loreContext || "(no lore saved yet for this world)"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildWizardStatSystemPrompt, STAT_MECHANICS };
