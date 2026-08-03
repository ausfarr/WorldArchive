// routes/dungeonMap.js
//
// Dungeon/Battle Maps -- see session_addendum_dungeon_maps_campaign_
// structure_scope.md for the original scope, and the later session
// addendum for the redesign: markers/tokens were dropped entirely. A GM
// manages tokens in whatever tool they actually run the table with; this
// app's job is to hand them a clean, gridded map image they can save and
// use anywhere -- so the grid is now baked into the PNG itself server-
// side (lib/dungeonMapCompositor.js), and the stored image is one flat
// file, same as every other image in the app (right-click "Save image
// as" just works, no special UI needed).
//
// Storage shape: raw_json.dungeonMap on the Location entry itself
// ({ imageUrl, gridSize }), written via entriesRepo's existing
// patchEntryMeta() -- no new table, no schema migration. Since
// getEntry()/rowToFullEntry() already spreads raw_json onto the returned
// entry object, entry.dungeonMap comes through automatically on the
// normal GET /api/entries/locations/:id call the dossier page already
// makes -- no separate GET route needed here.
//
// One map per Location -- if that ever needs to become multiple (floors/
// areas), this key becomes raw_json.dungeonMaps: [...] later without a
// storage rearchitecture, since patchEntryMeta() doesn't care what shape
// lives inside the key it merges.
//
// Cap: gated by enforceGenerationCap, same as every other repeatable
// per-action AI/image generation call in the app.

const express = require("express");
const { callClaude, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { compositeGridOntoImage } = require("../lib/dungeonMapCompositor");
const { buildDungeonMapPromptSystemPrompt } = require("../prompts/dungeonMapPrompt");
const { getEntry, patchEntryMeta } = require("../lib/entriesRepo");
const { saveDungeonMapImage } = require("../lib/fileWriter");
const { getFactionAccent } = require("../lib/worldFlavor");
const { getStyleGuide } = require("../lib/worldConfigRepo");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");

const router = express.Router();

// Fixed for v1 -- not exposed as a user setting yet. 20x20 keeps grid
// cells a reasonable size against the compositor's 1024x1024 canvas.
const DEFAULT_GRID_SIZE = 20;

// POST generate -- also doubles as "Regenerate Map." There's no separate
// force flag because, unlike the world backdrop, this route is always
// meant to produce a fresh image when called, not skip if one exists.
router.post("/entries/locations/:id/dungeon-map/generate", enforceGenerationCap, async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await getEntry(req.worldId, "locations", id);
    if (!entry) return res.status(404).json({ error: "Location not found." });
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
    // image is what lets a uniform NxN grid map cleanly onto it.
    const { buffer: rawImageBuffer, mimeType } = await generateImage(artPrompt.trim(), { aspectRatio: "1:1" });
    const compositedBuffer = await compositeGridOntoImage(rawImageBuffer, mimeType, DEFAULT_GRID_SIZE);
    const imageUrl = await saveDungeonMapImage(req.worldId, id, compositedBuffer);

    const dungeonMap = { imageUrl, gridSize: DEFAULT_GRID_SIZE, generatedAt: Date.now() };
    await patchEntryMeta(req.worldId, "locations", id, { dungeonMap });

    res.json({ dungeonMap });
  } catch (err) {
    console.error("Dungeon map generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
