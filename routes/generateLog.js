const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { callClaudeExpectingJson } = require("../lib/claude");
const { buildLogRosterContext, readLogManifest, readLogEntry, buildLocationRosterContext } = require("../lib/roster");
const { buildLogContentSystemPrompt } = require("../prompts/logContentPrompt");
const { saveLogEntry } = require("../lib/fileWriter");
const { slugify, buildLogBodyHtml } = require("../lib/logTemplate");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");
const { createNewLog } = require("../lib/campaignEntryGenerators");
const { resolveReferencesForEntry, backfillReferencesFromNewEntry, ensureGhostPlaceholder } = require("../lib/entryLinker");
const { requireSubscriptionToRegenerate } = require("../lib/regenerateGate");

const router = express.Router();

// Entry cross-linking (Phase 2) -- see lib/entryLinker.js.
async function afterSave(worldId, category, savedContent, unresolvedGhosts) {
  await backfillReferencesFromNewEntry(worldId, category, savedContent);
  for (const ghost of unresolvedGhosts || []) {
    await ensureGhostPlaceholder(worldId, ghost.category, ghost.name);
  }
}

router.post("/generate-log", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, logType, fillExistingId } = req.body || {};

    if (!fillExistingId) {
      const result = await createNewLog(worldId, { name, logType });
      return res.json({ preview: false, ...result });
    }

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
        const gate = await requireSubscriptionToRegenerate(req);
        if (!gate.allowed) {
          if (req.refundGeneration) await req.refundGeneration();
          return res.status(403).json(gate.body);
        }
        const prior = await readLogEntry(worldId, fillExistingId);
        priorRaw = prior && prior.raw ? prior.raw : null;
        priorBodyHtml = prior ? prior.bodyHtml : null;
      }
      name = existingEntry.name;
      // existingEntry.logType is already a real, structured field --
      // entriesRepo.js's rowToManifestEntry spreads the entry's raw_json
      // (which is exactly where fileWriter.js's saveLogEntry stores
      // `logType`) onto every manifest row. The previous version instead
      // tried to guess the type by parsing existingEntry.subtitle for
      // "Terminal — The Board"-shaped text, but a log's stored subtitle
      // is actually "Character(s): ..." (see saveLogEntry's entryMeta),
      // never that shape -- so the guess silently failed on every single
      // regenerate, leaving logType undefined and letting the type
      // (Audio/Journal/Terminal) drift on every regenerate of an
      // existing log.
      logType = existingEntry.logType || logType;
    }

    const rosterContext = await buildLogRosterContext(worldId);
    const locationRosterText = await buildLocationRosterContext(worldId);
    // Logs pick their own faction (including "none"), so this doesn't
    // filter lore by a target faction — same behavior as before, just
    // routed through the generic lore helper instead of worldBible.js.
    const loreContext = await getLoreContext(worldId, { category: "logs" });
    const settingContext = await getSettingContext(worldId);
    const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

    const contentSystemPrompt = buildLogContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, locationRosterText, name, logType, existingContent: priorRaw });
    let log = await callClaudeExpectingJson({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the log now.",
      maxTokens: 1500
    });
    log.id = fillExistingId || log.id || slugify(log.name);
    if (existingEntry) log.name = existingEntry.name;

    const linkResult = await resolveReferencesForEntry(worldId, "logs", log);
    log = linkResult.raw;

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
    await afterSave(worldId, "logs", log, linkResult.unresolvedGhosts);

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
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
