const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { generateFactionDeepLore, createNewFaction, syncReciprocalRelationships } = require("../lib/factionDeepLore");
const { buildFactionBodyHtml } = require("../lib/factionTemplate");
const { saveFactionEntry } = require("../lib/fileWriter");
const { resolveReferencesForEntry, backfillReferencesFromNewEntry, ensureGhostPlaceholder } = require("../lib/entryLinker");

const router = express.Router();

// Entry cross-linking (Phase 2) -- see lib/entryLinker.js.
async function afterSave(worldId, category, savedContent, unresolvedGhosts) {
  await backfillReferencesFromNewEntry(worldId, category, savedContent);
  for (const ghost of unresolvedGhosts || []) {
    await ensureGhostPlaceholder(worldId, ghost.category, ghost.name);
  }
}

router.post("/generate-faction", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { fillExistingId, name, concept } = req.body || {};

    if (fillExistingId) {
      // Existing faction -- expand/revise its Deep Lore. This always
      // goes through preview/confirm (routes/confirmEntry.js), same as
      // every other category's regenerate, since it's replacing content
      // a person may already be looking at.
      let { faction, roundupRows, priorBodyHtml } = await generateFactionDeepLore(worldId, fillExistingId);
      const linkResult = await resolveReferencesForEntry(worldId, "factions", faction);
      faction = linkResult.raw;
      const newBodyHtmlPreview = buildFactionBodyHtml(faction, roundupRows);

      return res.json({
        preview: true,
        mode: "regenerate",
        category: "factions",
        id: faction.id,
        name: faction.name,
        entry: faction,
        newBodyHtmlPreview,
        oldBodyHtmlPreview: priorBodyHtml,
        roundupEntryCount: roundupRows.length
      });
    }

    // No fillExistingId -- a brand-new faction, optional name + optional
    // concept/description, same "Generate New Entry" shape every other
    // category already has. Saved directly, no preview step, matching
    // how a new npc/enemy/item/class/survivor is created.
    let { faction, roundupRows } = await createNewFaction(worldId, { name, concept });
    const linkResult = await resolveReferencesForEntry(worldId, "factions", faction);
    faction = linkResult.raw;

    await saveFactionEntry(worldId, faction, roundupRows);
    await syncReciprocalRelationships(worldId, faction);
    await afterSave(worldId, "factions", faction, linkResult.unresolvedGhosts);

    res.json({
      preview: false,
      id: faction.id,
      name: faction.name,
      summary: faction.corePhilosophy || faction.concept
    });
  } catch (err) {
    console.error("Faction generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
