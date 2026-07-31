const express = require("express");
const { callClaude, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildMapBackdropSystemPrompt } = require("../prompts/mapBackdropPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const {
  saveMapBackdrop,
  mapBackdropExists,
  getMapBackdropUrl,
  saveMapTile,
  mapTileExists,
  getMapTileUrl
} = require("../lib/fileWriter");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getStyleGuide } = require("../lib/worldFlavor");
const { readFactionManifest, readFactionEntry } = require("../lib/roster");
const { listEntries } = require("../lib/entriesRepo");

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

    const imageBuffer = await generateImage(artPrompt.trim());
    const url = await saveMapBackdrop(worldId, imageBuffer);

    res.json({ url, generated: true });
  } catch (err) {
    console.error("Map backdrop generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Returns the distinct biomeTag values actually represented among this
// world's current locations (see prompts/locationContentPrompt.js's
// BIOME_TAGS), each with a stable display order (first-seen). Locations
// generated before this feature landed won't have a biomeTag at all --
// silently skipped here rather than backfilled, same graceful-degradation
// approach as everywhere else biomeTag is optional.
async function getRepresentedBiomeTags(worldId) {
  const locations = await listEntries(worldId, "locations");
  const seen = [];
  locations.forEach((loc) => {
    const tag = loc.raw && loc.raw.biomeTag;
    if (tag && !seen.includes(tag)) seen.push(tag);
  });
  return seen;
}

// GET status -- which biomes does this world's current location roster
// need tile art for, and which of those already have it? The Map page
// calls this on load; archive/js/mapLayout.js's computeBiomeAnchors()
// positions each represented biome around the canvas independently of
// node/faction placement (see this session's map-fix scoping notes --
// tiles are an atmospheric backdrop layer, not a literal claim about
// where any specific node sits).
router.get("/map/tiles", async (req, res) => {
  try {
    const biomeTags = await getRepresentedBiomeTags(req.worldId);
    const tiles = await Promise.all(
      biomeTags.map(async (biomeTag) => {
        const exists = await mapTileExists(req.worldId, biomeTag);
        return { biomeTag, exists, url: exists ? getMapTileUrl(req.worldId, biomeTag) : null };
      })
    );
    res.json({ tiles });
  } catch (err) {
    console.error("Checking map tiles failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST generate -- fills in art for whichever represented biomes don't
// have a tile yet. Sequential with per-tile try/catch (mirrors
// routes/worldArt.js's faction-banner batching): one bad prompt/API
// hiccup for one biome shouldn't cost every other tile. Deliberately NOT
// gated by enforceGenerationCap -- same bounded, auto-triggered,
// one-time-per-biome reasoning as the single-backdrop generation below.
router.post("/map/generate-tiles", async (req, res) => {
  try {
    const worldId = req.worldId;
    const biomeTags = await getRepresentedBiomeTags(worldId);
    if (biomeTags.length === 0) {
      return res.json({ results: [] });
    }

    const styleGuide = await getStyleGuide(worldId);
    const results = [];

    for (const biomeTag of biomeTags) {
      try {
        const alreadyExists = await mapTileExists(worldId, biomeTag);
        if (alreadyExists) {
          results.push({ biomeTag, url: getMapTileUrl(worldId, biomeTag), generated: false });
          continue;
        }
        const artSystemPrompt = buildArtPromptSystemPrompt({
          category: "map-tile",
          subjectJson: { biome: biomeTag },
          styleGuide,
          factionAccent: null
        });
        const artPrompt = await callClaude({
          systemPrompt: artSystemPrompt,
          userMessage: "Write the prompt now.",
          maxTokens: 400,
          model: HAIKU_MODEL
        });
        const imageBuffer = await generateImage(artPrompt.trim());
        const url = await saveMapTile(worldId, biomeTag, imageBuffer);
        results.push({ biomeTag, url, generated: true });
      } catch (tileErr) {
        console.error(`Map tile generation failed for '${biomeTag}':`, tileErr.message);
        results.push({ biomeTag, url: null, error: tileErr.message });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("Map tile batch generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
