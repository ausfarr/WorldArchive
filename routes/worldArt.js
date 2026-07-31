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
// Both are triggered from the frontend right after Step 6 (Style Guide)
// is saved -- see archive/wizard-style.html -- mirroring the existing
// generate-faction-accents / save-style-guide bridge pattern. Deliberately
// NOT gated by enforceGenerationCap, same reasoning as routes/map.js's
// backdrop generation: a bounded, one-time, auto-triggered setup cost per
// world, not the open-ended per-action risk the cap exists to bound.

const express = require("express");
const { callClaude, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const {
  saveWorldMoodBoard,
  worldMoodBoardExists,
  getWorldMoodBoardUrl,
  saveFactionBanner
} = require("../lib/fileWriter");
const { getFactions, getStyleGuide } = require("../lib/worldConfigRepo");
const { getSettingContext, getFactionAccent } = require("../lib/worldFlavor");
const { patchEntryMeta } = require("../lib/entriesRepo");

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
router.post("/world-art/generate-mood-board", async (req, res) => {
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

    const imageBuffer = await generateImage(artPrompt.trim());
    const url = await saveWorldMoodBoard(worldId, imageBuffer);

    res.json({ url, generated: true });
  } catch (err) {
    console.error("World mood board generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST generate banners for every faction this world currently has
// saved. Sequential (not Promise.all) to match the existing batched-
// faction-generation pattern in routes/wizardFactions.js -- keeps
// Gemini call volume predictable and each faction's failure isolated
// from the others (one bad prompt shouldn't cost every faction its
// banner). Non-fatal per faction: a failure is recorded in `results`,
// not thrown, so one broken faction doesn't block the rest.
router.post("/world-art/generate-faction-banners", async (req, res) => {
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

        const imageBuffer = await generateImage(artPrompt.trim());
        const imageUrl = await saveFactionBanner(worldId, faction.id, imageBuffer);

        // Bridges into the entries table the same way accentColor already
        // does (see routes/wizardStyleGuide.js's save-style-guide) -- the
        // live dossier page can read entry.bannerImageUrl directly with
        // no separate world-art lookup.
        await patchEntryMeta(worldId, "factions", faction.id, { bannerImageUrl: imageUrl });
        results.push({ id: faction.id, imageUrl });
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

module.exports = router;
