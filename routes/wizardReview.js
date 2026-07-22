const express = require("express");
const { getDraft, getFullConfig, markSetupComplete } = require("../lib/worldConfigRepo");
const { listLoreSections } = require("../lib/loreRepo");

const router = express.Router();

// Pure aggregation -- no Claude calls. Pulls together everything saved
// across Steps 1-7 into one payload for the summary screen.
router.get("/wizard/review", async (req, res) => {
  try {
    const [draft, config, loreSections] = await Promise.all([
      getDraft(req.worldId),
      getFullConfig(req.worldId),
      listLoreSections(req.worldId)
    ]);

    res.json({
      step1: draft["1"] || {},
      loreSections: loreSections.map((s) => ({ title: s.title, core: s.core, categoryTags: s.category_tags })),
      factions: config.factions_json || [],
      statSystem: config.stat_system_json || null,
      styleGuide: config.style_guide_json || null,
      categoryConfig: config.category_config_json || null,
      setupCompletedAt: config.setup_completed_at || null
    });
  } catch (err) {
    console.error("Building review summary failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/confirm", async (req, res) => {
  try {
    const config = await markSetupComplete(req.worldId);
    res.json({ setupCompletedAt: config.setup_completed_at });
  } catch (err) {
    console.error("Confirming setup failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
