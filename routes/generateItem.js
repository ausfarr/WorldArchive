const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { callClaudeExpectingJson, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildItemRosterContext, readItemManifest, readItemEntry, buildLocationRosterContext } = require("../lib/roster");
const { buildItemContentSystemPrompt } = require("../prompts/itemContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { saveItemEntry, saveImage } = require("../lib/fileWriter");
const { slugify, buildItemBodyHtml } = require("../lib/itemTemplate");
const { clampDamageRange } = require("../lib/itemFormulas");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getStatLabels, formatStatLabelsForPrompt, getFactionAccent, getSkillSystem, formatWeaponSkillsForPrompt, resolveWeaponSkillLabel } = require("../lib/worldFlavor");
const { getStyleGuide } = require("../lib/worldConfigRepo");
const { createNewItem } = require("../lib/campaignEntryGenerators");

const router = express.Router();

const RARITY_WORDS = ["Common", "Uncommon", "Rare", "Legendary"];
function parseSubtitleForItem(subtitle) {
  const words = (subtitle || "").split(/\s+/);
  const rarity = RARITY_WORDS.find((r) => words.includes(r)) || null;
  let category = null;
  if (/weapon/i.test(subtitle)) category = "Weapon";
  else if (/armor/i.test(subtitle)) category = "Armor";
  else if (/consumable/i.test(subtitle)) category = "Consumable";
  else if (/quest/i.test(subtitle)) category = "QuestItem";
  return { rarity, category };
}

router.post("/generate-item", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, category, rarity, fillExistingId } = req.body || {};

    if (!fillExistingId) {
      const result = await createNewItem(worldId, { name, category, rarity });
      return res.json({ preview: false, ...result });
    }

    let existingEntry = null;
    let priorRaw = null;
    let priorBodyHtml = null;
    let mode = "new";

    if (fillExistingId) {
      const manifest = await readItemManifest(worldId);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing item entry found with id '${fillExistingId}'` });
      }
      mode = existingEntry.locked ? "fill" : "regenerate";
      if (mode === "regenerate") {
        const prior = await readItemEntry(worldId, fillExistingId);
        priorRaw = prior && prior.raw ? prior.raw : null;
        priorBodyHtml = prior ? prior.bodyHtml : null;
      }
      name = existingEntry.name;
      const parsed = parseSubtitleForItem(existingEntry.subtitle);
      category = parsed.category || category;
      rarity = parsed.rarity || rarity;
    }

    const rosterContext = await buildItemRosterContext(worldId);
    const locationRosterText = await buildLocationRosterContext(worldId);
    const loreContext = await getLoreContext(worldId, { category: "items" });
    const settingContext = await getSettingContext(worldId);
    const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));
    const skillSystem = await getSkillSystem(worldId);
    const weaponSkillsText = formatWeaponSkillsForPrompt(skillSystem);

    const contentSystemPrompt = buildItemContentSystemPrompt({ settingContext, loreContext, statLabelsText, weaponSkillsText, rosterContext, locationRosterText, name, category, rarity, existingContent: priorRaw });
    const item = await callClaudeExpectingJson({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the item now.",
      maxTokens: 2000
    });
    item.id = fillExistingId || item.id || slugify(item.name);
    if (existingEntry) item.name = existingEntry.name;

    // Defensive clamp - model occasionally drifts slightly outside the stated range
    if (item.category === "Weapon" && item.weaponSkill && item.damageMin != null && item.damageMax != null) {
      const clamped = clampDamageRange(item.weaponSkill, item.damageMin, item.damageMax);
      item.damageMin = clamped.min;
      item.damageMax = clamped.max;
    }

    // item.weaponSkill stays the fixed canonical English key (needed for
    // the clamp above and any future regenerate) -- weaponSkillLabel is
    // this world's own display name, resolved once here and rendered
    // instead of the canonical key everywhere a person actually sees it
    // (see lib/fileWriter.js's item tags).
    if (item.category === "Weapon" && item.weaponSkill) {
      item.weaponSkillLabel = resolveWeaponSkillLabel(skillSystem, item.weaponSkill);
    }

    if (mode === "regenerate") {
      const newBodyHtmlPreview = buildItemBodyHtml(item);
      return res.json({
        preview: true,
        mode: "regenerate",
        category: "items",
        id: item.id,
        name: item.name,
        entry: item,
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
    await saveItemEntry(worldId, item, null);

    res.json({
      preview: false,
      id: item.id,
      name: item.name,
      category: item.category,
      rarity: item.rarity,
      summary: item.designNotes
    });
  } catch (err) {
    console.error("Item generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
