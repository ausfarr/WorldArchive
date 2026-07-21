const express = require("express");
const path = require("path");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildItemRosterContext } = require("../lib/roster");
const { buildItemContentSystemPrompt } = require("../prompts/itemContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { writeItemDataFile, appendToItemManifest, saveImage } = require("../lib/fileWriter");
const { slugify } = require("../lib/itemTemplate");
const { weaponRollInRange } = require("../lib/itemFormulas");

const router = express.Router();
const ARCHIVE_ROOT = path.join(__dirname, "..", "archive");

router.post("/generate-item", async (req, res) => {
  try {
    const { name, category, rarity } = req.body || {};

    const rosterContext = buildItemRosterContext(ARCHIVE_ROOT);

    const contentSystemPrompt = buildItemContentSystemPrompt({ rosterContext, name, category, rarity });
    const contentRaw = await callClaude({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the item now.",
      maxTokens: 2000
    });
    let item;
    try {
      item = parseJsonResponse(contentRaw);
    } catch (parseErr) {
      console.error("Failed to parse item JSON. Raw response length:", contentRaw.length);
      console.error("Raw response (last 300 chars):", contentRaw.slice(-300));
      throw new Error(`Item content was not valid JSON (likely truncated — response was ${contentRaw.length} chars): ${parseErr.message}`);
    }
    if (!item.id) item.id = slugify(item.name);

    // Defensive clamp - model occasionally drifts slightly outside the stated range
    if (item.category === "Weapon" && item.weaponRoll && item.weaponSkill) {
      item.weaponRoll = weaponRollInRange(item.weaponSkill, item.weaponRoll);
    }

    let imageBuffer = null;
    try {
      const artSystemPrompt = buildArtPromptSystemPrompt({ npcJson: item });
      const artPrompt = await callClaude({
        systemPrompt: artSystemPrompt,
        userMessage: "Write the prompt now.",
        maxTokens: 500
      });
      imageBuffer = await generateImage(artPrompt.trim());
    } catch (imgErr) {
      console.error("Image step failed, continuing without art:", imgErr.message);
    }

    writeItemDataFile(ARCHIVE_ROOT, item);
    appendToItemManifest(ARCHIVE_ROOT, item);
    if (imageBuffer) saveImage(ARCHIVE_ROOT, item.id, imageBuffer);

    res.json({
      id: item.id,
      name: item.name,
      category: item.category,
      rarity: item.rarity,
      summary: item.designNotes,
      imageGenerated: !!imageBuffer
    });
  } catch (err) {
    console.error("Item generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
