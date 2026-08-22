// routes/generateSessionChronicle.js
//
// Session Prep Companion, Phase 5 -- Session Chronicle generation (a
// Logs sub-type, see prompts/sessionChroniclePrompt.js's header for why
// this deliberately reuses the Logs category/template rather than
// introducing a new one). Takes a DM's freeform recap notes plus
// whatever Session Packet (Phase 4) was most recently generated for the
// same Quest/Campaign (if any), and produces an in-setting Chronicle
// entry -- same preview -> confirm flow as every other category, using
// the EXISTING /generate-log-shaped write path (routes/confirmEntry.js's
// WRITERS.logs = saveLogEntry, unchanged from Phase 3), since a
// Chronicle IS a Log once generated.
//
// Date handling (scope doc Section 4a-i): resolvedDate defaults to this
// world's calendar_config.current_date so the confirm-step UI has
// something sensible pre-filled, but it's fully DM-editable before
// confirming (the frontend's date-entry control patches entry.resolvedDate
// AND entry.sessionChronicle.worldDate together before POSTing to
// /api/confirm-entry) -- this route never advances current_date itself,
// only proposes a starting point.

const express = require("express");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { callClaudeExpectingJson } = require("../lib/claude");
const { getEntry } = require("../lib/entriesRepo");
const { assembleSessionContext, formatRosterContextText } = require("../lib/sessionAssembly");
const { getNextSessionNumber, findLatestSessionPacketFor } = require("../lib/sessionChronicle");
const { buildSessionChronicleSystemPrompt } = require("../prompts/sessionChroniclePrompt");
const { buildLogBodyHtml, slugify } = require("../lib/logTemplate");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");
const { buildLocationRosterContext } = require("../lib/roster");
const { getLoreContext } = require("../lib/loreContext");
const { getCalendarConfig } = require("../lib/worldConfigRepo");
const { validateWorldDate } = require("../lib/calendar");
const { resolveReferencesForEntry } = require("../lib/entryLinker");

const router = express.Router();

// Formats a Session Packet's own structured fields into plain text for
// the Chronicle prompt's "what was planned" block -- deliberately just
// the DM-facing narrative parts (opening/beats/threads), not the whole
// raw object, since the model only needs to know the PLAN's shape to
// compare it against the recap notes.
function formatSessionPacketContext(packet) {
  if (!packet) return "";
  const beats = (packet.sceneBeats || []).map((b, i) => `  Beat ${i + 1} (${b.title}): ${b.description}`).join("\n");
  return `Title: ${packet.title}
Opening: ${packet.openingReadAloud}
Planned beats:
${beats || "(none)"}`;
}

router.post("/generate-session-chronicle", requireAiEnabled, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { questId, campaignId, recapNotes, fillExistingId } = req.body || {};

    let effectiveQuestId = questId;
    let effectiveCampaignId = campaignId;
    let priorRaw = null;
    let priorBodyHtml = null;
    let chronicleId = fillExistingId || null;

    if (fillExistingId) {
      const prior = await getEntry(worldId, "logs", fillExistingId);
      if (!prior || !prior.raw || !prior.raw.sessionChronicle) {
        return res.status(404).json({ error: `No existing Session Chronicle found with id '${fillExistingId}'` });
      }
      priorRaw = prior.raw;
      priorBodyHtml = prior.bodyHtml;
      effectiveQuestId = priorRaw.sessionChronicle.questId;
      effectiveCampaignId = priorRaw.sessionChronicle.campaignId;
    }

    if (!effectiveQuestId && !effectiveCampaignId) {
      return res.status(400).json({ error: "Pass a questId or campaignId (or fillExistingId to regenerate an existing Chronicle)." });
    }
    const notes = (recapNotes || "").trim();
    if (!notes) {
      return res.status(400).json({ error: "Recap notes are required to generate a Chronicle." });
    }

    const context = await assembleSessionContext(worldId, { questId: effectiveQuestId, campaignId: effectiveCampaignId });
    const rosterContext = formatRosterContextText(context);
    const sessionPacket = await findLatestSessionPacketFor(worldId, { questId: effectiveQuestId, campaignId: effectiveCampaignId });

    const settingContext = await getSettingContext(worldId);
    const loreContext = await getLoreContext(worldId, { category: "logs" });
    const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
    const locationRosterText = await buildLocationRosterContext(worldId);
    const calendarConfig = await getCalendarConfig(worldId);

    const systemPrompt = buildSessionChronicleSystemPrompt({
      settingContext, loreContext, factionOptionsText, locationRosterText, rosterContext,
      recapNotes: notes,
      sessionPacketContext: formatSessionPacketContext(sessionPacket),
      existingContent: priorRaw
    });
    const proposal = await callClaudeExpectingJson({
      systemPrompt,
      userMessage: "Generate the Session Chronicle now.",
      maxTokens: 2000,
      requiredKeys: ["name", "bodyText"]
    });

    chronicleId = chronicleId || slugify(proposal.name || proposal.id || "session-chronicle");

    const linkResult = await resolveReferencesForEntry(worldId, "logs", { ...proposal, id: chronicleId });
    const log = linkResult.raw;
    log.id = chronicleId;
    log.logType = "Journal"; // Chronicles are always an in-setting journal-style record, see prompts/sessionChroniclePrompt.js's header

    // Session number: keep the prior Chronicle's own number on a
    // regenerate (it doesn't get a new slot in the global sequence just
    // because its prose was revised); assign the next one for a new
    // Chronicle.
    const sessionNumber = (priorRaw && priorRaw.sessionChronicle && priorRaw.sessionChronicle.sessionNumber) || await getNextSessionNumber(worldId);

    // Default world date: this world's current_date, per scope doc
    // Section 4a-i -- the DM edits this via the confirm-step date
    // control before it's ever written; this route just proposes a
    // sensible starting point, never advances current_date itself.
    const current = calendarConfig && calendarConfig.current_date;
    const defaultWorldDate = current ? { year: current.year, monthIndex: current.month_index, day: current.day } : null;
    const worldDate = (priorRaw && priorRaw.sessionChronicle && priorRaw.sessionChronicle.worldDate) || defaultWorldDate;

    log.resolvedDate = worldDate;
    log.sessionChronicle = {
      questId: effectiveQuestId || null,
      campaignId: effectiveCampaignId || null,
      sessionNumber,
      worldDate
    };

    const newBodyHtmlPreview = buildLogBodyHtml(log, calendarConfig);
    res.json({
      preview: true,
      mode: fillExistingId ? "regenerate" : "new",
      category: "logs",
      id: log.id,
      name: log.name,
      entry: log,
      newBodyHtmlPreview,
      oldBodyHtmlPreview: priorBodyHtml || null,
      calendarConfig
    });
  } catch (err) {
    console.error("Session Chronicle generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Small, standalone validation endpoint the Recap page's date-entry
// control calls before confirm, so a DM gets an inline "day 31 doesn't
// exist in Ashfall" error instead of a generic confirm-entry failure.
// confirm-entry.js still re-validates/sanitizes server-side regardless
// (see lib/calendar.js's sanitizeEntryDateFields) -- this is purely a
// nicer UX round-trip, not the actual guarantee.
router.post("/validate-world-date", async (req, res) => {
  try {
    const calendarConfig = await getCalendarConfig(req.worldId);
    const result = validateWorldDate(req.body && req.body.date, calendarConfig);
    res.json(result);
  } catch (err) {
    console.error("Validating world date failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
