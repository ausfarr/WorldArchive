const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { callClaudeExpectingJson, HAIKU_MODEL } = require("../lib/claude");
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
const { createNewEnemy } = require("../lib/campaignEntryGenerators");

const router = express.Router();

router.post("/generate-enemy", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, faction, tier, fillExistingId } = req.body || {};

    if (!fillExistingId) {
      const result = await createNewEnemy(worldId, { name, faction, tier });
      return res.json({ preview: false, ...result });
    }

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
    const enemy = await callClaudeExpectingJson({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the enemy now.",
      maxTokens: 3000
    });
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

    // Portrait generation is no longer bundled into entry creation --
    // saved immediately with imageUrl: null, and the dossier page offers
    // Generate/Upload actions via archive/js/portraitActions.js +
    // routes/generateEntryImage.js instead. (This decoupling was
    // originally done in a separate chat session in this project; being
    // restored here after it was accidentally reverted by an unrelated
    // later delivery that touched this same file.)
    await saveEnemyEntry(worldId, enemy, null);

    res.json({
      preview: false,
      id: enemy.id,
      name: enemy.name,
      tier: enemy.tier,
      faction: enemy.faction,
      summary: enemy.designNotes,
      attributeBudgetWarning: warning
    });
  } catch (err) {
    console.error("Enemy generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
