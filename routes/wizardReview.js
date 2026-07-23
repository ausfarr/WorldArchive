const express = require("express");
const { getDraft, getFullConfig, markSetupComplete } = require("../lib/worldConfigRepo");
const { listLoreSections } = require("../lib/loreRepo");
const { listEntries } = require("../lib/entriesRepo");
const { generateFactionDeepLore } = require("../lib/factionDeepLore");
const { saveFactionEntry } = require("../lib/fileWriter");

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

router.post("/wizard/confirm", async (req, res) => {
  try {
    const worldId = req.worldId;

    // First-pass auto-upgrade: every faction bridged in at Step 4 still
    // has the wizard's simplified stub layout (Politics/Government/
    // Economy/Military/Tensions) rather than the real Deep Lore template
    // (Origin/Core Philosophy/Structure & Hierarchy/Territory/Goals/
    // Internal Tensions/Iconography/Relationships/Economy & Resources/
    // Joining) that routes/generateFaction.js's manual "Regenerate"
    // produces -- see lib/factionDeepLore.js, shared by both paths. This
    // also happens to be what makes a faction's own `faction`/`factionKey`
    // fields self-consistent, since the wizard bridge leaves them null.
    // Rather than requiring a manual per-faction regenerate click right
    // after finishing setup, run that same upgrade automatically for
    // every faction here, once -- all in parallel (Promise.allSettled)
    // since a world has at most 8 factions, well within safe concurrent
    // Claude API usage, and parallel cuts total wait time from
    // roughly (8 x single-faction latency) down to roughly one.
    // Failures are per-faction and non-fatal -- one bad generation
    // shouldn't block completing setup; it can still be regenerated
    // manually later like any other entry. Accent colors (if the Style
    // Guide step generated them) are untouched by this -- see
    // lib/fileWriter.js's saveFactionEntry, which always preserves
    // whatever accentColor is already on record.
    const factionEntries = await listEntries(worldId, "factions");
    const results = await Promise.allSettled(
      factionEntries.map(async (entry) => {
        const { faction, roundupRows } = await generateFactionDeepLore(worldId, entry.id);
        await saveFactionEntry(worldId, faction, roundupRows);
      })
    );
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(`First-pass faction upgrade failed for '${factionEntries[i].id}':`, result.reason && result.reason.message);
      }
    });

    const config = await markSetupComplete(worldId);
    res.json({ setupCompletedAt: config.setup_completed_at });
  } catch (err) {
    console.error("Confirming setup failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
