const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { callClaudeExpectingJson, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildLocationRosterContext, readLocationManifest, readLocationEntry, buildRosterContext } = require("../lib/roster");
const { buildLocationContentSystemPrompt } = require("../prompts/locationContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { saveLocationEntry, saveImage } = require("../lib/fileWriter");
const { slugify, buildLocationBodyHtml } = require("../lib/locationTemplate");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt, getFactionAccent } = require("../lib/worldFlavor");
const { getStyleGuide } = require("../lib/worldConfigRepo");
const { createNewLocation } = require("../lib/campaignEntryGenerators");

const router = express.Router();

router.post("/generate-location", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, regionBiome, faction, fillExistingId } = req.body || {};

    if (!fillExistingId) {
      const result = await createNewLocation(worldId, { name, regionBiome, faction });
      return res.json({ preview: false, ...result });
    }

    let existingEntry = null;
    let priorRaw = null;
    let priorBodyHtml = null;
    let mode = "new";

    if (fillExistingId) {
      const manifest = await readLocationManifest(worldId);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing Location entry found with id '${fillExistingId}'` });
      }
      mode = existingEntry.locked ? "fill" : "regenerate";
      if (mode === "regenerate") {
        const prior = await readLocationEntry(worldId, fillExistingId);
        priorRaw = prior && prior.raw ? prior.raw : null;
        priorBodyHtml = prior ? prior.bodyHtml : null;
      }
      // Known facts from the placeholder become fixed inputs, not suggestions.
      name = existingEntry.name;
      regionBiome = existingEntry.regionBiome || regionBiome;
      faction = existingEntry.faction || faction;
    }

    // Step 1: roster overlap context from live archive (locations, plus
    // the NPC roster so notableNpcs can only reference real ids).
    const rosterContext = await buildLocationRosterContext(worldId);
    const npcRosterText = await buildRosterContext(worldId);

    // Step 1b: generic world grounding — lore, setting framing, and this
    // world's own faction list.
    const loreContext = await getLoreContext(worldId, { category: "locations", faction });
    const settingContext = await getSettingContext(worldId);
    const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

    // Step 2: content generation
    const contentSystemPrompt = buildLocationContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, npcRosterText, name, regionBiome, faction, existingContent: priorRaw });
    const location = await callClaudeExpectingJson({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the Location now.",
      maxTokens: 2500
    });
    // For fill-existing, force the id/name to match the placeholder exactly.
    location.id = fillExistingId || location.id || slugify(location.name);
    if (existingEntry) location.name = existingEntry.name;

    // A specific faction chosen by the user is a known fact, not a
    // suggestion — same fix as generate.js's NPC route.
    if (faction) location.faction = faction;

    if (mode === "regenerate") {
      const newBodyHtmlPreview = buildLocationBodyHtml(location);
      return res.json({
        preview: true,
        mode: "regenerate",
        category: "locations",
        id: location.id,
        name: location.name,
        entry: location,
        newBodyHtmlPreview,
        oldBodyHtmlPreview: priorBodyHtml
      });
    }

    // Portrait generation is no longer bundled into entry creation --
    // saved immediately with imageUrl: null, and the dossier page offers
    // Generate/Upload actions via archive/js/portraitActions.js +
    // routes/generateEntryImage.js instead. (This decoupling was
    // originally done in a separate chat session in this project; being
    // restored here after it was accidentally reverted by an unrelated
    // later delivery that touched this same file.)
    await saveLocationEntry(worldId, location, null);

    res.json({
      preview: false,
      id: location.id,
      name: location.name,
      regionBiome: location.regionBiome,
      faction: location.faction,
      summary: location.designNotes
    });
  } catch (err) {
    console.error("Location generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
