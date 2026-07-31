const express = require("express");
const { callClaude } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildMapBackdropSystemPrompt } = require("../prompts/mapBackdropPrompt");
const { saveMapBackdrop, mapBackdropExists, getMapBackdropUrl } = require("../lib/fileWriter");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getStyleGuide } = require("../lib/worldFlavor");
const { readFactionManifest, readFactionEntry } = require("../lib/roster");

const router = express.Router();

// Builds a short "Faction Name: territory sentence" block from the live
// archive, for the backdrop prompt's terrain-variety grounding. Reuses
// each faction's own .territory field (see prompts/factionContentPrompt.js's
// schema) rather than inventing new terrain descriptions -- this stays
// consistent with each faction's own dossier.
async function buildFactionSummaryText(worldId) {
  const manifest = await readFactionManifest(worldId);
  if (!manifest.length) return "";
  const lines = [];
  for (const m of manifest) {
    const entry = await readFactionEntry(worldId, m.id);
    const territory = entry && entry.raw && entry.raw.territory
      ? entry.raw.territory.split(".")[0] + "."
      : null;
    lines.push(`- ${m.name}${territory ? `: ${territory}` : ""}`);
  }
  return lines.join("\n");
}

// GET status — does a backdrop already exist for this world? The Map
// page calls this on load and only triggers generation if false, so a
// world that already has one never regenerates on every visit.
//
// This is deliberately the ONLY map art generation left after this
// session's several attempts at per-faction/per-biome tile compositing
// (see multi_tenant_pivot_scope.md's map-fix addenda for the full
// history: biome tags, then faction-territory tiles, then blend-mode
// fixes -- none of it landed well). Real per-location depiction now
// comes from the "vignette" approach in archive/map.html instead, which
// reuses each Location's own already-generated portrait rather than
// generating or compositing anything new. This backdrop stays
// deliberately atmosphere-only, not a claim about any specific
// location/faction's geography.
router.get("/map/backdrop", async (req, res) => {
  try {
    const exists = await mapBackdropExists(req.worldId);
    res.json({ exists, url: exists ? getMapBackdropUrl(req.worldId) : null });
  } catch (err) {
    console.error("Checking map backdrop failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST generate — deliberately NOT gated by enforceGenerationCap. This
// mirrors the reasoning already documented in
// middleware/enforceGenerationCap.js for wizard "generate for me" calls:
// a bounded, one-time, auto-triggered setup cost per world (at most one
// real image call per world, ever, since the Map page only calls this
// when GET /map/backdrop says none exists yet), not the open-ended
// per-action risk the cap exists to bound. Flagged for Austin to
// override if he'd rather it count.
router.post("/map/generate-backdrop", async (req, res) => {
  try {
    const worldId = req.worldId;

    // Don't regenerate if one already exists -- this endpoint is only
    // ever meant to fire once per world via the auto-trigger on the Map
    // page. (No "Regenerate Backdrop" UI yet; add one later if wanted,
    // pointed at this same endpoint with a force flag.)
    const alreadyExists = await mapBackdropExists(worldId);
    if (alreadyExists) {
      return res.json({ url: getMapBackdropUrl(worldId), generated: false });
    }

    const [settingContext, loreContext, styleGuide, factionSummaryText] = await Promise.all([
      getSettingContext(worldId),
      getLoreContext(worldId, {}),
      getStyleGuide(worldId),
      buildFactionSummaryText(worldId)
    ]);

    const systemPrompt = buildMapBackdropSystemPrompt({ settingContext, loreContext, styleGuide, factionSummaryText });
    const artPrompt = await callClaude({
      systemPrompt,
      userMessage: "Write the prompt now.",
      maxTokens: 500
    });

    const imageBuffer = await generateImage(artPrompt.trim(), { imageSize: "2K" });
    const url = await saveMapBackdrop(worldId, imageBuffer);

    res.json({ url, generated: true });
  } catch (err) {
    console.error("Map backdrop generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
