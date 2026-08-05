const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { callClaudeExpectingJson, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildSurvivorRosterContext, buildAvailableClassesText, readSurvivorManifest, readSurvivorEntry } = require("../lib/roster");
const { buildSurvivorContentSystemPrompt } = require("../prompts/survivorContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { saveSurvivorEntry, saveImage } = require("../lib/fileWriter");
const { slugify, buildSurvivorBodyHtml } = require("../lib/survivorTemplate");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getStatLabels, formatStatLabelsForPrompt, getFactionAccent, getSkillSystem, formatFieldSkillsForPrompt, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");
const { getStyleGuide } = require("../lib/worldConfigRepo");

const router = express.Router();

router.post("/generate-survivor", enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, className, faction, fillExistingId, importText } = req.body || {};
    let existingEntry = null;
    let priorRaw = null;
    let priorBodyHtml = null;
    let mode = "new";

    if (fillExistingId) {
      const manifest = await readSurvivorManifest(worldId);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing PC entry found with id '${fillExistingId}'` });
      }
      // PCs have no locked placeholders by design (roster only grows via
      // fresh generation, per scope doc) — so any existing id here is
      // always a regenerate, never a "fill."
      mode = "regenerate";
      const prior = await readSurvivorEntry(worldId, fillExistingId);
      priorRaw = prior && prior.raw ? prior.raw : null;
      priorBodyHtml = prior ? prior.bodyHtml : null;
      name = existingEntry.name;
      className = priorRaw ? priorRaw.className : className;
      faction = priorRaw ? priorRaw.faction : faction;
    }

    const rosterContext = await buildSurvivorRosterContext(worldId);
    const availableClasses = await buildAvailableClassesText(worldId);
    const loreContext = await getLoreContext(worldId, { category: "survivors", faction });
    const settingContext = await getSettingContext(worldId);
    const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));
    const fieldSkillsText = formatFieldSkillsForPrompt(await getSkillSystem(worldId));
    const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

    const contentSystemPrompt = buildSurvivorContentSystemPrompt({
      settingContext, loreContext, statLabelsText, fieldSkillsText, factionOptionsText,
      rosterContext, availableClasses, name, className, faction,
      existingContent: priorRaw,
      importSourceText: (!fillExistingId && importText && importText.trim()) ? importText.trim() : undefined
    });
    const survivor = await callClaudeExpectingJson({
      systemPrompt: contentSystemPrompt,
      userMessage: importText ? "Import and structure this character now." : "Generate the PC now.",
      maxTokens: 2000
    });
    if (!survivor.id) survivor.id = slugify(survivor.name);
    if (fillExistingId) survivor.id = fillExistingId;
    if (existingEntry) survivor.name = existingEntry.name;
    // A specific faction chosen by the user (dropdown selection, or an
    // existing entry being filled/regenerated) is a known fact — force
    // it rather than trusting the model, same pattern generate.js's NPC
    // route uses.
    if (faction) survivor.faction = faction;

    if (mode === "regenerate") {
      const newBodyHtmlPreview = buildSurvivorBodyHtml(survivor);
      return res.json({
        preview: true,
        mode: "regenerate",
        category: "survivors",
        id: survivor.id,
        name: survivor.name,
        entry: survivor,
        newBodyHtmlPreview,
        oldBodyHtmlPreview: priorBodyHtml
      });
    }

    // Portrait generation is no longer bundled into entry creation --
    // saved immediately with imageUrl: null, and the dossier page offers
    // Generate/Upload actions via archive/js/portraitActions.js +
    // routes/generateEntryImage.js instead.
    await saveSurvivorEntry(worldId, survivor, null);

    res.json({
      preview: false,
      id: survivor.id,
      name: survivor.name,
      className: survivor.className,
      faction: survivor.faction,
      summary: survivor.designNotes
    });
  } catch (err) {
    console.error("PC generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
