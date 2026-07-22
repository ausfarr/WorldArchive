const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildEnemyRosterContext, readEnemyManifest, readEnemyEntry } = require("../lib/roster");
const { buildEnemyContentSystemPrompt } = require("../prompts/enemyContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { saveEnemyEntry, saveImage } = require("../lib/fileWriter");
const { slugify, buildEnemyBodyHtml } = require("../lib/enemyTemplate");
const { attributeBudgetWarning } = require("../lib/statFormulas");

const router = express.Router();

router.post("/generate-enemy", async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, faction, tier, fillExistingId } = req.body || {};
    let existingEntry = null;
    let priorRaw = null;
    let priorBodyHtml = null;
    let mode = "new";

    if (fillExistingId) {
      const manifest = await readEnemyManifest(worldId);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing enemy entry found with id '${fillExistingId}'` });
      }
      mode = existingEntry.locked ? "fill" : "regenerate";
      if (mode === "regenerate") {
        const prior = await readEnemyEntry(worldId, fillExistingId);
        priorRaw = prior && prior.raw ? prior.raw : null;
        priorBodyHtml = prior ? prior.bodyHtml : null;
      }
      name = existingEntry.name;
      faction = existingEntry.faction || faction;
      tier = existingEntry.tier || (existingEntry.subtitle || "").split("—")[0].trim() || tier;
    }

    const rosterContext = await buildEnemyRosterContext(worldId);

    const contentSystemPrompt = buildEnemyContentSystemPrompt({ rosterContext, name, faction, tier, existingContent: priorRaw });
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
    enemy.id = fillExistingId || enemy.id || slugify(enemy.name);
    if (existingEntry) enemy.name = existingEntry.name;

    const warning = attributeBudgetWarning(enemy.attributes, enemy.tier);
    if (warning) console.warn("Attribute budget check:", warning);

    if (mode === "regenerate") {
      const newBodyHtmlPreview = buildEnemyBodyHtml(enemy);
      return res.json({
        preview: true,
        mode: "regenerate",
        category: "enemies",
        id: enemy.id,
        name: enemy.name,
        entry: enemy,
        newBodyHtmlPreview,
        oldBodyHtmlPreview: priorBodyHtml,
        attributeBudgetWarning: warning
      });
    }

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

    await saveEnemyEntry(worldId, enemy);
    if (imageBuffer) await saveImage(worldId, enemy.id, imageBuffer);

    res.json({
      preview: false,
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
