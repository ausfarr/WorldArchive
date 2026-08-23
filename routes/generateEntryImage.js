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
// /generate-image now runs behind enforceImageGenerationCap, a SEPARATE
// quota from the 7 text-generation routes (migrations/029_split_generation_quotas.sql,
// v1.1 split-quota pricing) -- images cost ~10x more per unit than a text
// generation ($0.08 vs $0.008), so "a generation is a generation"
// (this route's original reasoning, when it first got capped) no longer
// holds now that free/subscription tiers need independently-sized
// allowances for each.
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
const { getStyleGuide, getRuleset, getGenericSystem } = require("../lib/worldConfigRepo");
const { enforceImageGenerationCap } = require("../middleware/enforceGenerationCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { save5eEnemyEntry } = require("../lib/rulesets/5e/enemyRepo");
const { save5eClassEntry } = require("../lib/rulesets/5e/classRepo");
const { save5eItemEntry } = require("../lib/rulesets/5e/itemRepo");
const { save5eSurvivorEntry } = require("../lib/rulesets/5e/survivorRepo");
const { saveGenericEnemyEntry } = require("../lib/rulesets/generic/enemyRepo");
const { saveGenericClassEntry } = require("../lib/rulesets/generic/classRepo");
const { saveGenericItemEntry } = require("../lib/rulesets/generic/itemRepo");
const { saveGenericSurvivorEntry } = require("../lib/rulesets/generic/survivorRepo");

const router = express.Router();

// Category -> the Echoes save*Entry function that rebuilds bodyHtml with
// a new imageUrl and re-upserts. Only categories that have ever had a
// portrait are listed here. This is the DEFAULT writer for a category --
// npcs/locations use it unconditionally (both stay ruleset-agnostic
// narrative content by design, same as routes/confirmEntry.js's WRITERS
// map never branches them by ruleset either); enemies/items/survivors/
// classes only fall through to it for an Echoes world, see
// resolveSaveFn() below.
const CATEGORY_SAVE_FN = {
  npcs: saveNpcEntry,
  enemies: saveEnemyEntry,
  items: saveItemEntry,
  survivors: saveSurvivorEntry,
  classes: saveClassEntry,
  locations: saveLocationEntry
};

// Per-ruleset writer for the 4 categories with their own dedicated save
// function (mirrors routes/confirmEntry.js's dispatch exactly -- same
// save5eXEntry/saveGenericXEntry functions, same ruleset keys). Fixes
// the crash this route had for any non-Echoes entry (finding #8): it
// used to hardcode CATEGORY_SAVE_FN's Echoes writer for every ruleset,
// so a 5e enemy's portrait save called saveEnemyEntry -> lib/
// enemyTemplate.js, which unconditionally destructures
// enemy.attributes.{body,reflex,...} -- a shape only an Echoes enemy
// has -- crashing with "Cannot destructure property 'body' of
// 'attributes' as it is undefined." Classes has the identical risk via
// lib/classTemplate.js hard-requiring cls.baseName/cls.evolvedName.
const RULESET_SAVE_FN = {
  enemies: { "5e": save5eEnemyEntry, generic: saveGenericEnemyEntry },
  classes: { "5e": save5eClassEntry, generic: saveGenericClassEntry },
  items: { "5e": save5eItemEntry, generic: saveGenericItemEntry },
  survivors: { "5e": save5eSurvivorEntry, generic: saveGenericSurvivorEntry }
};

// Resolves the correct save*Entry function for this world's actual
// ruleset, normalized to the plain (worldId, subject, imageUrl) call
// shape every caller below uses -- the generic writers take an extra
// genericSystem argument (attribute/derived-stat definitions aren't
// fixed like 5e's), so that variant is returned as a small wrapper
// closing over the fetched genericSystem instead.
async function resolveSaveFn(worldId, category) {
  const byRuleset = RULESET_SAVE_FN[category];
  if (!byRuleset) return CATEGORY_SAVE_FN[category]; // npcs, locations: always the one writer

  const ruleset = await getRuleset(worldId);
  if (ruleset === "5e") return byRuleset["5e"];
  if (ruleset === "generic") {
    const genericSystem = await getGenericSystem(worldId);
    return (wid, subject, imageUrl) => byRuleset.generic(wid, subject, genericSystem, imageUrl);
  }
  return CATEGORY_SAVE_FN[category]; // echoes (or an unrecognized ruleset -- fail to the long-established default)
}

async function loadEntryOrRespondError(req, res) {
  const { category, id } = req.params;
  if (!CATEGORY_SAVE_FN[category]) {
    res.status(400).json({ error: `Category '${category}' doesn't support portraits.` });
    return null;
  }
  const entry = await getEntry(req.worldId, category, id);
  if (!entry) {
    res.status(404).json({ error: "Entry not found." });
    return null;
  }
  const saveFn = await resolveSaveFn(req.worldId, category);
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
router.post("/entries/:category/:id/generate-image", requireAiEnabled, enforceImageGenerationCap, async (req, res) => {
  try {
    const { category, id } = req.params;
    const loaded = await loadEntryOrRespondError(req, res);
    if (!loaded) {
      if (req.refundImageGeneration) await req.refundImageGeneration();
      return;
    }
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
    if (req.refundImageGeneration) await req.refundImageGeneration();
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
