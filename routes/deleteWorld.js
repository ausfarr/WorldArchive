const express = require("express");
const { resetWorldConfig, getGenerationCount, FREE_MONTHLY_GENERATION_CAP } = require("../lib/worldConfigRepo");
const { clearLoreSections } = require("../lib/loreRepo");
const { deleteAllEntries } = require("../lib/entriesRepo");
const { deleteAllCampaignModules } = require("../lib/campaignModuleRepo");
const { deleteAllCampaignArcs } = require("../lib/campaignArcRepo");
const { deleteAllPortraits, deleteMapBackdrop, deleteAllMapTiles, deleteAllWorldArt } = require("../lib/fileWriter");
const { deleteAllTimelineEvents } = require("../lib/timelineRepo");
const { deleteAllPendingUpdates } = require("../lib/pendingEntryUpdatesRepo");
const { deleteAllNotableDates } = require("../lib/calendarNotableDatesRepo");

const router = express.Router();

// Legacy endpoint, kept for backward compatibility -- the Settings page
// now calls /api/billing/status (routes/billing.js) instead, which
// covers both free-account and subscribed states. This one only ever
// reflects the free-account monthly cap now
// (FREE_MONTHLY_GENERATION_CAP, from lib/worldConfigRepo.js) since it has
// no concept of a subscription. Read-only, doesn't touch the counter.
router.get("/generation-usage", async (req, res) => {
  try {
    const used = await getGenerationCount(req.worldId);
    res.json({ used, cap: FREE_MONTHLY_GENERATION_CAP, remaining: Math.max(0, FREE_MONTHLY_GENERATION_CAP - used) });
  } catch (err) {
    console.error("Loading generation usage failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Wipes everything a world has ever generated and sends the user back to
// a fresh wizard -- but keeps their Supabase Auth account and worlds row
// intact (same world_id, same login). Austin's explicit call: "delete
// world" means start over, not delete the account.
//
// Order matters here: entries/Quests/Campaigns and portraits first (the
// expensive, generated content), then wizard config/lore last, since
// those are what the frontend checks to decide whether to redirect into
// the wizard.
//
// Quests (campaign_modules), Campaigns (campaign_arcs), Timeline events,
// Suggested Updates (pending_entry_updates), and Calendar notable dates
// all have an ON DELETE CASCADE foreign key to worlds(id), but that
// constraint only fires if the `worlds` row itself is deleted -- which
// this flow deliberately never does. Without an explicit delete here,
// each of these tables silently survived a "Delete World" while every
// other category of content correctly disappeared -- same category of
// gap as deleteAllEntries needing to exist explicitly at all. The latter
// three (added in later Session Prep Companion phases, after this
// comment was first written for Quests/Campaigns) had the same gap for
// weeks before anyone noticed -- worth remembering the next time a new
// world-scoped table is added.
//
// Deliberately does NOT touch generation_count (the beta usage cap in
// worldConfigRepo.js / middleware/enforceGenerationCap.js). If it did,
// "Delete World" would double as "reset my cap" -- letting a tester
// delete-and-recreate their way past the 25-generation limit, which
// defeats the whole point of the cap existing. The cap tracks the
// account, not the current world's content. Same reasoning applies to
// world_config.entries_purchased (v0.9 Manual Mode) -- that's money
// already spent on this world's capacity, not content, so it stays.
router.post("/world/delete", async (req, res) => {
  try {
    const worldId = req.worldId;
    await deleteAllEntries(worldId);
    await deleteAllCampaignModules(worldId);
    await deleteAllCampaignArcs(worldId);
    await deleteAllTimelineEvents(worldId);
    await deleteAllPendingUpdates(worldId);
    await deleteAllNotableDates(worldId);
    await deleteAllPortraits(worldId);
    await deleteMapBackdrop(worldId);
    await deleteAllMapTiles(worldId);
    await deleteAllWorldArt(worldId);
    await resetWorldConfig(worldId);
    await clearLoreSections(worldId);
    res.json({ deleted: true });
  } catch (err) {
    console.error("Delete world failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
