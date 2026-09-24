// prompts/wizardStep1Prompt.js
//
// Step 1 (Seed/Vision) of the World Setup Wizard. Genre/scale/era are
// structured picks the user makes directly (no generation needed) — this
// builder only covers the three open-ended fields that benefit from a
// "generate for me" assist: core tension, inspirations, non-negotiables.
// One combined call rather than three separate ones, since a good core
// tension and its fitting inspirations are naturally linked — matches the
// existing item generator's precedent of one call branching into related
// fields, rather than a new one-field-per-call pattern.
//
// worldDescription is the user's free-text pitch ("a wild west world").
// Before it existed, a user with only a vague idea who clicked Generate
// got suggestions grounded in nothing but the dropdowns, which always
// carry a value even when untouched (Scale/Era default to their first
// option), so output read as random. The description is now the primary
// signal, and the prompt tells the model to prefer it over dropdown
// values that contradict it, since those may just be unedited defaults.

const SCHEMA_DESCRIPTION = `{
  "coreTension": "1-2 sentences: the central conflict or pressure driving this world's stories — not a plot, a standing condition (e.g. 'a fixed resource everyone needs is controlled by whoever is willing to be cruelest about it').",
  "inspirations": "a short comma-separated list of 3-5 touchstones (books/games/films/eras) that capture the tone being aimed for — real references, not vague genre labels.",
  "nonNegotiables": "1-2 sentences: a hard rule or tone boundary for this world that should never be violated by later generated content (e.g. 'no redemption arcs for the ruling faction' or 'technology never exceeds early-2000s consumer level')."
}`;

function buildWizardStep1SystemPrompt({ worldName, worldDescription, genre, scale, era, supernaturalSystem }) {
  const knownContext = [
    worldName ? `World name: ${worldName}` : null,
    worldDescription ? `World description (the creator's own words): ${worldDescription}` : null,
    genre ? `Genre & tone: ${genre}` : null,
    scale ? `Scale: ${scale}` : null,
    era ? `Era/tech level: ${era}` : null,
    supernaturalSystem ? `Supernatural/speculative system: ${supernaturalSystem}` : null
  ].filter(Boolean).join("\n");

  return `You are helping a tabletop/game worldbuilder fill in the opening "Seed & Vision" step of a new world. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

This is the very first step of world creation — there is no existing lore, factions, or roster to stay consistent with yet. Ground everything in whatever the user has already chosen below; invent the rest in a way that would plausibly follow from those choices.

If a WORLD DESCRIPTION is given, it is the creator's own pitch and the most important input: every suggestion must clearly fit it, and should build on its specific ideas rather than drifting to a generic take on the genre. If it contradicts a genre/scale/era value below, follow the description -- those dropdowns may be untouched defaults.

WHAT MAKES A GOOD CORE TENSION: a standing condition, not a plot beat — something that generates stories on its own rather than being one story itself. Avoid generic "good vs evil" framing; aim for something with a genuine double edge (both sides have a real point, or the "solution" has a real cost).

WHAT MAKES GOOD INSPIRATIONS: specific, real touchstones (name actual books/games/films/historical periods) rather than genre labels like "gritty fantasy" — inspirations should be recognizable enough that another person could look them up and immediately get the vibe.

WHAT MAKES A GOOD NON-NEGOTIABLE: a concrete boundary that would actually constrain later content generation in a useful way — not a vague aspiration like "keep it interesting."

KNOWN CONTEXT SO FAR:
${knownContext || "(nothing chosen yet — invent freely, but keep all three fields internally consistent with each other)"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildWizardStep1SystemPrompt };
