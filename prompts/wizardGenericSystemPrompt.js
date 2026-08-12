// prompts/wizardGenericSystemPrompt.js
//
// Multi-ruleset genericization, Generic ruleset wizard step. Unlike the
// Echoes-only Stat System step (prompts/wizardStatSystemPrompt.js), which
// only ever relabels six FIXED canonical attributes, a Generic-ruleset
// world is inventing its own attribute list from scratch -- there's no
// underlying mechanic to stay grounded against, so this prompt asks the
// model to propose the list itself, plus (optionally) a small set of
// derived stats computed from those attributes via
// lib/rulesets/generic/statFormulas.js's single-term linear formula
// engine (base + coefficient * attributes[attributeKey]).
//
// Kept deliberately modest in scope -- 3 to 6 attributes, at most a
// couple of derived stats -- matching statFormulas.js's own single-term-
// per-stat design rather than inventing a more expressive system the
// formula engine can't actually evaluate.

const SCHEMA_DESCRIPTION = `{
  "attributes": [
    { "key": "lower_snake_case_key", "label": "Display Name" }
    // 3 to 6 attributes total
  ],
  "useFormula": true or false,
  "derivedStats": [
    {
      "key": "lower_snake_case_key",
      "label": "Display Name",
      "attributeKey": "must exactly match one of the attributes[].key values above",
      "coefficient": number,
      "base": number
    }
    // only include entries here if useFormula is true; empty array if useFormula is false
  ]
}`;

function buildWizardGenericSystemPrompt({ step1, loreContext }) {
  const s = step1 || {};
  const knownContext = [
    s.genre && s.genre.length ? `Genre & tone: ${Array.isArray(s.genre) ? s.genre.join(", ") : s.genre}` : null,
    s.era ? `Era/tech level: ${s.era}` : null,
    s.supernaturalSystem ? `Supernatural/speculative system: ${s.supernaturalSystem}` : null,
    s.coreTension ? `Core tension: ${s.coreTension}` : null
  ].filter(Boolean).join("\n");

  return `You are designing a small homebrew character-attribute system for a tabletop/game world that has no pre-existing mechanical framework -- this is NOT D&D, Pathfinder, or any published system; invent something that fits THIS world's own voice. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

Design rules:
- Propose 3 to 6 core attributes (e.g. "Might", "Grit", "Cunning" -- but invent names that fit this specific world's tone, don't default to generic fantasy stat names unless the setting actually calls for them). Each needs a short lower_snake_case key (used internally, never shown to players) and a display label (shown to players).
- Decide whether this world wants attribute NUMBERS to mechanically compute anything ("useFormula": true) or whether attributes are flavor-only descriptors a GM interprets narratively ("useFormula": false, in which case "derivedStats" must be an empty array).
- If useFormula is true, propose at most 2-3 derived stats (e.g. "Hit Points", "Defense"). Each derived stat is computed as base + coefficient * attributes[attributeKey] -- a SINGLE attribute drives each derived stat, not a sum of several. Pick sensible coefficients/bases for the genre (e.g. a gritty low-fantasy world might want small numbers; a superhero world might want larger ones).
- Every derivedStats[].attributeKey MUST exactly match one of the keys you defined in attributes[].

SEED & VISION (grounding context):
${knownContext || "(nothing provided -- use general genre conventions)"}

WORLD LORE (grounding context, if available):
${loreContext || "(no lore saved yet for this world)"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildWizardGenericSystemPrompt };
