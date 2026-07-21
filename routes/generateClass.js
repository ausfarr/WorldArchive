const express = require("express");
const path = require("path");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildClassRosterContext } = require("../lib/roster");
const { buildClassContentSystemPrompt } = require("../prompts/classContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { writeClassDataFile, appendToClassManifest, saveImage } = require("../lib/fileWriter");
const { slugify, buildClassBodyHtml } = require("../lib/classTemplate");
const { readClassManifest, readClassEntry } = require("../lib/roster");

const router = express.Router();
const ARCHIVE_ROOT = path.join(__dirname, "..", "archive");

router.post("/generate-class", async (req, res) => {
  try {
    let { name, fillExistingId } = req.body || {};
    let existingEntry = null;
    let existingBaseName = null;
    let priorRaw = null;
    let priorBodyHtml = null;
    let mode = "new";

    if (fillExistingId) {
      const manifest = readClassManifest(ARCHIVE_ROOT);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing class entry found with id '${fillExistingId}'` });
      }
      mode = existingEntry.locked ? "fill" : "regenerate";
      if (mode === "regenerate") {
        const prior = readClassEntry(ARCHIVE_ROOT, fillExistingId);
        priorRaw = prior && prior.raw ? prior.raw : null;
        priorBodyHtml = prior ? prior.bodyHtml : null;
      }
      // Manifest name is stored as "The Courier → The Slipstream" - the
      // base name (pre-evolution) is what we tell the model to build around.
      existingBaseName = existingEntry.name.split("→")[0].trim();
      name = existingBaseName;
    }

    const rosterContext = buildClassRosterContext(ARCHIVE_ROOT);

    const contentSystemPrompt = buildClassContentSystemPrompt({ rosterContext, name, existingContent: priorRaw });
    // Generous budget - a full 1-99 tree with ~21 abilities across 4 tiers
    // is genuinely long content, not a truncation risk we're guessing at.
    const contentRaw = await callClaude({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the class now.",
      maxTokens: 8000
    });
    let cls;
    try {
      cls = parseJsonResponse(contentRaw);
    } catch (parseErr) {
      console.error("Failed to parse class JSON. Raw response length:", contentRaw.length);
      console.error("Raw response (last 300 chars):", contentRaw.slice(-300));
      throw new Error(`Class content was not valid JSON (likely truncated — response was ${contentRaw.length} chars): ${parseErr.message}`);
    }
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

    let imageBuffer = null;
    try {
      const artSystemPrompt = buildArtPromptSystemPrompt({ npcJson: cls });
      const artPrompt = await callClaude({
        systemPrompt: artSystemPrompt,
        userMessage: "Write the prompt now.",
        maxTokens: 500
      });
      imageBuffer = await generateImage(artPrompt.trim());
    } catch (imgErr) {
      console.error("Image step failed, continuing without art:", imgErr.message);
    }

    writeClassDataFile(ARCHIVE_ROOT, cls);
    appendToClassManifest(ARCHIVE_ROOT, cls);
    if (imageBuffer) saveImage(ARCHIVE_ROOT, cls.id, imageBuffer);

    res.json({
      preview: false,
      id: cls.id,
      name: `${cls.baseName} → ${cls.evolvedName}`,
      archetype: cls.archetype,
      summary: cls.designNotes,
      imageGenerated: !!imageBuffer
    });
  } catch (err) {
    console.error("Class generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
