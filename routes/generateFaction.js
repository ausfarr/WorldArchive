const express = require("express");
const { generateFactionDeepLore, createNewFaction } = require("../lib/factionDeepLore");
const { buildFactionBodyHtml } = require("../lib/factionTemplate");
const { saveFactionEntry } = require("../lib/fileWriter");

const router = express.Router();

router.post("/generate-faction", async (req, res) => {
  try {
    const worldId = req.worldId;
    const { fillExistingId, name, concept } = req.body || {};

    if (fillExistingId) {
      // Existing faction -- expand/revise its Deep Lore. This always
      // goes through preview/confirm (routes/confirmEntry.js), same as
      // every other category's regenerate, since it's replacing content
      // a person may already be looking at.
      const { faction, roundupRows, priorBodyHtml } = await generateFactionDeepLore(worldId, fillExistingId);
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
    const { faction, roundupRows } = await createNewFaction(worldId, { name, concept });
    await saveFactionEntry(worldId, faction, roundupRows);

    res.json({
      preview: false,
      id: faction.id,
      name: faction.name,
      summary: faction.corePhilosophy || faction.concept
    });
  } catch (err) {
    console.error("Faction generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
