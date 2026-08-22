// routes/generateSessionPacket.js
//
// Session Prep Companion, Phase 4 (Tier B -- see
// session_prep_companion_scope.md Section 3). Full generative prep
// document for a Quest or Campaign, same weight-class as any other
// generator: built on lib/sessionAssembly.js's Phase 1 plumbing (roster
// resolve, map link, prior-Chronicle pull), goes through the standard
// preview -> confirm flow (POST /api/confirm-entry, category
// "session-packets" -- see routes/confirmEntry.js's WRITERS map).
//
// UNLIKE most other categories, a brand-new Session Packet ("new", no
// fillExistingId) still returns a PREVIEW rather than saving directly --
// this is deliberate, matching the scope doc's explicit instruction that
// this category "goes through the existing preview→confirm pattern" for
// every generation, not just regenerates. A Session Packet is a pricier,
// more deliberate artifact than a routine NPC/Item; a DM should always
// review it before it's archived.
//
// Session Prep Companion, Phase 9 -- quota/billing wiring (scope doc
// Section 7.7): a Session Packet generation costs the same as any other
// generation, 1 unit = POINTS_PER_GENERATION (5) points, whether "new"
// or a regenerate (fillExistingId set) -- same as every one of the 7
// pre-existing generate routes, no special-casing for this category.
// enforceGenerationCap must run BEFORE enforceEntryCapOnGenerate (see
// that middleware's own header comment): it needs req.refundGeneration
// to already exist so it can refund a charged-but-blocked-by-entry-cap
// request rather than silently burning points for zero output.

const express = require("express");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { callClaudeExpectingJson } = require("../lib/claude");
const { getEntry } = require("../lib/entriesRepo");
const { assembleSessionContext, formatRosterContextText } = require("../lib/sessionAssembly");
const { buildSessionPacketSystemPrompt } = require("../prompts/sessionPacketPrompt");
const { buildSessionPacketBodyHtml, slugify } = require("../lib/sessionPacketTemplate");
const { getSettingContext } = require("../lib/worldFlavor");
const { getLoreContext } = require("../lib/loreContext");
const { getCalendarConfig } = require("../lib/worldConfigRepo");
const { formatWorldDate } = require("../lib/calendar");

const router = express.Router();

// Which of a Quest's own ENTRY_READERS categories a scene beat/NPC-voice
// reference is allowed to tag -- matches lib/sessionAssembly.js's
// ENTRY_READERS set (everything a Quest's entries_json can carry).
const TAGGABLE_CATEGORIES = new Set(["npcs", "locations", "items", "logs", "enemies", "survivors", "classes", "factions"]);

// Flattens assembleSessionContext()'s per-quest resolvedEntries into one
// lookup, keyed by "category:entryId" -> { category, entryId, name,
// entry }. A Campaign's assembly already covers every Quest it
// references, so this same flattening works unchanged for either a bare
// Quest or a whole Campaign.
function buildRosterLookup(context) {
  const lookup = new Map();
  for (const q of context.quests) {
    for (const ref of q.resolvedEntries) {
      lookup.set(`${ref.category}:${ref.entryId}`, { category: ref.category, entryId: ref.entryId, name: ref.entry.name, entry: ref.entry });
    }
  }
  return lookup;
}

function buildMapContextText(context) {
  const maps = context.quests.flatMap((q) => q.dungeonMaps);
  if (!maps.length) return "";
  return maps.map((m) => `- ${m.locationName}: ${m.dungeonMap.imageUrl}`).join("\n");
}

function buildPriorChroniclesContextText(context, calendarConfig) {
  if (!context.priorChronicles.length) return "";
  return context.priorChronicles
    .map((c) => {
      const chronicle = c.sessionChronicle || {};
      const dateText = chronicle.worldDate ? formatWorldDate({ year: chronicle.worldDate.year, monthIndex: chronicle.worldDate.monthIndex, day: chronicle.worldDate.day }, calendarConfig) : "";
      return `- Session ${chronicle.sessionNumber || "?"}${dateText ? ` (${dateText})` : ""}: ${c.name} — ${c.subtitle || ""}`;
    })
    .join("\n");
}

// Validates and hydrates a model-proposed { category, entryId, ... } ref
// against the real roster -- drops anything that doesn't resolve rather
// than trusting it (the "reference real ids, never invent" rule this
// whole category is built around). Returns null for an unresolvable ref.
function resolveRef(ref, rosterLookup) {
  if (!ref || !ref.category || !ref.entryId) return null;
  if (!TAGGABLE_CATEGORIES.has(ref.category)) return null;
  const match = rosterLookup.get(`${ref.category}:${ref.entryId}`);
  if (!match) return null;
  return { ...ref, name: match.name };
}

