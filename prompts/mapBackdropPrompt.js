// prompts/mapBackdropPrompt.js
//
// The map backdrop is a WORLD-level asset, not tied to any single
// Location entry -- one image per world, generated once (auto-triggered
// on first Map page load, see routes/map.js) and cached in the
// map-backdrops storage bucket. Deliberately a separate prompt builder
// from artPromptPrompt.js's ENVIRONMENT branch (which frames one
// specific named place) rather than reusing it with a fake synthetic
// "location" object -- the composition requirements are genuinely
// different: this needs to read as a top-down/angled OVERVIEW with
// deliberate open negative space, since SVG location pins + text labels
// render on top of it client-side (see archive/js/mapLayout.js). A
// prompt tuned for one detailed named place would produce something too
// busy to be legible once labels are overlaid.

function buildMapBackdropSystemPrompt({ settingContext, loreContext, styleGuide, factionSummaryText }) {
  const s = styleGuide || {};
  const styleLines = [
    s.renderingStyle ? `- Rendering: ${s.renderingStyle}` : null,
    s.basePalette ? `- Palette (base, always): ${s.basePalette}` : null,
    s.textureAndWear ? `- Texture: ${s.textureAndWear}` : null,
    s.avoid ? `- AVOID: ${s.avoid}` : null
  ].filter(Boolean);
  const styleRules = styleLines.length
    ? styleLines.join("\n")
    : "- No style guide defined yet for this world -- default to a painterly digital-illustration register, moody but legible lighting, avoid photorealism.";

  return `You generate an image-generation prompt for a tabletop/game world's MAP BACKDROP -- a single top-down or three-quarter angled terrain/atmosphere overview of the whole known world, not a close-up scene and not any one specific named place. Output ONLY the prompt text, 80-140 words, as flowing natural-language prose (NOT a comma-separated tag list). No markdown, no preamble.

STRUCTURE, IN THIS ORDER:
1. Framing: an overview/cartographic vantage (top-down or high three-quarter angle), showing broad terrain types/regions rather than any single detailed structure.
2. Terrain variety pulled from the world's own lore below -- distinct visual zones a viewer could tell apart at a glance (e.g. a district, a wilderness belt, a ruin field), loosely echoing this world's faction territories without depicting any named character.
3. Style + lighting sentence, pulled from the style rules below.
4. A closing sentence explicitly requesting OPEN, UNCLUTTERED negative space across large portions of the image -- calm sky, water, plains, or haze -- because location markers and text labels will be overlaid on top of this image afterward, and dense detail everywhere would make those labels unreadable. Avoid embedding any text, legend, compass rose, or labels directly in the image itself.

STYLE RULES (stay inside these):
${styleRules}

FACTION TERRITORY FLAVOR (let broad zones hint at these without drawing characters or insignia text):
${factionSummaryText || "(no factions on record yet -- use general terrain variety instead)"}

WORLD LORE -- GROUND TRUTH (stay consistent with this):
${loreContext || "(no lore saved yet for this world)"}

SETTING:
${settingContext}

Write the prompt now.`;
}

module.exports = { buildMapBackdropSystemPrompt };
