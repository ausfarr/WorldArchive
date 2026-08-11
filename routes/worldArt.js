// routes/worldArt.js
//
// Priority 6 (Generative Art for the World) -- see
// session_addendum_export_and_generative_art_scope.md for the full scope
// decision. Two asset types, both generate-once (no regenerate button
// yet -- that's the older, still-unsolved "art regeneration" gap in
// world_forge_scope.md Section 8; explicitly not being built here):
//
//   A. World Mood Board -- one atmospheric image per world, no DB column
//      (deterministic Storage URL + existence check, same pattern as the
//      map backdrop).
//   B. Faction Mood Banners -- one per already-saved faction, written
//      onto each faction's own entries row (bannerImageUrl) the same way
//      accentColor already is, so the live dossier page can read it with
//      no separate lookup.
//
// Originally both auto-fired right after Step 6 (Style Guide) was saved,
// unconditionally, for every world. As of the v0.9 Manual Wizard Path
// piece (see session_addendum_manual_wizard_path_shipped.md), Step 6 now
// offers a real choice -- "Generate World Art" or "Skip for now" -- so a
// world going fully manual makes zero Claude/Gemini calls during setup.
// Skipping just means these never get called from the wizard; a world in
// that state can still get art later via the new generate/upload routes
// below, same "on-demand, decoupled from creation" pattern entry portraits
// already use (routes/generateEntryImage.js).
//
// Deliberately NOT gated by enforceGenerationCap, same reasoning as
// routes/map.js's backdrop generation: each of these is a bounded,
// generate-once action per world/faction (the exists-check below skips
// work if one's already there), not the open-ended per-action risk the
// cap exists to bound -- true whether it fires from the wizard or later
// from World Info / a faction dossier page.
//
// The three generate routes below ARE gated by requireAiEnabled, same as
// every other AI-spend route (see routes/map.js's backdrop route for the
// identical reasoning) -- an account with AI Features turned off must
// not be able to burn a real Claude+Gemini call just by hitting World
// Info or a faction dossier's Generate button.
//
// Upload routes are NOT capped either, matching /entries/:category/:id/
// upload-image -- a user's own file, no AI spend, nothing to protect
// against.

