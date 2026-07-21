const express = require("express");
const path = require("path");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildSurvivorRosterContext, buildAvailableClassesText } = require("../lib/roster");
const { buildSurvivorContentSystemPrompt } = require("../prompts/survivorContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { writeSurvivorDataFile, appendToSurvivorManifest, saveImage } = require("../lib/fileWriter");
const { slugify } = require("../lib/survivorTemplate");

const router = express.Router();
const ARCHIVE_ROOT = path.join(__dirname, "..", "archive");

router.post("/generate-survivor", async (req, res) => {
  try {
    const { name, className } = req.body || {};

    const rosterContext = buildSurvivorRosterContext(ARCHIVE_ROOT);
    const availableClasses = buildAvailableClassesText(ARCHIVE_ROOT);

    const contentSystemPrompt = buildSurvivorContentSystemPrompt({ rosterContext, availableClasses, name, className });
    const contentRaw = await callClaude({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the survivor now.",
      maxTokens: 1500
    });
    let survivor;
    try {
      survivor = parseJsonResponse(contentRaw);
    } catch (parseErr) {
      console.error("Failed to parse survivor JSON. Raw response length:", contentRaw.length);
      console.error("Raw response (last 300 chars):", contentRaw.slice(-300));
      throw new Error(`Survivor content was not valid JSON (likely truncated — response was ${contentRaw.length} chars): ${parseErr.message}`);
    }
    if (!survivor.id) survivor.id = slugify(survivor.name);

    let imageBuffer = null;
    try {
      const artSystemPrompt = buildArtPromptSystemPrompt({ npcJson: survivor });
      const artPrompt = await callClaude({
        systemPrompt: artSystemPrompt,
        userMessage: "Write the prompt now.",
        maxTokens: 500
      });
      imageBuffer = await generateImage(artPrompt.trim());
    } catch (imgErr) {
      console.error("Image step failed, continuing without art:", imgErr.message);
    }

    writeSurvivorDataFile(ARCHIVE_ROOT, survivor);
    appendToSurvivorManifest(ARCHIVE_ROOT, survivor);
    if (imageBuffer) saveImage(ARCHIVE_ROOT, survivor.id, imageBuffer);

    res.json({
      id: survivor.id,
      name: survivor.name,
      className: survivor.className,
      summary: survivor.designNotes,
      imageGenerated: !!imageBuffer
    });
  } catch (err) {
    console.error("Survivor generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
