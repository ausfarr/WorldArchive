const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { buildLogRosterContext, readLogManifest, readLogEntry } = require("../lib/roster");
const { buildLogContentSystemPrompt } = require("../prompts/logContentPrompt");
const { saveLogEntry } = require("../lib/fileWriter");
const { slugify, buildLogBodyHtml } = require("../lib/logTemplate");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");

const router = express.Router();

router.post("/generate-log", async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, logType, fillExistingId } = req.body || {};
    let existingEntry = null;
    let priorRaw = null;
    let priorBodyHtml = null;
    let mode = "new";

    if (fillExistingId) {
      const manifest = await readLogManifest(worldId);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing log entry found with id '${fillExistingId}'` });
      }
      mode = existingEntry.locked ? "fill" : "regenerate";
      if (mode === "regenerate") {
        const prior = await readLogEntry(worldId, fillExistingId);
        priorRaw = prior && prior.raw ? prior.raw : null;
        priorBodyHtml = prior ? prior.bodyHtml : null;
      }
      name = existingEntry.name;
      // Subtitle format: "Terminal — The Board" - first segment is the type.
      const typeGuess = (existingEntry.subtitle || "").split("—")[0].trim();
      if (/terminal/i.test(typeGuess)) logType = "Terminal";
      else if (/audio/i.test(typeGuess)) logType = "Audio";
      else if (/journal/i.test(typeGuess)) logType = "Journal";
    }

    const rosterContext = await buildLogRosterContext(worldId);
    // Logs pick their own faction (including "none"), so this doesn't
    // filter lore by a target faction — same behavior as before, just
    // routed through the generic lore helper instead of worldBible.js.
    const loreContext = await getLoreContext(worldId, { category: "logs" });
    const settingContext = await getSettingContext(worldId);
    const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

    const contentSystemPrompt = buildLogContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, logType, existingContent: priorRaw });
    const contentRaw = await callClaude({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the log now.",
      maxTokens: 1500
    });
    let log;
    try {
      log = parseJsonResponse(contentRaw);
    } catch (parseErr) {
      console.error("Failed to parse log JSON. Raw response length:", contentRaw.length);
      console.error("Raw response (last 300 chars):", contentRaw.slice(-300));
      throw new Error(`Log content was not valid JSON (likely truncated — response was ${contentRaw.length} chars): ${parseErr.message}`);
    }
    log.id = fillExistingId || log.id || slugify(log.name);
    if (existingEntry) log.name = existingEntry.name;

    if (mode === "regenerate") {
      const newBodyHtmlPreview = buildLogBodyHtml(log);
      return res.json({
        preview: true,
        mode: "regenerate",
        category: "logs",
        id: log.id,
        name: log.name,
        entry: log,
        newBodyHtmlPreview,
        oldBodyHtmlPreview: priorBodyHtml
      });
    }

    // No image step - logs are text-only artifacts, no portrait in the real archive.
    await saveLogEntry(worldId, log);

    res.json({
      preview: false,
      id: log.id,
      name: log.name,
      logType: log.logType,
      hasHexTongue: !!log.hexTongue,
      summary: log.designNotes
    });
  } catch (err) {
    console.error("Log generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
