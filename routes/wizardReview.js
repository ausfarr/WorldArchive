const express = require("express");
const { getDraft, getFullConfig, markSetupComplete } = require("../lib/worldConfigRepo");
const { listLoreSections } = require("../lib/loreRepo");
const { listEntries } = require("../lib/entriesRepo");
const { generateFactionDeepLore } = require("../lib/factionDeepLore");
const { saveFactionEntry } = require("../lib/fileWriter");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");

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
      loreSections: loreSections.map((s) => ({ title: s.title, content: s.content, core: s.core, categoryTags: s.category_tags })),
      factions: config.factions_json || [],
      statSystem: config.stat_system_json || null,
      skillSystem: config.skill_system_json || null,
      styleGuide: config.style_guide_json || null,
      categoryConfig: config.category_config_json || null,
      setupCompletedAt: config.setup_completed_at || null
    });
  } catch (err) {
    console.error("Building review summary failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Upgrades every existing faction from the wizard's simplified stub
// layout (Politics/Government/Economy/Military/Tensions) to the full
// Deep Lore template (Origin/Core Philosophy/Structure & Hierarchy/
// Territory/Goals/Internal Tensions/Iconography/Relationships/Economy &
// Resources/Joining) -- see lib/factionDeepLore.js's header comment for
// the two schemas. Used to run automatically and unconditionally as
// part of /wizard/confirm; now a separate, optional step the Review page
// (Step 8) offers as an explicit choice ("Expand Factions" vs "Finish
// As-Is"), same pattern as Step 6's World Art choice -- see
// session_addendum_manual_wizard_path_shipped.md for why. A world that
// skips this keeps its Step-4 stub-layout faction entries, which are
// already complete, real, non-AI entries in the archive (bridged at
// save-factions time) -- not a placeholder state. Any faction can still
// be upgraded later, one at a time, via the existing manual "Regenerate"
// button on its dossier page (routes/generateFaction.js), which calls
// this exact same lib/factionDeepLore.js function.
//
// All in parallel (Promise.allSettled) since a world has at most 8
// factions, well within safe concurrent Claude API usage. Failures are
// per-faction and non-fatal -- one bad generation shouldn't block the
// rest.
//
// requireAiEnabled gates this like every other AI-spend route -- this
// was previously missing here (a real gap: this is a Claude call per
// faction) despite every other wizard generate route having it added.
router.post("/wizard/upgrade-factions", requireAiEnabled, async (req, res) => {
  try {
    const worldId = req.worldId;
    const factionEntries = await listEntries(worldId, "factions");
    const results = await Promise.allSettled(
      factionEntries.map(async (entry) => {
        const { faction, roundupRows } = await generateFactionDeepLore(worldId, entry.id);
        await saveFactionEntry(worldId, faction, roundupRows);
        return entry.id;
      })
    );
    const upgraded = [];
    const failed = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        upgraded.push(result.value);
      } else {
        failed.push(factionEntries[i].id);
        console.error(`Faction upgrade failed for '${factionEntries[i].id}':`, result.reason && result.reason.message);
      }
    });
    res.json({ upgraded, failed });
  } catch (err) {
    console.error("Upgrading factions failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Marks setup complete. No Claude calls -- the faction Deep Lore upgrade
// used to run here unconditionally; it's now the separate, optional
// /wizard/upgrade-factions route above, called (or not) from the Review
// page before this.
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
