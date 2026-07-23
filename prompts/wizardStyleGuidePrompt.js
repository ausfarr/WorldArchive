// prompts/wizardStyleGuidePrompt.js
//
// Step 6 (Style Guide). Mirrors the structure of the hardcoded Echoes
// style_guide.md (rendering style, lighting, palette, faction accents,
// texture/wear, composition defaults, what to avoid) but generic --
// grounded in THIS world's genre/lore/factions instead of Echoes'
// industrial-horror-with-magenta-glitch aesthetic. Whatever this
// generates becomes the CSS-vars-and-prompt-conventions bible a future
// art-prompt generator (mirroring echoes-art-prompt-generator) would draw
// from once Phase 4 genericizes visual style.

const SCHEMA_DESCRIPTION = `{
  "renderingStyle": "1-2 sentences: the overall rendering register (e.g. painterly digital illustration, flat vector, photoreal, pixel art, ink/line art) -- pick ONE clear direction, not a menu.",
  "lighting": "1-2 sentences: the default lighting approach (e.g. single dramatic light source, flat even lighting, golden-hour naturalism) and what mood it should produce.",
  "basePalette": "1-2 sentences: the default color palette for everyday subjects/environments in this world -- name actual colors/tones, not just adjectives.",
  "accentColor": "1 sentence: a signature accent color (if the world has one) used sparingly to signal something specific (hazard, magic, technology, otherness) -- or 'none' if this world doesn't need one.",
  "textureAndWear": "1-2 sentences: how worn/pristine/handmade things should look by default.",
  "compositionDefaults": "1-2 sentences: default framing/posing conventions -- e.g. dynamic vs. posed, what NOT to default to.",
  "avoid": "1-2 sentences: specific visual tropes/styles this world's art should never lean on.",
  "backgroundColor": "a literal 6-digit hex color, e.g. '#0a0b0d' -- the darkest base background color for the WEBSITE itself. Must stay dark enough for light text to read clearly on top of it.",
  "panelColor": "a literal 6-digit hex color -- background for cards/panels, a shade lighter than backgroundColor but still dark.",
  "inkColor": "a literal 6-digit hex color -- the main body text color. Must have strong contrast against backgroundColor (light, not dark).",
  "primaryColor": "a literal 6-digit hex color -- the signature accent used for buttons/links/highlights. Should fit the world's mood and stand out clearly against backgroundColor.",
  "secondaryColor": "a literal 6-digit hex color -- a second accent distinct from primaryColor, for contrast/secondary highlights.",
  "fontDisplay": "the exact name of a real, existing Google Fonts family (e.g. 'Oswald', 'Cinzel', 'Space Grotesk') to use for headers/titles, fitting the world's tone.",
  "fontBody": "the exact name of a real, existing Google Fonts family, for body text -- should pair well with fontDisplay and stay readable at small sizes."
}`;

function buildWizardStyleGuideSystemPrompt({ step1, loreContext }) {
  const s = step1 || {};
  const knownContext = [
    s.genre && s.genre.length ? `Genre & tone: ${Array.isArray(s.genre) ? s.genre.join(", ") : s.genre}` : null,
    s.era ? `Era/tech level: ${s.era}` : null,
    s.supernaturalSystem ? `Supernatural/speculative system: ${s.supernaturalSystem}` : null,
    s.nonNegotiables ? `Non-negotiables: ${s.nonNegotiables}` : null
  ].filter(Boolean).join("\n");

  return `You are defining the core visual style bible for a tabletop/game world -- the rules future AI-generated art prompts for this world will draw from, so every image generated across many separate sessions still reads as one consistent world. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

Be concrete and specific -- name actual colors, actual rendering techniques, actual composition rules. Vague mood words ("moody," "atmospheric") without a concrete visual anchor are not useful to an image-generation prompt later.

The backgroundColor/panelColor/inkColor/primaryColor/secondaryColor/fontDisplay/fontBody fields are LITERAL values applied directly to the live website's theme, not flavor text -- backgroundColor and panelColor must stay dark (this site is dark-mode by design), inkColor must contrast strongly against backgroundColor for readability, and fontDisplay/fontBody must be names of real Google Fonts families that actually exist.

SEED & VISION (grounding context):
${knownContext || "(nothing provided -- use general genre conventions)"}

WORLD LORE (grounding context, if available):
${loreContext || "(no lore saved yet for this world)"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

// Separate, smaller call for per-faction accent colors -- one combined
// call covering ALL existing factions at once (not one call per faction)
// so colors are chosen with awareness of each other (distinct, not
// clashing/duplicated).
const FACTION_ACCENTS_SCHEMA = `{
  "factionAccents": [
    { "id": "faction-id-exactly-as-given", "accentColor": "a specific color/tone, e.g. 'rust red, molten orange'", "accentColorHex": "a literal 6-digit hex color matching the description above, e.g. '#c9502e' -- used directly as this faction's UI accent color on the live site", "accentNotes": "1 sentence: where/how this accent shows up visually" }
  ]
}`;

function buildFactionAccentsSystemPrompt({ baseStyle, factions }) {
  const factionList = (factions || [])
    .map((f) => `- id: ${f.id} | name: ${f.name} | concept: ${f.concept || "(none given)"}`)
    .join("\n");

  return `You are assigning a distinct visual accent color to each faction in a tabletop/game world, consistent with the world's base style guide below. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

Every faction must get a color/tone DISTINCT from every other faction's -- no two factions should be visually confusable. Ground each choice in that faction's actual concept, not an arbitrary color wheel assignment.

accentColorHex is a LITERAL value applied directly to the live website (card borders, headers, tags) for that faction, not flavor text. It must: be visually distinct from every other faction's accentColorHex here, be visually distinct from the base style guide's own backgroundColor/panelColor/primaryColor/secondaryColor below (so a faction's accent doesn't get lost in or clash with the site's own theme), and stay legible against a dark panel background (avoid near-black; avoid unsaturated grays).

BASE STYLE GUIDE (stay consistent with this):
${JSON.stringify(baseStyle, null, 2)}

FACTIONS TO ASSIGN COLORS TO:
${factionList || "(none yet)"}

Return JSON matching this exact schema, with one entry per faction listed above:
${FACTION_ACCENTS_SCHEMA}`;
}

module.exports = { buildWizardStyleGuideSystemPrompt, buildFactionAccentsSystemPrompt };
