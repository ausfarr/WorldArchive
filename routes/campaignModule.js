// routes/campaignModule.js
//
// Campaign Structure -- see session_addendum_campaign_structure_scope.md.
// Storage: the new campaign_modules table (lib/campaignModuleRepo.js),
// not the shared `entries` table -- a Campaign Module isn't a 9th
// content category, it's a structure that REFERENCES existing NPCs/
// Locations/Items/Logs by id.
//
// Two ways to build one, same final shape either way:
//   1. Manual -- POST /campaign-modules directly with a DM-picked
//      entries array. No AI call, no cap impact.
//   2. AI-assisted -- POST /campaign-modules/generate returns a PREVIEW
//      only (nothing saved yet, cap-gated). Any unmatched slot can then
//      be filled via POST /campaign-modules/generate-slot-entry (cap-
//      gated, creates a real new entry in its normal category) before
//      the DM finally saves via the same POST /campaign-modules used by
//      the manual path.

const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { callClaudeExpectingJson } = require("../lib/claude");
const { buildCampaignModuleSystemPrompt } = require("../prompts/campaignModulePrompt");
const { buildRosterContext, buildLocationRosterContext, buildItemRosterContext, buildLogRosterContext, buildEnemyRosterContext } = require("../lib/roster");
const { getSettingContext } = require("../lib/worldFlavor");
const { getLoreContext } = require("../lib/loreContext");
const { getEntry } = require("../lib/entriesRepo");
const { createNewNpc, createNewLocation, createNewItem, createNewLog, createNewEnemy } = require("../lib/campaignEntryGenerators");
const {
  listCampaignModules,
  getCampaignModule,
  createCampaignModule,
  updateCampaignModule,
  deleteCampaignModule
} = require("../lib/campaignModuleRepo");

const router = express.Router();

const VALID_ENTRY_CATEGORIES = new Set(["npcs", "locations", "items", "logs", "enemies"]);
const SLOT_GENERATORS = { npcs: createNewNpc, locations: createNewLocation, items: createNewItem, logs: createNewLog, enemies: createNewEnemy };

