const express = require("express");
const path = require("path");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { buildLogRosterContext } = require("../lib/roster");
const { buildLogContentSystemPrompt } = require("../prompts/logContentPrompt");
const { writeLogDataFile, appendToLogManifest } = require("../lib/fileWriter");
const { slugify } = require("../lib/logTemplate");

const router = express.Router();
const ARCHIVE_ROOT = path.join(__dirname, "..", "archive");

router.post("/generate-log", async (req, res) => {
  try {
    const { name, logType } = req.body || {};

    const rosterContext = buildLogRosterContext(ARCHIVE_ROOT);

    const contentSystemPrompt = buildLogContentSystemPrompt({ rosterContext, name, logType });
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
    if (!log.id) log.id = slugify(log.name);

    // No image step - logs are text-only artifacts, no portrait in the real archive.
    writeLogDataFile(ARCHIVE_ROOT, log);
    appendToLogManifest(ARCHIVE_ROOT, log);

    res.json({
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
