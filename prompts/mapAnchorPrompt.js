// prompts/mapAnchorPrompt.js
//
// Closes the loop this session kept hitting: every previous map-fix
// attempt placed pins/tiles using abstract layout math with zero
// knowledge of what the generated backdrop actually depicts (a faction
// described as controlling a tower could end up anchored anywhere,
// including nowhere near any tower in the image). This is the first
// approach that actually looks at the image -- a vision call over the
// finished backdrop, asking Claude to find real visual matches for each
// faction's own territory description and report where they are.
//
// Deliberately conservative: a faction gets null, not a forced guess,
// if nothing in the image plausibly matches its territory. A missing
// anchor just falls back to the existing circular-layout default (see
// archive/js/mapLayout.js's computeFactionAnchors override parameter) --
// a wrong anchor would be worse than no anchor, since it would look
// exactly as confidently "placed" as a correct one.

function buildMapAnchorSystemPrompt({ factions }) {
  const factionListText = factions
    .map((f) => `- id: "${f.id}", name: "${f.name}"\n  territory: ${f.territory || "(no territory description on record)"}`)
    .join("\n");

  return `You are analyzing a fictional world's map backdrop image to help place location markers accurately on it. You will be shown the generated backdrop image. Below is a list of this world's factions with their own territory descriptions (each faction's own dossier text, not your invention).

For each faction, look at the actual image and decide: is there a specific visible structure, region, or area in the image that plausibly matches that faction's described territory (e.g. a tall tower/spire for a faction described as controlling a corporate skyscraper; a flooded/waterlogged area for a faction described as controlling sealed vaults with a frost-line; open trade corridors for a faction built around commerce)?

If a genuine visual match exists, report its approximate center point as normalized coordinates: x and y each between 0.0 and 1.0, where (0,0) is the top-left corner of the image and (1,1) is the bottom-right corner.

If nothing in the image plausibly matches a faction's territory, return null for that faction. Do NOT force a guess or pick the "closest available" area just to have an answer -- a missing anchor is far better than a wrong one, since a missing one falls back to a sensible default automatically, while a wrong one looks just as confidently placed as a correct one.

FACTIONS:
${factionListText}

Return ONLY valid JSON in exactly this shape, no markdown, no prose, no code fences:
{
  "<factionId>": { "x": 0.0, "y": 0.0 },
  "<factionId>": null
}

One entry per faction id listed above. Write the JSON now.`;
}

module.exports = { buildMapAnchorSystemPrompt };
