// prompts/mapBackdropPrompt.js
//
// The map backdrop is a WORLD-level asset, not tied to any single
// Location entry -- one image per world, generated once (auto-triggered
// on first Map page load, see routes/map.js) and cached in the
// map-backdrops storage bucket. Deliberately a separate prompt builder
// from artPromptPrompt.js's ENVIRONMENT branch (which frames one
// specific named place) rather than reusing it with a fake synthetic
// "location" object -- the composition requirements are genuinely
// different: this needs to read as a top-down/angled OVERVIEW, not one
// detailed named place.
//
// Full terrain coverage (not deliberate open negative space) is
// requested below -- an earlier version of this prompt asked for large
// empty sky/water/haze areas, back when location names were rendered
// directly on top of the backdrop as SVG text and needed blank space to
// stay legible. That's no longer how this works: locations render as
// pan/zoomable Leaflet pins with popups (see archive/map.html), nothing
// draws text on the image itself, so there's no legibility reason left
// to leave big blank areas -- and leaving them was actively working
// against pin placement, since clustered pins land wherever the layout
// math puts them regardless of what's actually drawn there, so a
// backdrop dominated by empty sky just meant more pins visibly sitting
// over nothing.

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
4. A closing sentence establishing that this is a full, richly-detailed terrain overview -- ground, structures, and terrain features should fill most of the frame, not just a few small areas surrounded by large empty sky/water/haze. (This backdrop is no longer overlaid with on-canvas text labels for location names -- pin/location info now shows in a popup when clicked, so there's no legibility reason to leave big blank areas; full terrain coverage is preferred, since more of the canvas actually being "somewhere" is what makes clustered location pins land somewhere plausible.)

TEXT IN THE IMAGE: environmental/diegetic signage is welcome and encouraged where it fits naturally -- stenciled sector names, hazard placards, building signage, faded warning labels, anything that reads as part of the physical world rather than an added interface. This adds real atmosphere. What to avoid is UI/map-interface elements that would look like they were added on top of the scene rather than painted into it: no legend, no compass rose, no title card, no scale bar. The distinction is "a sign that exists in this world" (good) vs. "a map annotation explaining this world" (avoid).

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
