const express = require("express");
const { generateFactionDeepLore } = require("../lib/factionDeepLore");
const { buildFactionBodyHtml } = require("../lib/factionTemplate");

const router = express.Router();

router.post("/generate-faction", async (req, res) => {
  try {
    const worldId = req.worldId;
    const { fillExistingId } = req.body || {};
    if (!fillExistingId) {
      return res.status(400).json({ error: "Missing fillExistingId" });
    }

    const { faction, roundupRows, priorBodyHtml } = await generateFactionDeepLore(worldId, fillExistingId);
    const newBodyHtmlPreview = buildFactionBodyHtml(faction, roundupRows);

    res.json({
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
  } catch (err) {
    console.error("Faction generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
