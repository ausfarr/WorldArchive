// routes/generateEntryImage.js
//
// Portrait generation/upload as a separate, on-demand action, decoupled
// from entry creation (see the same-session change to routes/generate.js,
// generateEnemy.js, generateItem.js, generateSurvivor.js, generateClass.js,
// generateLocation.js -- all 6 now save with imageUrl: null and return
// immediately instead of blocking on 3 more sequential API calls).
//
// This is deliberately ONE shared, category-generic route instead of 6
// near-duplicate ones. It works for any category because:
//   - lib/entriesRepo.js's getEntry() is already category-generic and
//     returns entry.raw = the original structured content object
//     (npc/enemy/item/survivor/cls/location JSON), which is exactly the
//     `subjectJson` buildArtPromptSystemPrompt() needs.
//   - lib/fileWriter.js's save*Entry(worldId, subject, imageUrl)
//     functions are already how every category rebuilds bodyHtml with a
//     baked-in image URL and re-upserts the entry -- calling the same
//     function again with the same content + a new imageUrl is exactly
//     "regenerate the portrait, keep everything else."
//
// Factions and logs are excluded (CATEGORY_SAVE_FN has no entry for
// them) since neither has ever had a portrait -- see prompts/
// artPromptPrompt.js's CHARACTER/OBJECT/ENVIRONMENT category framing,
// which only covers the same 6 categories.
//
// /generate-image now runs behind enforceGenerationCap, same as the 7
// content-generation routes -- resolved the gap flagged in this file's
// prior version, where portrait regeneration was real Claude+Gemini
// spend with no limit at all, independent of plan/trial/credits. Shares
// the SAME pool rather than getting its own separate cap: simplest
// option, avoids a second quota concept to explain to users, and
// consistent with "a generation is a generation" regardless of whether
// it's text or a portrait. Revisit as a split cap later if real usage
// data shows portraits are disproportionately expensive relative to
// text content.
//
// /upload-image is NOT capped -- it's a user's own file with no AI
// spend, nothing to protect against.

const express = require("express");
const { callClaude, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { getEntry } = require("../lib/entriesRepo");
const {
  saveImage,
  saveNpcEntry,
  saveEnemyEntry,
  saveItemEntry,
  saveSurvivorEntry,
  saveClassEntry,
  saveLocationEntry
} = require("../lib/fileWriter");
const { getFactionAccent } = require("../lib/worldFlavor");
const { getStyleGuide } = require("../lib/worldConfigRepo");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");

const router = express.Router();

// Category -> the save*Entry function that rebuilds bodyHtml with a new
// imageUrl and re-upserts. Only categories that have ever had a
// portrait are listed here.
const CATEGORY_SAVE_FN = {
  npcs: saveNpcEntry,
  enemies: saveEnemyEntry,
  items: saveItemEntry,
  survivors: saveSurvivorEntry,
  classes: saveClassEntry,
  locations: saveLocationEntry
};

async function loadEntryOrRespondError(req, res) {
  const { category, id } = req.params;
  const saveFn = CATEGORY_SAVE_FN[category];
  if (!saveFn) {
    res.status(400).json({ error: `Category '${category}' doesn't support portraits.` });
    return null;
  }
  const entry = await getEntry(req.worldId, category, id);
  if (!entry) {
    res.status(404).json({ error: "Entry not found." });
    return null;
  }
  // entry.raw is the pure structured content object (what used to be
  // "npc"/"enemy"/etc. in the generate routes) -- entry itself has a few
  // extra DB-row fields (bodyHtml, locked, tags) spread in that the
  // save*Entry functions and buildArtPromptSystemPrompt don't expect.
  const subjectJson = entry.raw || entry;
  return { saveFn, entry, subjectJson };
}

// Generates a brand-new (or regenerated) portrait from the entry's
// existing content via the art-prompt-writer -> Gemini pipeline, same
// as entry creation used to do inline.
router.post("/entries/:category/:id/generate-image", requireAiEnabled, enforceGenerationCap, async (req, res) => {
  try {
    const { category, id } = req.params;
    const loaded = await loadEntryOrRespondError(req, res);
    if (!loaded) return;
    const { saveFn, subjectJson } = loaded;

    const styleGuide = await getStyleGuide(req.worldId);
    const factionAccent = await getFactionAccent(req.worldId, styleGuide, subjectJson.faction);
    const artSystemPrompt = buildArtPromptSystemPrompt({ category, subjectJson, styleGuide, factionAccent });
    const artPrompt = await callClaude({
      systemPrompt: artSystemPrompt,
      userMessage: "Write the prompt now.",
      maxTokens: 500,
      model: HAIKU_MODEL
    });

    const { buffer: imageBuffer, mimeType } = await generateImage(artPrompt.trim());
    const imageUrl = await saveImage(req.worldId, id, imageBuffer, mimeType);
    await saveFn(req.worldId, subjectJson, imageUrl);

    res.json({ imageUrl });
  } catch (err) {
    console.error("Portrait generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Accepts a user-uploaded image (base64 data URL or raw base64 string)
// instead of generating one. Same storage path/bucket as a generated
// portrait, so it's indistinguishable to the rest of the app afterward.
router.post("/entries/:category/:id/upload-image", async (req, res) => {
  try {
    const { id } = req.params;
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required." });
    }
    const loaded = await loadEntryOrRespondError(req, res);
    if (!loaded) return;
    const { saveFn, subjectJson } = loaded;

    const match = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = match ? match[1] : "image/png";
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    const imageUrl = await saveImage(req.worldId, id, imageBuffer, mimeType);
    await saveFn(req.worldId, subjectJson, imageUrl);

    res.json({ imageUrl });
  } catch (err) {
    console.error("Portrait upload failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
