// prompts/dungeonMapPrompt.js
//
// Dungeon/Battle Map art prompt -- see session_addendum_dungeon_maps_
// campaign_structure_scope.md for the locked scope. Distinct from
// prompts/mapBackdropPrompt.js (a world-level atmosphere overview) and
// from artPromptPrompt.js's ENVIRONMENT framing (a landscape/establishing
// shot of a place) -- this needs a literal top-down/bird's-eye ROOM
// LAYOUT for one specific already-generated Location, since that's what
// gets played on at the table.
//
// This is the one place in the whole art pipeline where the image
// model's natural tendency actively HELPS instead of needing to be
// fought: the literal top-down floorplan look that had to be actively
// suppressed for the world map backdrop (see the map-fix addendum's
// Attempt 1, where an early backdrop kept coming back looking like a
// dungeon map instead of a terrain overview) is exactly what's being
// asked for here.
//
// GRID: drawn in code (archive/js/render.js's SVG overlay), never baked
// into the AI image -- same "don't draw the thing we're adding
// ourselves" principle already used for the world map's pins and the
// map-tile edges. The prompt below explicitly asks for NO grid lines.
// MARKERS: also drawn in code, for the same reason -- the prompt asks
// for an empty room/layout with no tokens, characters, or creatures
// occupying it, since the DM places those live at the table.

// Mirrors prompts/artPromptPrompt.js's buildFactionAccentLine() -- kept
// as a local copy rather than imported since that one is intentionally
// worded around a "subject" (a character/object), while this space is a
// place, not a bearer of faction identity in the same way.
function buildFactionAccentLine(factionAccent) {
  if (!factionAccent) return null;
  const bits = [factionAccent.accentColor, factionAccent.accentNotes].filter(Boolean);
  if (!bits.length) return null;
  return `- Faction accent for ${factionAccent.name || factionAccent.id} (use where it fits the space, don't force it): ${bits.join(" -- ")}`;
}

function buildDungeonMapPromptSystemPrompt({ location, styleGuide, factionAccent }) {
  const s = styleGuide || {};
  const styleLines = [
    s.renderingStyle ? `- Rendering: ${s.renderingStyle}` : null,
    s.lighting ? `- Lighting: ${s.lighting}` : null,
    s.basePalette ? `- Palette (base, always): ${s.basePalette}` : null,
    s.textureAndWear ? `- Texture: ${s.textureAndWear}` : null,
    s.avoid ? `- AVOID: ${s.avoid}` : null,
    buildFactionAccentLine(factionAccent)
  ].filter(Boolean);
  const styleRules = styleLines.length
    ? styleLines.join("\n")
    : "- No style guide defined yet for this world -- default to a painterly digital-illustration register, moody but legible lighting, avoid photorealism.";

  const locationLines = [
    location.name ? `Name: ${location.name}` : null,
    location.regionBiome ? `Region/biome: ${location.regionBiome}` : null,
    location.notableFeatures ? `Notable features: ${location.notableFeatures}` : null,
    location.descriptorLine ? `Mood: ${location.descriptorLine}` : null,
    (location.dangerTags || []).length ? `Tags: ${location.dangerTags.join(", ")}` : null
  ].filter(Boolean).join("\n");

  return `You generate an image-generation prompt for a tabletop RPG BATTLE MAP -- a strict top-down/bird's-eye view of the interior (or a bounded outdoor clearing/courtyard) of ONE specific location, laid out the way a player would see it on the table during a combat encounter. Output ONLY the prompt text, 60-100 words, as flowing natural-language prose (NOT a comma-separated tag list). No markdown, no preamble.

STRUCTURE, IN THIS ORDER:
1. Framing: a strict top-down/orthographic bird's-eye view, as if looking straight down at a physical tabletop map -- not an angled or three-quarter perspective, not an establishing/landscape shot.
2. The physical layout: walls, room boundaries, furniture, terrain features, cover, hazards -- grounded in this location's own details below. Bound the scene clearly (a room's walls, a clearing's tree line, a ruin's collapsed edges) so it reads as a defined playable space, not an open landscape.
3. Style + lighting sentence, pulled from the style rules below.

WHAT TO EXCLUDE -- these are added separately in code and must NOT appear in the generated image:
- NO grid lines, NO squares/hexes, NO numbered coordinates
- NO characters, creatures, tokens, or figures of any kind occupying the space -- the room/area should read as currently empty, ready for tokens to be placed on top of it
- NO UI elements: no legend, no compass rose, no title text, no scale bar, no HUD overlays

LOCATION -- GROUND TRUTH (stay consistent with this; this is the specific place being mapped):
${locationLines}

STYLE RULES (stay inside these):
${styleRules}

Write the prompt now.`;
}

module.exports = { buildDungeonMapPromptSystemPrompt };
