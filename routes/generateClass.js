const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { callClaudeExpectingJson, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildClassRosterContext, readClassManifest, readClassEntry, buildLocationRosterContext } = require("../lib/roster");
const { buildClassContentSystemPrompt } = require("../prompts/classContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { saveClassEntry, saveImage } = require("../lib/fileWriter");
const { slugify, buildClassBodyHtml } = require("../lib/classTemplate");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getStatLabels, formatStatLabelsForPrompt, getFactionAccent, getSkillSystem, formatFieldSkillsForPrompt, formatWeaponSkillsForPrompt } = require("../lib/worldFlavor");
const { getStyleGuide } = require("../lib/worldConfigRepo");

const router = express.Router();

router.post("/generate-class", enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, fillExistingId } = req.body || {};
    let existingEntry = null;
    let existingBaseName = null;
    let priorRaw = null;
    let priorBodyHtml = null;
    let mode = "new";

    if (fillExistingId) {
      const manifest = await readClassManifest(worldId);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing class entry found with id '${fillExistingId}'` });
      }
      mode = existingEntry.locked ? "fill" : "regenerate";
      if (mode === "regenerate") {
        const prior = await readClassEntry(worldId, fillExistingId);
        priorRaw = prior && prior.raw ? prior.raw : null;
        priorBodyHtml = prior ? prior.bodyHtml : null;
      }
      // Manifest name is stored as "The Courier → The Slipstream" - the
      // base name (pre-evolution) is what we tell the model to build around.
      existingBaseName = existingEntry.name.split("→")[0].trim();
      name = existingBaseName;
    }

    const rosterContext = await buildClassRosterContext(worldId);
    const locationRosterText = await buildLocationRosterContext(worldId);
    const loreContext = await getLoreContext(worldId, { category: "classes" });
    const settingContext = await getSettingContext(worldId);
    const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));
    const skillSystem = await getSkillSystem(worldId);
    const fieldSkillsText = formatFieldSkillsForPrompt(skillSystem);
    const weaponSkillsText = formatWeaponSkillsForPrompt(skillSystem);

    const contentSystemPrompt = buildClassContentSystemPrompt({ settingContext, loreContext, statLabelsText, fieldSkillsText, weaponSkillsText, rosterContext, locationRosterText, name, existingContent: priorRaw });
    // Generous budget - a full 1-99 tree with ~21 abilities across 4 tiers
    // is genuinely long content, not a truncation risk we're guessing at.
    const cls = await callClaudeExpectingJson({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the class now.",
      maxTokens: 8000
    });
    cls.id = fillExistingId || cls.id || slugify(cls.baseName);
    if (existingBaseName) cls.baseName = existingBaseName;

    if (mode === "regenerate") {
      const newBodyHtmlPreview = buildClassBodyHtml(cls);
      return res.json({
        preview: true,
        mode: "regenerate",
        category: "classes",
        id: cls.id,
        name: `${cls.baseName} → ${cls.evolvedName}`,
        entry: cls,
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
    await saveClassEntry(worldId, cls, null);

    res.json({
      preview: false,
      id: cls.id,
      name: `${cls.baseName} → ${cls.evolvedName}`,
      archetype: cls.archetype,
      summary: cls.designNotes
    });
  } catch (err) {
    console.error("Class generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
