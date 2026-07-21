const express = require("express");
const path = require("path");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildSurvivorRosterContext, buildAvailableClassesText } = require("../lib/roster");
const { buildSurvivorContentSystemPrompt } = require("../prompts/survivorContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { writeSurvivorDataFile, appendToSurvivorManifest, saveImage } = require("../lib/fileWriter");
const { slugify, buildSurvivorBodyHtml } = require("../lib/survivorTemplate");
const { readSurvivorManifest, readSurvivorEntry } = require("../lib/roster");

const router = express.Router();
const ARCHIVE_ROOT = path.join(__dirname, "..", "archive");

router.post("/generate-survivor", async (req, res) => {
  try {
    let { name, className, fillExistingId } = req.body || {};
    let existingEntry = null;
    let priorRaw = null;
    let priorBodyHtml = null;
    let mode = "new";

    if (fillExistingId) {
      const manifest = readSurvivorManifest(ARCHIVE_ROOT);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing survivor entry found with id '${fillExistingId}'` });
      }
      // Survivors have no locked placeholders by design (roster only grows
      // via fresh generation, per scope doc) — so any existing id here is
      // always a regenerate, never a "fill."
      mode = "regenerate";
      const prior = readSurvivorEntry(ARCHIVE_ROOT, fillExistingId);
      priorRaw = prior && prior.raw ? prior.raw : null;
      priorBodyHtml = prior ? prior.bodyHtml : null;
      name = existingEntry.name;
      className = priorRaw ? priorRaw.className : className;
    }

    const rosterContext = buildSurvivorRosterContext(ARCHIVE_ROOT);
    const availableClasses = buildAvailableClassesText(ARCHIVE_ROOT);

    const contentSystemPrompt = buildSurvivorContentSystemPrompt({ rosterContext, availableClasses, name, className, existingContent: priorRaw });
    const contentRaw = await callClaude({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the survivor now.",
      maxTokens: 1500
    });
    let survivor;
    try {
      survivor = parseJsonResponse(contentRaw);
    } catch (parseErr) {
      console.error("Failed to parse survivor JSON. Raw response length:", contentRaw.length);
      console.error("Raw response (last 300 chars):", contentRaw.slice(-300));
      throw new Error(`Survivor content was not valid JSON (likely truncated — response was ${contentRaw.length} chars): ${parseErr.message}`);
    }
    if (!survivor.id) survivor.id = slugify(survivor.name);
    if (fillExistingId) survivor.id = fillExistingId;
    if (existingEntry) survivor.name = existingEntry.name;

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

    let imageBuffer = null;
    try {
      const artSystemPrompt = buildArtPromptSystemPrompt({ npcJson: survivor });
      const artPrompt = await callClaude({
        systemPrompt: artSystemPrompt,
        userMessage: "Write the prompt now.",
        maxTokens: 500
      });
      imageBuffer = await generateImage(artPrompt.trim());
    } catch (imgErr) {
      console.error("Image step failed, continuing without art:", imgErr.message);
    }

    writeSurvivorDataFile(ARCHIVE_ROOT, survivor);
    appendToSurvivorManifest(ARCHIVE_ROOT, survivor);
    if (imageBuffer) saveImage(ARCHIVE_ROOT, survivor.id, imageBuffer);

    res.json({
      preview: false,
      id: survivor.id,
      name: survivor.name,
      className: survivor.className,
      summary: survivor.designNotes,
      imageGenerated: !!imageBuffer
    });
  } catch (err) {
    console.error("Survivor generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
