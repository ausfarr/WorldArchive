const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildRosterContext, readNpcManifest, readNpcEntry } = require("../lib/roster");
const { buildNpcContentSystemPrompt } = require("../prompts/npcContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { saveNpcEntry, saveImage } = require("../lib/fileWriter");
const { slugify, buildBodyHtml } = require("../lib/entryTemplate");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");

const router = express.Router();

router.post("/generate-npc", async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, role, faction, fillExistingId } = req.body || {};
    let existingEntry = null;
    let priorRaw = null;
    let priorBodyHtml = null;
    let mode = "new";

    if (fillExistingId) {
      const manifest = await readNpcManifest(worldId);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing NPC entry found with id '${fillExistingId}'` });
      }
      mode = existingEntry.locked ? "fill" : "regenerate";
      if (mode === "regenerate") {
        const prior = await readNpcEntry(worldId, fillExistingId);
        priorRaw = prior && prior.raw ? prior.raw : null;
        priorBodyHtml = prior ? prior.bodyHtml : null;
      }
      // Known facts from the placeholder become fixed inputs, not suggestions.
      name = existingEntry.name;
      role = existingEntry.roleArchetype || role;
      faction = existingEntry.faction || faction;
    }

    // Step 1: roster overlap context from live archive
    const rosterContext = await buildRosterContext(worldId);

    // Step 1b: generic world grounding — lore, setting framing, and this
    // world's own faction list (replaces the old hardcoded Echoes World
    // Bible + 4-faction voice text).
    const loreContext = await getLoreContext(worldId, { category: "npcs", faction });
    const settingContext = await getSettingContext(worldId);
    const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

    // Step 2: content generation
    const contentSystemPrompt = buildNpcContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, role, faction, existingContent: priorRaw });
    const contentRaw = await callClaude({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the NPC now.",
      maxTokens: 3000
    });
    let npc;
    try {
      npc = parseJsonResponse(contentRaw);
    } catch (parseErr) {
      console.error("Failed to parse NPC JSON. Raw response length:", contentRaw.length);
      console.error("Raw response (last 300 chars):", contentRaw.slice(-300));
      throw new Error(`NPC content was not valid JSON (likely truncated — response was ${contentRaw.length} chars): ${parseErr.message}`);
    }
    // For fill-existing, force the id/name to match the placeholder exactly
    // (other pages may already link to this id/display this name).
    npc.id = fillExistingId || npc.id || slugify(npc.name);
    if (existingEntry) npc.name = existingEntry.name;

    if (mode === "regenerate") {
      const newBodyHtmlPreview = buildBodyHtml(npc);
      return res.json({
        preview: true,
        mode: "regenerate",
        category: "npcs",
        id: npc.id,
        name: npc.name,
        entry: npc,
        newBodyHtmlPreview,
        oldBodyHtmlPreview: priorBodyHtml
      });
    }

    // Step 3: art prompt generation
    let imageBuffer = null;
    try {
      const artSystemPrompt = buildArtPromptSystemPrompt({ npcJson: npc });
      const artPrompt = await callClaude({
        systemPrompt: artSystemPrompt,
        userMessage: "Write the prompt now.",
        maxTokens: 500
      });

      // Step 4: image generation — non-fatal if it fails
      imageBuffer = await generateImage(artPrompt.trim());
    } catch (imgErr) {
      console.error("Image step failed, continuing without art:", imgErr.message);
    }

    // Step 5: write to Supabase
    await saveNpcEntry(worldId, npc);
    if (imageBuffer) await saveImage(worldId, npc.id, imageBuffer);

    res.json({
      preview: false,
      id: npc.id,
      name: npc.name,
      roleArchetype: npc.roleArchetype,
      faction: npc.faction,
      summary: npc.designNotes,
      imageGenerated: !!imageBuffer
    });
  } catch (err) {
    console.error("NPC generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