const express = require("express");
const { callClaude, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const {
  saveWorldMoodBoard,
  worldMoodBoardExists,
  getWorldMoodBoardUrl,
  saveFactionBanner,
  factionBannerExists,
  getFactionBannerUrl
} = require("../lib/fileWriter");
const { getFactions, getStyleGuide } = require("../lib/worldConfigRepo");
const { getSettingContext, getFactionAccent } = require("../lib/worldFlavor");
const { patchEntryMeta } = require("../lib/entriesRepo");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");

const router = express.Router();

// GET status -- does a mood board already exist for this world? The
// wizard's auto-trigger and the World Info page both check this first so
// a world that already has one never regenerates just from being viewed.
router.get("/world-art/mood-board", async (req, res) => {
  try {
    const exists = await worldMoodBoardExists(req.worldId);
    res.json({ exists, url: exists ? getWorldMoodBoardUrl(req.worldId) : null });
  } catch (err) {
    console.error("Checking world mood board failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST generate -- called once, right after Step 6 is saved. Skips work
// if one already exists (no "force" flag yet -- add one alongside a real
// regenerate button later, matching the map backdrop's same current gap).
router.post("/world-art/generate-mood-board", requireAiEnabled, async (req, res) => {
  try {
    const worldId = req.worldId;
    const alreadyExists = await worldMoodBoardExists(worldId);
    if (alreadyExists) {
      return res.json({ url: getWorldMoodBoardUrl(worldId), generated: false });
    }

    const [settingContext, styleGuide] = await Promise.all([
      getSettingContext(worldId),
      getStyleGuide(worldId)
    ]);

    const subjectJson = { worldSetting: settingContext };
    const artSystemPrompt = buildArtPromptSystemPrompt({
      category: "world-mood",
      subjectJson,
      styleGuide,
      factionAccent: null
    });
    const artPrompt = await callClaude({
      systemPrompt: artSystemPrompt,
      userMessage: "Write the prompt now.",
      maxTokens: 500,
      model: HAIKU_MODEL
    });

    const { buffer: imageBuffer, mimeType } = await generateImage(artPrompt.trim());
    const url = await saveWorldMoodBoard(worldId, imageBuffer, mimeType);

    res.json({ url, generated: true });
  } catch (err) {
    console.error("World mood board generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET status -- does this specific faction have a banner? Storage-truth
// check (see factionBannerExists in lib/fileWriter.js for why this
// bypasses the entries.raw_json.bannerImageUrl field entirely). The
// dossier page calls this directly rather than trusting the field it
// already got back on entry.bannerImageUrl.
router.get("/world-art/faction-banner/:factionId", async (req, res) => {
  try {
    const exists = await factionBannerExists(req.worldId, req.params.factionId);
    res.json({ exists, url: exists ? getFactionBannerUrl(req.worldId, req.params.factionId) : null });
  } catch (err) {
    console.error(`Checking faction banner (${req.params.factionId}) failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Shared by both the batch wizard route and the new single-faction route
// below -- generates one faction's banner and writes it to Storage + the
// entries bridge. Returns a plain result object rather than throwing, so
// callers (batch or single) can each decide how to surface a failure.
async function generateOneFactionBanner(worldId, faction, styleGuide) {
  const factionAccent = await getFactionAccent(worldId, styleGuide, faction.id);
  const subjectJson = {
    factionName: faction.name,
    concept: faction.concept || null
  };
  const artSystemPrompt = buildArtPromptSystemPrompt({
    category: "faction-mood",
    subjectJson,
    styleGuide,
    factionAccent
  });
  const artPrompt = await callClaude({
    systemPrompt: artSystemPrompt,
    userMessage: "Write the prompt now.",
    maxTokens: 500,
    model: HAIKU_MODEL
  });

  const { buffer: imageBuffer, mimeType } = await generateImage(artPrompt.trim());
  const imageUrl = await saveFactionBanner(worldId, faction.id, imageBuffer, mimeType);

  // Bridges into the entries table the same way accentColor already
  // does (see routes/wizardStyleGuide.js's save-style-guide) -- the
  // live dossier page can read entry.bannerImageUrl directly with
  // no separate world-art lookup.
  await patchEntryMeta(worldId, "factions", faction.id, { bannerImageUrl: imageUrl });
  return imageUrl;
}

// POST generate banners for every faction this world currently has
// saved. Sequential (not Promise.all) to match the existing batched-
// faction-generation pattern in routes/wizardFactions.js -- keeps
// Gemini call volume predictable and each faction's failure isolated
// from the others (one bad prompt shouldn't cost every faction its
// banner). Non-fatal per faction: a failure is recorded in `results`,
// not thrown, so one broken faction doesn't block the rest.
router.post("/world-art/generate-faction-banners", requireAiEnabled, async (req, res) => {
  try {
    const worldId = req.worldId;
    const factions = await getFactions(worldId);
    if (factions.length === 0) {
      return res.json({ results: [] });
    }

    const styleGuide = await getStyleGuide(worldId);
    const results = [];

    for (const faction of factions) {
      try {
        // Skip factions that already have a banner -- generate-once, same
        // guard generate-mood-board already has above. Without this, going
        // back to Step 6 and clicking Save & Continue again (browser back
        // button, or the wizard's own back link) re-generates a banner for
        // EVERY faction on each pass, since this loop had no per-faction
        // exists-check at all -- the real cost multiplier in the bug
        // report, since it's N Gemini calls per re-save, not 1.
        const alreadyHasBanner = await factionBannerExists(worldId, faction.id);
        if (alreadyHasBanner) {
          results.push({ id: faction.id, imageUrl: getFactionBannerUrl(worldId, faction.id), generated: false });
          continue;
        }

        const imageUrl = await generateOneFactionBanner(worldId, faction, styleGuide);
        results.push({ id: faction.id, imageUrl, generated: true });
      } catch (factionErr) {
        console.error(`Faction banner generation failed for '${faction.id}':`, factionErr.message);
        results.push({ id: faction.id, imageUrl: null, imageError: factionErr.message });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("Faction banner batch generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST generate a banner for exactly one faction -- the on-demand path
// for a world that skipped art at Step 6 (or a faction added afterward).
// Mirrors /entries/:category/:id/generate-image's single-subject shape.
// Same generate-once guard as the batch route: re-clicking after success
// just returns the existing URL instead of spending another generation.
router.post("/world-art/generate-faction-banner/:factionId", requireAiEnabled, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { factionId } = req.params;

    const alreadyHasBanner = await factionBannerExists(worldId, factionId);
    if (alreadyHasBanner) {
      return res.json({ imageUrl: getFactionBannerUrl(worldId, factionId), generated: false });
    }

    const factions = await getFactions(worldId);
    const faction = factions.find((f) => f.id === factionId);
    if (!faction) {
      return res.status(404).json({ error: "Faction not found." });
    }

    const styleGuide = await getStyleGuide(worldId);
    const imageUrl = await generateOneFactionBanner(worldId, faction, styleGuide);
    res.json({ imageUrl, generated: true });
  } catch (err) {
    console.error(`Single faction banner generation failed for '${req.params.factionId}':`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST upload a user's own image as the world mood board, instead of
// generating one. Same base64-data-URL shape and no-cap reasoning as
// /entries/:category/:id/upload-image. Upsert-true storage write means
// this also works to replace an existing (generated or uploaded) board.
router.post("/world-art/upload-mood-board", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required." });
    }
    const match = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = match ? match[1] : "image/png";
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    const url = await saveWorldMoodBoard(req.worldId, imageBuffer, mimeType);
    res.json({ url });
  } catch (err) {
    console.error("World mood board upload failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST upload a user's own image as one faction's banner, instead of
// generating one. Same shape/reasoning as upload-mood-board above.
router.post("/world-art/upload-faction-banner/:factionId", async (req, res) => {
  try {
    const worldId = req.worldId;
    const { factionId } = req.params;
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required." });
    }
    const match = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = match ? match[1] : "image/png";
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    const imageUrl = await saveFactionBanner(worldId, factionId, imageBuffer, mimeType);
    await patchEntryMeta(worldId, "factions", factionId, { bannerImageUrl: imageUrl });
    res.json({ imageUrl });
  } catch (err) {
    console.error(`Faction banner upload failed for '${req.params.factionId}':`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
