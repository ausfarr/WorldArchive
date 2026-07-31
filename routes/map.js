const express = require("express");
const { callClaude } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildMapBackdropSystemPrompt } = require("../prompts/mapBackdropPrompt");
const { buildMapAnchorSystemPrompt } = require("../prompts/mapAnchorPrompt");
const {
  saveMapBackdrop,
  mapBackdropExists,
  getMapBackdropUrl,
  saveMapAnchors,
  getMapAnchors
} = require("../lib/fileWriter");
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

// Full (not truncated-to-one-sentence) faction id/name/territory list,
// for the vision anchor call below -- that prompt needs enough detail
// to actually judge a visual match, not just a one-line flavor summary.
async function getFactionsForAnchorDetection(worldId) {
  const manifest = await readFactionManifest(worldId);
  const factions = [];
  for (const m of manifest) {
    const entry = await readFactionEntry(worldId, m.id);
    factions.push({
      id: m.id,
      name: m.name,
      territory: (entry && entry.raw && entry.raw.territory) || null
    });
  }
  return factions;
}

// Vision call over the just-generated backdrop, asking Claude to find
// real visual matches for each faction's own territory description (see
// prompts/mapAnchorPrompt.js for the full reasoning -- this is what
// closes the gap every earlier attempt this session left open: pin/tile
// placement had zero knowledge of what the generated image actually
// depicts). Non-fatal by design -- if this fails or returns nothing
// usable, the map still works fine with the existing circular-layout
// default (see archive/js/mapLayout.js's override parameter), just
// without the smarter placement. A wrong anchor would be worse than no
// anchor, so results are validated defensively: malformed entries,
// out-of-range coordinates, and factions not in the original list are
// all dropped rather than trusted as-is.
async function detectFactionAnchors(worldId, imageBuffer) {
  const factions = await getFactionsForAnchorDetection(worldId);
  if (factions.length === 0) return {};

  const systemPrompt = buildMapAnchorSystemPrompt({ factions });
  const raw = await callClaude({
    systemPrompt,
    userMessage: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: imageBuffer.toString("base64") } },
      { type: "text", text: "Analyze the image and return the JSON now." }
    ],
    maxTokens: 800
  });

  let parsed;
  try {
    const cleaned = raw.replace(/^```json\s*|^```\s*|```\s*$/gm, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error("detectFactionAnchors: response was not valid JSON, skipping:", parseErr.message);
    return {};
  }

  const validFactionIds = new Set(factions.map((f) => f.id));
  const anchors = {};
  for (const [factionId, coords] of Object.entries(parsed || {})) {
    if (!validFactionIds.has(factionId)) continue; // hallucinated/unknown id -- drop it
    if (!coords || typeof coords !== "object") continue; // explicit null (no match) or malformed -- skip
    const { x, y } = coords;
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue; // out of the requested normalized range -- don't trust it
    anchors[factionId] = { x, y };
  }
  return anchors;
}

// GET status — does a backdrop already exist for this world? The Map
// page calls this on load and only triggers generation if false, so a
// world that already has one never regenerates on every visit. Also
// returns any vision-detected faction anchors (see detectFactionAnchors
// above) alongside it, so the frontend can use them for smarter pin
// placement without a second round trip.
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
// location/faction's geography -- the vision anchors are what connect
// the two without needing to blend anything.
router.get("/map/backdrop", async (req, res) => {
  try {
    const exists = await mapBackdropExists(req.worldId);
    const anchors = exists ? await getMapAnchors(req.worldId) : null;
    res.json({ exists, url: exists ? getMapBackdropUrl(req.worldId) : null, anchors: anchors || {} });
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
      const anchors = await getMapAnchors(worldId);
      return res.json({ url: getMapBackdropUrl(worldId), generated: false, anchors: anchors || {} });
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

    // Non-fatal: the backdrop itself is already saved and usable even if
    // this fails. Errors are logged and swallowed rather than thrown, so
    // a vision-call hiccup doesn't turn a successful image generation
    // into a failed response.
    let anchors = {};
    try {
      anchors = await detectFactionAnchors(worldId, imageBuffer);
      await saveMapAnchors(worldId, anchors);
    } catch (anchorErr) {
      console.error("Faction anchor detection failed, continuing without it:", anchorErr.message);
    }

    res.json({ url, generated: true, anchors });
  } catch (err) {
    console.error("Map backdrop generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
