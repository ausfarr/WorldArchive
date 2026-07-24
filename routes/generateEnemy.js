const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildEnemyRosterContext, readEnemyManifest, readEnemyEntry } = require("../lib/roster");
const { buildEnemyContentSystemPrompt } = require("../prompts/enemyContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { saveEnemyEntry, saveImage } = require("../lib/fileWriter");
const { slugify, buildEnemyBodyHtml } = require("../lib/enemyTemplate");
const { attributeBudgetWarning } = require("../lib/statFormulas");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt, getStatLabels, formatStatLabelsForPrompt, getFactionAccent } = require("../lib/worldFlavor");
const { getStyleGuide } = require("../lib/worldConfigRepo");

const router = express.Router();

router.post("/generate-enemy", enforceGenerationCap, async (req, res) => {
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
    const loreContext = await getLoreContext(worldId, { category: "enemies", faction });
    const settingContext = await getSettingContext(worldId);
    const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
    const statLabels = await getStatLabels(worldId);
    const statLabelsText = formatStatLabelsForPrompt(statLabels);

    const contentSystemPrompt = buildEnemyContentSystemPrompt({ settingContext, loreContext, factionOptionsText, statLabelsText, rosterContext, name, faction, tier, existingContent: priorRaw });
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

    // Same fix as routes/generate.js — a user-selected faction is a known
    // fact, not a suggestion, so it overrides whatever the model output.
    if (faction) enemy.faction = faction;

    const warning = attributeBudgetWarning(enemy.attributes, enemy.tier);
    if (warning) console.warn("Attribute budget check:", warning);

    if (mode === "regenerate") {
      const newBodyHtmlPreview = buildEnemyBodyHtml(enemy, null, statLabels);
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
    let imageError = null;
    try {
      const styleGuide = await getStyleGuide(worldId);
      const factionAccent = await getFactionAccent(worldId, styleGuide, enemy.faction);
      const artSystemPrompt = buildArtPromptSystemPrompt({ category: "enemies", subjectJson: enemy, styleGuide, factionAccent });
      const artPrompt = await callClaude({
        systemPrompt: artSystemPrompt,
        userMessage: "Write the prompt now.",
        maxTokens: 500
      });
      imageBuffer = await generateImage(artPrompt.trim());
    } catch (imgErr) {
      console.error("Image step failed, continuing without art:", imgErr.message);
      imageError = imgErr.message;
    }

    let imageUrl = null;
    if (imageBuffer) {
      try {
        imageUrl = await saveImage(worldId, enemy.id, imageBuffer);
      } catch (uploadErr) {
        console.error("Image upload failed:", uploadErr.message);
        imageError = uploadErr.message;
      }
    }
    await saveEnemyEntry(worldId, enemy, imageUrl);

    res.json({
      preview: false,
      id: enemy.id,
      name: enemy.name,
      tier: enemy.tier,
      faction: enemy.faction,
      summary: enemy.designNotes,
      imageGenerated: !!imageUrl,
      imageError,
      attributeBudgetWarning: warning
    });
  } catch (err) {
    console.error("Enemy generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
