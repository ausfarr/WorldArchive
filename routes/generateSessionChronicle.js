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
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
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
const { validateImpliedUpdates } = require("../lib/sessionChronicleSuggestions");
const { requireSubscriptionToRegenerate } = require("../lib/regenerateGate");

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

router.post("/generate-session-chronicle", requireAiEnabled, async (req, res) => {
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
      // v1.1 split-quota pricing (lib/regenerateGate.js) -- regenerating
      // an already-generated Chronicle is the same "revising existing
      // content" action as any other category's Regenerate, so it gets
      // the same subscriber-only gate (a no-op while BILLING_ENABLED is
      // off). Checked here, before the bundled/standalone points charge
      // below, so a blocked regenerate never charges points it would
      // then need to refund. A brand-new Chronicle ("new", no
      // fillExistingId) is unaffected.
      const gate = await requireSubscriptionToRegenerate(req);
      if (!gate.allowed) {
        if (req.refundGeneration) await req.refundGeneration();
        return res.status(403).json(gate.body);
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

    const sessionPacket = await findLatestSessionPacketFor(worldId, { questId: effectiveQuestId, campaignId: effectiveCampaignId });

    // Session Prep Companion, Phase 9 -- quota/billing wiring (scope doc
    // Section 7.7). The scope doc leaves open whether a Chronicle
    // generation costs its own 5 credits or rides on the Packet it
    // followed's charge; flagged assumption going into this phase (see
    // its commit message): BUNDLED when a Session Packet already exists
    // for this quest/campaign (coarse-grained -- "already exists" for
    // this quest/campaign at all, not tied to a specific session number
    // -- there's no per-session pairing mechanism between a Packet and
    // the Chronicle that recaps it anywhere else in this codebase, and
    // building one is out of scope for pinning down this billing
    // question), STANDALONE-CHARGED (its own 5 credits, same unit as
    // every other generation) when generated with no preceding Packet at
    // all. Applies identically to new vs. regenerate (fillExistingId) --
    // the bundling question is about whether a Packet already covered
    // this quest/campaign's session-prep cost, not about which specific
    // generation call this is.
    //
    // Calling enforceGenerationCap/enforceEntryCapOnGenerate directly
    // (rather than as declarative route middleware) because the
    // bundling decision needs effectiveQuestId/effectiveCampaignId --
    // only known after resolving fillExistingId above -- and because
    // enforceGenerationCap is itself conditional here, unlike every
    // other generate route. Order still matters the same way it does
    // everywhere else (see enforceEntryCap.js's own header comment):
    // enforceGenerationCap first so its req.refundGeneration exists for
    // enforceEntryCapOnGenerate to call if IT then blocks.
    if (!sessionPacket) {
      let proceeded = false;
      await enforceGenerationCap(req, res, () => { proceeded = true; });
      if (!proceeded) return; // enforceGenerationCap already sent the 403
    }
    let entryCapProceeded = false;
    await enforceEntryCapOnGenerate(req, res, () => { entryCapProceeded = true; });
    if (!entryCapProceeded) return; // already sent the 403 (and refunded points above if any were charged)

    const context = await assembleSessionContext(worldId, { questId: effectiveQuestId, campaignId: effectiveCampaignId });
    const rosterContext = formatRosterContextText(context);

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
    // Session Prep Companion, Phase 7 -- validated now (preview time) so
    // the DM only ever sees implied updates that resolve to real
    // entries; re-validated again at confirm time (lib/
    // sessionChronicleSuggestions.js) since the archive can change in
    // between.
    log.impliedUpdates = await validateImpliedUpdates(worldId, proposal.impliedUpdates);

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
    if (req.refundGeneration) await req.refundGeneration();
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