function sanitizePacket(proposal, rosterLookup) {
  const sceneBeats = (Array.isArray(proposal.sceneBeats) ? proposal.sceneBeats : []).map((beat) => ({
    title: beat.title || "",
    description: beat.description || "",
    taggedEntries: (Array.isArray(beat.taggedEntries) ? beat.taggedEntries : [])
      .map((ref) => resolveRef(ref, rosterLookup))
      .filter(Boolean)
  }));
  const npcVoiceReminders = (Array.isArray(proposal.npcVoiceReminders) ? proposal.npcVoiceReminders : [])
    .map((r) => resolveRef({ category: "npcs", entryId: r.entryId, reminder: r.reminder }, rosterLookup))
    .filter(Boolean)
    .map((r) => ({ entryId: r.entryId, name: r.name, reminder: r.reminder }));
  const complicationsDeck = (Array.isArray(proposal.complicationsDeck) ? proposal.complicationsDeck : [])
    .map((c) => ({ title: c.title || "", description: c.description || "" }));
  const openThreads = (Array.isArray(proposal.openThreads) ? proposal.openThreads : []).filter((t) => typeof t === "string" && t.trim());

  return {
    title: proposal.title || "Session Packet",
    openingReadAloud: proposal.openingReadAloud || "",
    sceneBeats,
    npcVoiceReminders,
    complicationsDeck,
    openThreads
  };
}

async function buildContextAndPrompt(worldId, { questId, campaignId, concept }) {
  const context = await assembleSessionContext(worldId, { questId, campaignId });
  const rosterLookup = buildRosterLookup(context);
  const calendarConfig = await getCalendarConfig(worldId);

  const settingContext = await getSettingContext(worldId);
  const loreContext = await getLoreContext(worldId, {});
  const rosterContext = formatRosterContextText(context);
  const mapContext = buildMapContextText(context);
  const priorChroniclesContext = buildPriorChroniclesContextText(context, calendarConfig);

  const systemPrompt = buildSessionPacketSystemPrompt({ settingContext, loreContext, rosterContext, mapContext, priorChroniclesContext, concept });
  return { context, rosterLookup, systemPrompt };
}

router.post("/generate-session-packet", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { questId, campaignId, fillExistingId, concept } = req.body || {};

    let effectiveQuestId = questId;
    let effectiveCampaignId = campaignId;
    let priorRaw = null;
    let priorBodyHtml = null;
    let packetId = fillExistingId || null;

    if (fillExistingId) {
      const prior = await getEntry(worldId, "session-packets", fillExistingId);
      if (!prior) {
        return res.status(404).json({ error: `No existing session packet found with id '${fillExistingId}'` });
      }
      priorRaw = prior.raw || null;
      priorBodyHtml = prior.bodyHtml;
      effectiveQuestId = priorRaw && priorRaw.questId;
      effectiveCampaignId = priorRaw && priorRaw.campaignId;
    }

    if (!effectiveQuestId && !effectiveCampaignId) {
      return res.status(400).json({ error: "Pass a questId or campaignId (or fillExistingId to regenerate an existing packet)." });
    }

    const { context, rosterLookup, systemPrompt } = await buildContextAndPrompt(worldId, { questId: effectiveQuestId, campaignId: effectiveCampaignId, concept });

    const proposal = await callClaudeExpectingJson({
      systemPrompt,
      userMessage: "Generate the Session Packet now.",
      maxTokens: 3000,
      requiredKeys: ["title", "openingReadAloud", "sceneBeats"]
    });
    const cleaned = sanitizePacket(proposal, rosterLookup);

    const questName = context.quests.length === 1 ? context.quests[0].quest.name : null;
    const campaignName = context.campaign ? context.campaign.name : null;

    packetId = packetId || slugify(cleaned.title);
    const packet = {
      ...cleaned,
      id: packetId,
      questId: effectiveQuestId || null,
      campaignId: effectiveCampaignId || null,
      questName,
      campaignName,
      dungeonMaps: context.quests.flatMap((q) => q.dungeonMaps),
      generatedAt: Date.now()
    };

    const newBodyHtmlPreview = buildSessionPacketBodyHtml(packet);
    res.json({
      preview: true,
      mode: fillExistingId ? "regenerate" : "new",
      category: "session-packets",
      id: packet.id,
      name: packet.title,
      entry: packet,
      newBodyHtmlPreview,
      oldBodyHtmlPreview: priorBodyHtml || null
    });
  } catch (err) {
    console.error("Session Packet generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
