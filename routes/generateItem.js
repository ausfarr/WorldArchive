const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildItemRosterContext, readItemManifest, readItemEntry } = require("../lib/roster");
const { buildItemContentSystemPrompt } = require("../prompts/itemContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { saveItemEntry, saveImage } = require("../lib/fileWriter");
const { slugify, buildItemBodyHtml } = require("../lib/itemTemplate");
const { clampDamageRange } = require("../lib/itemFormulas");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getStatLabels, formatStatLabelsForPrompt, getFactionAccent } = require("../lib/worldFlavor");
const { getStyleGuide } = require("../lib/worldConfigRepo");

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

router.post("/generate-item", async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, category, rarity, fillExistingId } = req.body || {};
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
    const loreContext = await getLoreContext(worldId, { category: "items" });
    const settingContext = await getSettingContext(worldId);
    const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));

    const contentSystemPrompt = buildItemContentSystemPrompt({ settingContext, loreContext, statLabelsText, rosterContext, name, category, rarity, existingContent: priorRaw });
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
    item.id = fillExistingId || item.id || slugify(item.name);
    if (existingEntry) item.name = existingEntry.name;

    // Defensive clamp - model occasionally drifts slightly outside the stated range
    if (item.category === "Weapon" && item.weaponSkill && item.damageMin != null && item.damageMax != null) {
      const clamped = clampDamageRange(item.weaponSkill, item.damageMin, item.damageMax);
      item.damageMin = clamped.min;
      item.damageMax = clamped.max;
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

    let imageBuffer = null;
    let imageError = null;
    try {
      const styleGuide = await getStyleGuide(worldId);
      const factionAccent = await getFactionAccent(worldId, styleGuide, item.faction);
      const artSystemPrompt = buildArtPromptSystemPrompt({ category: "items", subjectJson: item, styleGuide, factionAccent });
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
        imageUrl = await saveImage(worldId, item.id, imageBuffer);
      } catch (uploadErr) {
        console.error("Image upload failed:", uploadErr.message);
        imageError = uploadErr.message;
      }
    }
    await saveItemEntry(worldId, item, imageUrl);

    res.json({
      preview: false,
      id: item.id,
      name: item.name,
      category: item.category,
      rarity: item.rarity,
      summary: item.designNotes,
      imageGenerated: !!imageUrl,
      imageError
    });
  } catch (err) {
    console.error("Item generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
