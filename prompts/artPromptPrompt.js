// prompts/artPromptPrompt.js
//
// Phase 4 genericization. Previously 100% hardcoded to "Echoes of the
// Neon"'s painterly/gritty rendering style, rust/neon palette, and a
// literal 4-faction accent block (Glitch-Kin/Preservation/Ferro-Kings/
// The Board) -- completely disconnected from a world's own
// world_config.style_guide_json (Wizard Step 6), which existed for
// exactly this purpose but nothing consumed it until now. Grounds every
// style field the same way prompts/*ContentPrompt.js ground content in a
// world's lore via lib/worldFlavor.js.
//
// Asset framing branches in three ways: CHARACTER (npcs, enemies,
// classes, survivors -- anything depicting a person/creature), OBJECT
// (items -- weapons/armor/consumables, not a person), and ENVIRONMENT
// (locations -- a place, no figure-focused composition rules). All
// three stay landscape/wide framing to match the site's fixed aspect
// ratio (see lib/imagegen.js's IMAGEGEN_ASPECT_RATIO, default 16:9) --
// an object shot fills that wide frame with environmental context
// instead of a character, and an environment shot IS the wide frame.

// PROMPT CACHING: unlike prompts/*ContentPrompt.js, the static block
// here isn't identical across EVERY call -- it depends on `category`
// (character vs object vs environment framing). But it IS identical
// across every call for the SAME category, which still caches well in
// practice: a real prep session tends to generate several NPCs, or
// several items, back-to-back, not one of each. styleRules/factionLine
// (this world's own style guide/faction accents) and subjectJson (this
// specific generated entry) are genuinely per-call, so those stay
// dynamic regardless of category.

const { buildCacheableSystemPrompt } = require("../lib/claude");

const OBJECT_CATEGORIES = new Set(["items"]);
const ENVIRONMENT_CATEGORIES = new Set(["locations"]);
// Priority 6 (Generative Art for the World): a fourth framing, distinct
// from ENVIRONMENT -- ENVIRONMENT depicts a specific named place with
// faction control visible through architecture/damage; MOOD is
// deliberately unanchored, no named location, character, or object, just
// this world's palette/lighting/texture rendered as atmosphere. Used for
// the World Mood Board (one per world) and Faction Mood Banners (one per
// faction) -- see routes/worldArt.js.
const MOOD_CATEGORIES = new Set(["world-mood", "faction-mood"]);
// Map tiles (routes/map.js): one per faction actually represented on
// the map, composited together into one backdrop with soft-blended seams
// (see archive/map.html). Unlike every other category here, this ONE
// needs an illustrated top-down cartographic vantage rather than an
// eye-level photographic one -- two independently-generated eye-level
// shots can never blend into each other (no shared horizon/camera
// position), but an illustrated map style already reads as abstracted
// and tiles far more forgivingly. Grounded directly in each faction's
// own territory description (not a separate biome-tag guess) so the art
// under a faction's cluster actually matches what that faction's own
// lore says about its territory -- see this session's addendum for the
// pivot away from the original biome-tag version of this feature.
const MAP_TILE_CATEGORIES = new Set(["map-tile"]);

function buildStyleRulesBlock(styleGuide) {
  const s = styleGuide || {};
  const lines = [
    s.renderingStyle ? `- Rendering: ${s.renderingStyle}` : null,
    s.lighting ? `- Lighting: ${s.lighting}` : null,
    s.basePalette ? `- Palette (base, always): ${s.basePalette}` : null,
    (s.accentColor && s.accentColor.toLowerCase() !== "none")
      ? `- Signature accent (use sparingly, only when the scene specifically calls for it): ${s.accentColor}`
      : null,
    s.textureAndWear ? `- Texture: ${s.textureAndWear}` : null,
    s.compositionDefaults ? `- Composition: ${s.compositionDefaults}` : null,
    s.avoid ? `- AVOID: ${s.avoid}` : null
  ].filter(Boolean);
  return lines.length
    ? lines.join("\n")
    : "- No style guide defined yet for this world -- default to a painterly digital-illustration register with confident, moody directional lighting; avoid photorealism, flat vector/cartoon style, and generic fantasy tropes unless the subject data below clearly calls for them.";
}

function buildFactionAccentLine(factionAccent) {
  if (!factionAccent) return null;
  const bits = [factionAccent.accentColor, factionAccent.accentNotes].filter(Boolean);
  if (bits.length === 0) return null;
  return `- Faction accent for ${factionAccent.name || factionAccent.id} (use only because this subject belongs to that faction): ${bits.join(" -- ")}`;
}