router.get("/campaign-modules", async (req, res) => {
  try {
    const modules = await listCampaignModules(req.worldId);
    res.json({ modules });
  } catch (err) {
    console.error("Loading campaign modules failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/campaign-modules/:id", async (req, res) => {
  try {
    const mod = await getCampaignModule(req.worldId, req.params.id);
    if (!mod) return res.status(404).json({ error: "Campaign Module not found." });
    res.json({ module: mod });
  } catch (err) {
    console.error("Loading campaign module failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST generate -- cap-gated, PREVIEW ONLY, nothing saved. Each
// "matched": true entry from the model is re-verified against the real
// archive (a hallucinated/stale id falls back to unmatched rather than
// being trusted blind) and hydrated with its display name/subtitle for
// the preview UI, since the model only returns bare ids.
router.post("/campaign-modules/generate", enforceGenerationCap, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { concept } = req.body || {};

    const [npcRosterText, locationRosterText, itemRosterText, logRosterText, enemyRosterText, settingContext, loreContext] = await Promise.all([
      buildRosterContext(worldId),
      buildLocationRosterContext(worldId),
      buildItemRosterContext(worldId),
      buildLogRosterContext(worldId),
      buildEnemyRosterContext(worldId),
      getSettingContext(worldId),
      getLoreContext(worldId, {})
    ]);

    const systemPrompt = buildCampaignModuleSystemPrompt({ settingContext, loreContext, npcRosterText, locationRosterText, itemRosterText, logRosterText, enemyRosterText, concept });
    const proposal = await callClaudeExpectingJson({ systemPrompt, userMessage: "Assemble the Campaign Module now.", maxTokens: 2000 });

    const rawEntries = Array.isArray(proposal.entries) ? proposal.entries : [];
    const hydratedEntries = await Promise.all(rawEntries.map(async (e) => {
      const category = VALID_ENTRY_CATEGORIES.has(e.category) ? e.category : "npcs";
      if (e.matched && e.entryId) {
        const real = await getEntry(worldId, category, e.entryId);
        if (real) {
          return { category, entryId: real.id, name: real.name, subtitle: real.subtitle || null, role: e.role || "", note: e.note || "", matched: true };
        }
        // Model claimed a match that doesn't actually exist -- fall back
        // to unmatched rather than trusting it, same defensive posture
        // as everywhere else real ids get validated against the live
        // archive rather than assumed correct.
      }
      return { category, entryId: null, name: null, subtitle: null, role: e.role || "", note: e.note || "", matched: false, neededConcept: e.neededConcept || e.note || "" };
    }));

    res.json({
      preview: true,
      name: proposal.name || "New Campaign Module",
      summary: proposal.summary || "",
      entries: hydratedEntries
    });
  } catch (err) {
    console.error("Campaign Module generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST generate-slot-entry -- cap-gated. Fills ONE unmatched slot with a
// brand-new, REAL, immediately-saved entry in its normal category (see
// lib/campaignEntryGenerators.js's header comment for why it's saved for
// real even before the Campaign Module itself is confirmed -- if the DM
// ends up discarding the module preview, the new entry isn't wasted,
// it's just sitting in its category tab like anything else generated
// standalone). Returns the same shape as a "matched" preview entry so
// the frontend can splice it directly into its local preview state.
router.post("/campaign-modules/generate-slot-entry", enforceGenerationCap, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { category, concept } = req.body || {};
    const generator = SLOT_GENERATORS[category];
    if (!generator) {
      return res.status(400).json({ error: `Unknown category '${category}' for a Campaign Module slot.` });
    }
    const result = await generator(worldId, { campaignContext: concept });
    res.json({
      category,
      entryId: result.id,
      name: result.name,
      subtitle: result.subtitle || null,
      matched: true
    });
  } catch (err) {
    console.error("Campaign Module slot-entry generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST create -- final save, used by BOTH the manual path (DM builds
// entries from scratch) and confirming an AI preview (entries array is
// exactly what /generate + any /generate-slot-entry calls already
// produced). Not cap-gated -- no AI call happens here, purely a write.
router.post("/campaign-modules", async (req, res) => {
  try {
    const { name, summary, status, entries, createdVia } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "A Campaign Module needs a name." });
    }
    const cleanEntries = (Array.isArray(entries) ? entries : [])
      .filter((e) => e && e.entryId && VALID_ENTRY_CATEGORIES.has(e.category))
      .map((e) => ({ category: e.category, entryId: e.entryId, role: e.role || "", note: e.note || "" }));

    const mod = await createCampaignModule(req.worldId, {
      name: String(name).trim(),
      summary: summary || "",
      status: status || "planned",
      entries: cleanEntries,
      createdVia: createdVia === "ai" ? "ai" : "manual"
    });
    res.json({ module: mod });
  } catch (err) {
    console.error("Saving campaign module failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/campaign-modules/:id", async (req, res) => {
  try {
    const { name, summary, status, entries } = req.body || {};
    const patch = {};
    if (name !== undefined) patch.name = String(name).trim();
    if (summary !== undefined) patch.summary = summary;
    if (status !== undefined) patch.status = status;
    if (entries !== undefined) {
      patch.entries = (Array.isArray(entries) ? entries : [])
        .filter((e) => e && e.entryId && VALID_ENTRY_CATEGORIES.has(e.category))
        .map((e) => ({ category: e.category, entryId: e.entryId, role: e.role || "", note: e.note || "" }));
    }
    const mod = await updateCampaignModule(req.worldId, req.params.id, patch);
    res.json({ module: mod });
  } catch (err) {
    console.error("Updating campaign module failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/campaign-modules/:id", async (req, res) => {
  try {
    await deleteCampaignModule(req.worldId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Deleting campaign module failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
