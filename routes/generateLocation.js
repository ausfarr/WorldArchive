const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { callClaude, parseJsonResponse, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildLocationRosterContext, readLocationManifest, readLocationEntry, buildRosterContext } = require("../lib/roster");
const { buildLocationContentSystemPrompt } = require("../prompts/locationContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { saveLocationEntry, saveImage } = require("../lib/fileWriter");
const { slugify, buildLocationBodyHtml } = require("../lib/locationTemplate");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt, getFactionAccent } = require("../lib/worldFlavor");
const { getStyleGuide } = require("../lib/worldConfigRepo");

const router = express.Router();

router.post("/generate-location", enforceGenerationCap, async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, regionBiome, faction, fillExistingId } = req.body || {};
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
    const contentRaw = await callClaude({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the Location now.",
      maxTokens: 2500
    });
    let location;
    try {
      location = parseJsonResponse(contentRaw);
    } catch (parseErr) {
      console.error("Failed to parse Location JSON. Raw response length:", contentRaw.length);
      console.error("Raw response (last 300 chars):", contentRaw.slice(-300));
      throw new Error(`Location content was not valid JSON (likely truncated — response was ${contentRaw.length} chars): ${parseErr.message}`);
    }
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

    // Step 3: art prompt generation (ENVIRONMENT framing — see artPromptPrompt.js)
    let imageBuffer = null;
    let imageError = null;
    try {
      const styleGuide = await getStyleGuide(worldId);
      const factionAccent = await getFactionAccent(worldId, styleGuide, location.faction);
      const artSystemPrompt = buildArtPromptSystemPrompt({ category: "locations", subjectJson: location, styleGuide, factionAccent });
      const artPrompt = await callClaude({
        systemPrompt: artSystemPrompt,
        userMessage: "Write the prompt now.",
        maxTokens: 500,
        // Cheaper model for this call -- see lib/claude.js's HAIKU_MODEL
        // comment. Writing an art-generation prompt from structured JSON
        // + a strict template is a mechanical/templating task, not
        // creative world-building judgment, so it doesn't need Sonnet.
        model: HAIKU_MODEL
      });

      // Step 4: image generation — non-fatal if it fails
      ({ buffer: imageBuffer } = await generateImage(artPrompt.trim()));
    } catch (imgErr) {
      console.error("Image step failed, continuing without art:", imgErr.message);
      imageError = imgErr.message;
    }

    // Step 5: upload image FIRST so its real public URL can be baked
    // into the saved bodyHtml — same ordering fix as every other category.
    let imageUrl = null;
    if (imageBuffer) {
      try {
        imageUrl = await saveImage(worldId, location.id, imageBuffer);
      } catch (uploadErr) {
        console.error("Image upload failed:", uploadErr.message);
        imageError = uploadErr.message;
      }
    }
    await saveLocationEntry(worldId, location, imageUrl);

    res.json({
      preview: false,
      id: location.id,
      name: location.name,
      regionBiome: location.regionBiome,
      faction: location.faction,
      summary: location.designNotes,
      imageGenerated: !!imageUrl,
      imageError
    });
  } catch (err) {
    console.error("Location generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
