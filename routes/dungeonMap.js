// routes/dungeonMap.js
//
// Dungeon/Battle Maps -- see session_addendum_dungeon_maps_campaign_
// structure_scope.md for the locked scope. Storage shape: everything
// lives under raw_json.dungeonMap on the Location entry itself
// ({ imageUrl, gridSize, markers: [...] }), written via entriesRepo's
// existing patchEntryMeta() -- no new table, no schema migration. Since
// getEntry()/rowToFullEntry() already spreads raw_json onto the returned
// entry object, entry.dungeonMap comes through automatically on the
// normal GET /api/entries/locations/:id call the dossier page already
// makes -- no separate GET route needed here.
//
// One map per Location (Austin's call this session) -- if that ever
// needs to become multiple (floors/areas), this key becomes
// raw_json.dungeonMaps: [...] later without a storage rearchitecture,
// since patchEntryMeta() doesn't care what shape lives inside the key it
// merges.
//
// Cap: /generate IS gated by enforceGenerationCap, unlike the one-time
// world backdrop/mood board/faction banners -- Austin's explicit call
// that this is a repeatable per-location action, not a bounded one-time
// setup cost. /markers and /reset are pure data writes (no AI/image
// call), so neither is gated.

const express = require("express");
const { callClaude, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildDungeonMapPromptSystemPrompt } = require("../prompts/dungeonMapPrompt");
const { getEntry, patchEntryMeta } = require("../lib/entriesRepo");
const { saveDungeonMapImage } = require("../lib/fileWriter");
const { getFactionAccent } = require("../lib/worldFlavor");
const { getStyleGuide } = require("../lib/worldConfigRepo");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");

const router = express.Router();

// Fixed for v1 -- not exposed as a user setting yet. 20x20 keeps grid
// cells a reasonable size against a 1:1 image without the frontend
// needing any per-map configuration UI.
const DEFAULT_GRID_SIZE = 20;

async function loadLocationOrRespondError(req, res) {
  const { id } = req.params;
  const entry = await getEntry(req.worldId, "locations", id);
  if (!entry) {
    res.status(404).json({ error: "Location not found." });
    return null;
  }
  return entry;
}

// POST generate (also doubles as "Regenerate Map" -- there's no separate
// force flag because, unlike the world backdrop, this route is always
// meant to produce a fresh image when called, not skip if one exists).
// Regenerating the art clears markers -- a new map image means the old
// token layout no longer corresponds to anything drawn on it. "Reset
// Encounter" (below) is the button for "same map, clear tokens"; this is
// "new map, clear tokens" as an unavoidable side effect of a new image.
router.post("/entries/locations/:id/dungeon-map/generate", enforceGenerationCap, async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await loadLocationOrRespondError(req, res);
    if (!entry) return;
    const location = entry.raw || entry;

    const styleGuide = await getStyleGuide(req.worldId);
    const factionAccent = await getFactionAccent(req.worldId, styleGuide, location.faction);
    const systemPrompt = buildDungeonMapPromptSystemPrompt({ location, styleGuide, factionAccent });
    const artPrompt = await callClaude({
      systemPrompt,
      userMessage: "Write the prompt now.",
      maxTokens: 500,
      model: HAIKU_MODEL
    });

    // 1:1 -- see lib/imagegen.js's aspectRatio override comment. A square
    // image is what lets a uniform NxN grid overlay map cleanly onto it.
    const { buffer: imageBuffer } = await generateImage(artPrompt.trim(), { aspectRatio: "1:1" });
    const imageUrl = await saveDungeonMapImage(req.worldId, id, imageBuffer);

    const dungeonMap = { imageUrl, gridSize: DEFAULT_GRID_SIZE, markers: [] };
    await patchEntryMeta(req.worldId, "locations", id, { dungeonMap });

    res.json({ dungeonMap });
  } catch (err) {
    console.error("Dungeon map generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH markers -- full replace of the markers array (the frontend
// always sends its complete current list, not a delta -- matches the
// simplicity of every other archive edit, and avoids needing per-marker
// ids reconciled server-side).
router.patch("/entries/locations/:id/dungeon-map/markers", async (req, res) => {
  try {
    const { id } = req.params;
    const { markers } = req.body || {};
    if (!Array.isArray(markers)) {
      return res.status(400).json({ error: "markers must be an array." });
    }
    const entry = await loadLocationOrRespondError(req, res);
    if (!entry) return;
    const existing = entry.dungeonMap;
    if (!existing || !existing.imageUrl) {
      return res.status(400).json({ error: "This location doesn't have a battle map yet." });
    }

    const dungeonMap = { ...existing, markers };
    await patchEntryMeta(req.worldId, "locations", id, { dungeonMap });
    res.json({ dungeonMap });
  } catch (err) {
    console.error("Saving dungeon map markers failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST reset -- "Reset Encounter": clears markers, keeps the map image
// itself. Distinct from /generate, which produces a brand-new image.
router.post("/entries/locations/:id/dungeon-map/reset", async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await loadLocationOrRespondError(req, res);
    if (!entry) return;
    const existing = entry.dungeonMap;
    if (!existing || !existing.imageUrl) {
      return res.status(400).json({ error: "This location doesn't have a battle map yet." });
    }

    const dungeonMap = { ...existing, markers: [] };
    await patchEntryMeta(req.worldId, "locations", id, { dungeonMap });
    res.json({ dungeonMap });
  } catch (err) {
    console.error("Resetting dungeon map failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