// STATIC per category (see header comment) — same text every time for a
// given category, so cacheable, just not universally across categories.
function buildStaticInstructions(category) {
  const isMapTile = MAP_TILE_CATEGORIES.has(category);
  const isMood = MOOD_CATEGORIES.has(category);
  const isObject = OBJECT_CATEGORIES.has(category);
  const isEnvironment = ENVIRONMENT_CATEGORIES.has(category);

  // Map tiles get their own full instruction block rather than slotting
  // into the shared STRUCTURE template below -- they don't have a
  // subject/action/pose the way every other category does, and the
  // soft-edge requirement is load-bearing enough to state up front
  // rather than as one more bullet among several.
  if (isMapTile) {
    return `You generate image-generation prompts for a tabletop/game world's map art -- you do not generate images. Output ONLY the prompt text, 60-120 words, as flowing natural-language prose (NOT a comma-separated tag list). No markdown, no preamble.

ASSET TYPE: Illustrated Cartographic Tile -- a hand-painted/illustrated top-down or three-quarter map-style rendering of the physical terrain/architecture/environment implied by ONE faction's territory (see TERRITORY below), in the style of a painted tabletop campaign map, NOT a photographic establishing shot. This is environment art, NOT a portrait of the faction -- no figures, no faction insignia/banners/logos, no readable text or symbols anywhere. This tile will be blended edge-to-edge with other independently-generated tiles into one composite map, so:
- The vantage MUST read as an illustrated map (painterly, stylized, or schematic), never an eye-level photo -- two photos can't share a horizon, but two map-style illustrations already read as abstracted and blend forgivingly.
- Composition must be loose and edge-agnostic: no border, frame, vignette, or any element that implies a hard edge to the piece. Terrain/texture should feel like it could continue past every edge of the frame.
- Depict the KIND of place the territory description implies (a corporate tower's upper floors, a flooded storage vault, an open-air trade corridor -- whatever it actually says) rather than defaulting to generic ruin/wasteland imagery if the territory isn't literally destroyed. If the territory is intact/functioning, the art should look intact/functioning.

Write the prompt now, in this order: (1) the terrain/environment in one sentence, grounded specifically in the territory description below, (2) key texture/color details pulled from the style rules below, (3) a closing phrase confirming top-down/illustrated map vantage with no border or frame.`;
  }

  const assetTypeBlock = isMood
    ? `ASSET TYPE: Atmospheric Mood Piece -- NOT a specific character, object, or named location. Depict this world's overall sensory register as an abstract/atmospheric scene (light quality, weather, texture, wreckage or growth, whatever the style rules below imply) that captures the palette/lighting/texture rules without depicting any identifiable person or a specific, nameable place. If this is a faction's piece specifically (see the faction accent notes below, if present), let its accent color and notes color the mood without inserting literal insignia, banners, or readable text/symbols.`
    : isEnvironment
    ? `ASSET TYPE: Environment/Establishing Shot -- the subject is a PLACE, not a person or object. No figure should be the focal point (a small, distant, unnamed figure for scale is fine, but never a posed subject). Compose it as a wide landscape establishing shot: foreground, midground, and a sense of depth appropriate to the region/biome, with faction control (if any) visible through architecture, signage, upkeep, or damage rather than through a character. State the wide framing explicitly in the framing/aspect note.`
      : isObject
        ? `ASSET TYPE: Object/Item Render -- the subject is a single object (weapon, tool, wearable, consumable, relic, etc.), NOT a person. Compose it as the clear focal point of a WIDE LANDSCAPE frame: the object placed within a shallow, believable environment or surface consistent with this world (a workbench, bare ground, propped against a wall or ruin, held in a gloved hand -- whatever fits) that fills the negative space on either side, rather than a tall vertical product-shot isolated on a plain background. State the wide framing explicitly in the framing/aspect note.`
        : `ASSET TYPE: Character Portrait -- waist-up or bust framing, composed for a WIDE LANDSCAPE frame, not a tall vertical one. Center the subject with visible environment/negative space on both sides rather than a tight vertical crop -- think cinematic character shot, not a phone-screen portrait. State the wide framing explicitly in the framing/aspect note (e.g. "a wide horizontal composition, subject centered with the environment visible on either side").`;

  const ageBlock = (!isObject && !isEnvironment && !isMood)
    ? `\n\nAGE: if the subject data includes an age, let it visibly inform the depiction -- build, posture, skin/hair/hide texture, wear -- the same way gear and faction accents are pulled from the data rather than invented. Don't state the number in the prompt itself; translate it into how the subject actually looks.`
    : "";

  return `You generate image-generation prompts for a tabletop/game world -- you do not generate images. Output ONLY the prompt text, 80-150 words, as flowing natural-language prose (NOT a comma-separated tag list). No markdown, no preamble.

STRUCTURE, IN THIS ORDER:
1. Subject + action/pose (or, for an object, its resting state/context; or, for an environment, the vantage point/composition), as a full sentence.
2. Key visual details -- specific gear/texture/faction-accent details pulled from the subject data provided below, never invented from scratch.
3. Setting/context -- a short environmental phrase.
4. Style + lighting sentence, pulled directly from the style rules provided below.
5. Framing/aspect note, stated in plain language (not a --ar flag) -- MUST describe a wide landscape composition, never a tall/vertical one, regardless of asset type.

${assetTypeBlock}${ageBlock}`;
}

// category: one of "npcs" | "enemies" | "items" | "classes" | "survivors"
// subjectJson: the generated NPC/enemy/item/class/survivor JSON
// styleGuide: world_config.style_guide_json (may be null/undefined)
// factionAccent: result of lib/worldFlavor.js's getFactionAccent(), or null
function buildArtPromptSystemPrompt({ category, subjectJson, styleGuide, factionAccent }) {
  const styleRules = buildStyleRulesBlock(styleGuide);
  const factionLine = buildFactionAccentLine(factionAccent);

  // DYNAMIC — this world's style guide/faction data plus this specific
  // subject. Uncached.
  const dynamicContext = `STYLE RULES (every prompt must stay inside these -- grounded in this world's own style guide, not a generic template):
${styleRules}
${factionLine ? `\n${factionLine}\n` : ""}
SUBJECT DATA (pull details from here, do not invent new equipment/traits not implied by it):
${JSON.stringify(subjectJson, null, 2)}

Write the prompt now.`;

  return buildCacheableSystemPrompt(buildStaticInstructions(category), dynamicContext);
}

module.exports = { buildArtPromptSystemPrompt };
