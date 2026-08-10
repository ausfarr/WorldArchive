const express = require("express");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
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
const { getLocationsMapLocked, setLocationsMapLocked } = require("../lib/worldConfigRepo");
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
async function detectFactionAnchors(worldId, imageBuffer, mimeType) {
  const factions = await getFactionsForAnchorDetection(worldId);
  if (factions.length === 0) return {};

  const systemPrompt = buildMapAnchorSystemPrompt({ factions });
  const raw = await callClaude({
    systemPrompt,
    userMessage: [
      { type: "image", source: { type: "base64", media_type: mimeType, data: imageBuffer.toString("base64") } },
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
// a bounded, at-most-once setup cost per world (mapBackdropExists below
// still short-circuits a repeat call), not the open-ended per-action
// risk the cap exists to bound. Flagged for Austin to override if he'd
// rather it count.
//
// IS gated by requireAiEnabled, same as every other AI-spend route --
// this used to be the one AI call in the app that could fire with no
// button press at all (archive/map.html auto-POSTed here on page load
// whenever no backdrop existed yet), which meant an account with AI
// Features turned off would still burn a real image generation just by
// opening the Map tab. Fixed on the frontend (Generate Backdrop is now
// a real button, gated client-side by the ai-action class) AND here
// server-side, so there's no path left -- old cached page, direct
// fetch(), whatever -- that bypasses the toggle.
router.post("/map/generate-backdrop", requireAiEnabled, async (req, res) => {
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

    const { buffer: imageBuffer, mimeType } = await generateImage(artPrompt.trim(), { imageSize: "2K" });
    const url = await saveMapBackdrop(worldId, imageBuffer);

    // Non-fatal: the backdrop itself is already saved and usable even if
    // this fails. Errors are logged and swallowed rather than thrown, so
    // a vision-call hiccup doesn't turn a successful image generation
    // into a failed response.
    let anchors = {};
    try {
      anchors = await detectFactionAnchors(worldId, imageBuffer, mimeType);
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

// POST upload-backdrop — lets a user swap in their own map image instead
// of the AI-generated one. Deliberately does NOT call
// detectFactionAnchors (Austin's explicit call, discussed and locked
// this session): vision anchor detection was only ever built to find
// faction territory in an image this app itself generated with that in
// mind. A generic uploaded map has no reason to contain anything
// recognizable as faction-coded regions, so a vision call here would
// likely just produce wrong-looking anchors -- worse than none. Instead,
// existing anchors are explicitly cleared (not left stale from a prior
// AI backdrop), which lets archive/js/mapLayout.js fall back to its own
// existing deterministic per-faction default clustering (same fallback
// already used for any faction anchor detection never found) -- combined
// with every location pin now being draggable (see archive/map.html),
// the person who uploaded their own map just drags things to where they
// actually belong, which is the whole point of uploading a custom map in
// the first place.
//
// Unlike /map/generate-backdrop, this is allowed to REPLACE an existing
// backdrop (it's an explicit user action, not the once-per-world
// auto-trigger the generate route guards against).
router.post("/map/upload-backdrop", async (req, res) => {
  try {
    const worldId = req.worldId;
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required." });
    }

    const match = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = match ? match[1] : "image/png";
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    const url = await saveMapBackdrop(worldId, imageBuffer, mimeType);
    await saveMapAnchors(worldId, {});

    res.json({ url, generated: true, anchors: {} });
  } catch (err) {
    console.error("Map backdrop upload failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET/POST map-lock — persisted toggle for the Map page's lock control
// (see migrations/014_map_lock.sql). A single world-wide flag: when
// true, the frontend renders every location pin non-draggable. Not
// gated by anything billing-related -- this is a workflow convenience,
// not a metered action.
router.get("/map/lock", async (req, res) => {
  try {
    const locked = await getLocationsMapLocked(req.worldId);
    res.json({ locked });
  } catch (err) {
    console.error("Checking map lock state failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/map/lock", async (req, res) => {
  try {
    const { locked } = req.body || {};
    const saved = await setLocationsMapLocked(req.worldId, !!locked);
    res.json({ locked: saved });
  } catch (err) {
    console.error("Saving map lock state failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
