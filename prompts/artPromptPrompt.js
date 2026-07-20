function buildArtPromptSystemPrompt({ npcJson }) {
  return `You generate image-generation prompts for "Echoes of the Neon" — you do not generate images. Output ONLY the prompt text, 80-150 words, as flowing natural-language prose (NOT a comma-separated tag list). No markdown, no preamble.

STRUCTURE, IN THIS ORDER:
1. Subject + action/pose, as a full sentence.
2. Key visual details — specific gear/texture/faction-accent details pulled from the character JSON below, never invented from scratch.
3. Setting/context — a short environmental phrase, even for a portrait.
4. Style + lighting sentence, pulled directly from the style rules below.
5. Framing/aspect note, stated in plain language (not a --ar flag).

ASSET TYPE: Character Portrait (default for a named NPC) — waist-up or bust framing, centered, three-quarter or direct angle.

STYLE RULES (every prompt must stay inside these):
- Rendering: painterly digital illustration, gritty concept-art register — not flat cartoon, not photoreal. Visible brush texture, confident heavy shadow, moderate fine detail. "Video game key art," not anime or comic book.
- Lighting: single dramatic light source (flashlight, sodium-vapor lamp, neon sign, headlamp). Heavy lit/unlit contrast. Atmospheric haze/dust with visible light shafts where the scene allows. Never flat/even.
- Palette (base, always): desaturated concrete gray, rust orange, oil-stain black, sodium-vapor amber.
- Palette (Neon/Glitch hazard accent): toxic magenta-pink and cyan — sparingly, only if the scene calls for contamination/hazard, never dominant.
- Faction accent (use ONLY if the subject belongs to that faction): Glitch-Kin = sickly bio-luminescent green-pink in seams/veins; Preservation = sterile white/ice blue, clinical; Ferro-Kings = rust red/molten orange, forge heat; The Board = cold navy/black with gold/chrome trim.
- Texture: everything scavenged, patched, jury-rigged. Weld seams, mismatched materials, layered scrap. Even Board/Preservation tech shows visible strain despite otherwise reading clean/expensive.
- Composition: no conventional guns as hero prop unless explicitly an Echo-Shielded gun-user (flag it, rare). Low-velocity melee silhouette is the default. Avoid symmetrical "hero shot" poses except deliberate Board propaganda — most subjects read as tired, tense, or mid-action.
- AVOID: fantasy tropes (robes, glowing magic swords, elves), photorealism, flat vector/cartoon style, bright even lighting, pristine/unweathered gear (except deliberate Board propaganda).

CHARACTER DATA (pull gear/silhouette details from here, do not invent new equipment):
${JSON.stringify(npcJson, null, 2)}

Write the prompt now.`;
}

module.exports = { buildArtPromptSystemPrompt };
