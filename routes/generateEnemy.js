const express = require("express");
const path = require("path");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildEnemyRosterContext } = require("../lib/roster");
const { buildEnemyContentSystemPrompt } = require("../prompts/enemyContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { writeEnemyDataFile, appendToEnemyManifest, saveImage } = require("../lib/fileWriter");
const { slugify } = require("../lib/enemyTemplate");
const { attributeBudgetWarning } = require("../lib/statFormulas");

const router = express.Router();
const ARCHIVE_ROOT = path.join(__dirname, "..", "archive");

router.post("/generate-enemy", async (req, res) => {
  try {
    const { name, faction, tier } = req.body || {};

    const rosterContext = buildEnemyRosterContext(ARCHIVE_ROOT);

    const contentSystemPrompt = buildEnemyContentSystemPrompt({ rosterContext, name, faction, tier });
    const contentRaw = await callClaude({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the enemy now.",
      maxTokens: 3000
    });
    let enemy;
    try {
      enemy = parseJsonResponse(contentRaw);
    } catch (parseErr) {
      console.error("Failed to parse enemy JSON. Raw response length:", contentRaw.length);
      console.error("Raw response (last 300 chars):", contentRaw.slice(-300));
      throw new Error(`Enemy content was not valid JSON (likely truncated — response was ${contentRaw.length} chars): ${parseErr.message}`);
    }
    if (!enemy.id) enemy.id = slugify(enemy.name);

    const warning = attributeBudgetWarning(enemy.attributes, enemy.tier);
    if (warning) console.warn("Attribute budget check:", warning);

    let imageBuffer = null;
    try {
      const artSystemPrompt = buildArtPromptSystemPrompt({ npcJson: enemy });
      const artPrompt = await callClaude({
        systemPrompt: artSystemPrompt,
        userMessage: "Write the prompt now.",
        maxTokens: 500
      });
      imageBuffer = await generateImage(artPrompt.trim());
    } catch (imgErr) {
      console.error("Image step failed, continuing without art:", imgErr.message);
    }

    writeEnemyDataFile(ARCHIVE_ROOT, enemy);
    appendToEnemyManifest(ARCHIVE_ROOT, enemy);
    if (imageBuffer) saveImage(ARCHIVE_ROOT, enemy.id, imageBuffer);

    res.json({
      id: enemy.id,
      name: enemy.name,
      tier: enemy.tier,
      faction: enemy.faction,
      summary: enemy.designNotes,
      imageGenerated: !!imageBuffer,
      attributeBudgetWarning: warning
    });
  } catch (err) {
    console.error("Enemy generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
