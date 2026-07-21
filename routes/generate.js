const express = require("express");
const path = require("path");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildRosterContext } = require("../lib/roster");
const { buildNpcContentSystemPrompt } = require("../prompts/npcContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { writeNpcDataFile, appendToManifest, saveImage } = require("../lib/fileWriter");
const { slugify } = require("../lib/entryTemplate");
const { readNpcManifest } = require("../lib/roster");

const router = express.Router();
const ARCHIVE_ROOT = path.join(__dirname, "..", "archive");

router.post("/generate-npc", async (req, res) => {
  try {
    let { name, role, faction, fillExistingId } = req.body || {};
    let existingEntry = null;

    if (fillExistingId) {
      const manifest = readNpcManifest(ARCHIVE_ROOT);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing NPC entry found with id '${fillExistingId}'` });
      }
      // Known facts from the placeholder become fixed inputs, not suggestions.
      name = existingEntry.name;
      role = existingEntry.roleArchetype || role;
      faction = existingEntry.faction || faction;
    }

    // Step 1: roster overlap context from live archive files
    const rosterContext = buildRosterContext(ARCHIVE_ROOT);

    // Step 2: content generation
    const contentSystemPrompt = buildNpcContentSystemPrompt({ rosterContext, name, role, faction });
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

    // Step 5: write files
    writeNpcDataFile(ARCHIVE_ROOT, npc);
    appendToManifest(ARCHIVE_ROOT, npc);
    if (imageBuffer) saveImage(ARCHIVE_ROOT, npc.id, imageBuffer);

    res.json({
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
