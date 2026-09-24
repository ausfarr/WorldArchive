// routes/timeline.js
//
// Session Prep Companion, Phase 6 -- read-only listing for the Timeline
// of Events. Pure aggregation already happened at confirm-time (see
// lib/timelineEvents.js) -- this route is just a GET, no generation cost,
// same "thin route, real logic lives in lib/" convention as everywhere
// else.

const express = require("express");
const { listTimelineEvents } = require("../lib/timelineRepo");
const { decorateTimelineEvents } = require("../lib/timelineDecorate");
const { backfillEntryDateEvents } = require("../lib/timelineEvents");
const { getCalendarConfig } = require("../lib/worldConfigRepo");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const {
  extractLoreDateProposals, confirmLoreDateEvents, listLoreSections, MissingLoreDateMigrationError
} = require("../lib/loreDateExtraction");

const router = express.Router();

router.get("/timeline-events", async (req, res) => {
  try {
    // Live names + deleted flags for display (bug batch 1 audit, items
    // 6-7) -- stored events themselves are never rewritten.
    const events = await decorateTimelineEvents(req.worldId, await listTimelineEvents(req.worldId));
    res.json({ events });
  } catch (err) {
    console.error("Loading timeline events failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Bug batch 1, Phase 4 -- the Timeline page's "Sync timeline" button.
// Adds a Timeline event for every entry date that validates against the
// current calendar and isn't on the Timeline yet. Additive only and
// idempotent (lib/timelineEvents.js#backfillEntryDateEvents); no AI, no
// quota. Also runs automatically after every calendar save
// (routes/wizardCalendar.js).
router.post("/timeline/sync-entry-dates", async (req, res) => {
  try {
    const calendarConfig = await getCalendarConfig(req.worldId);
    const result = await backfillEntryDateEvents(req.worldId, calendarConfig);
    res.json(result);
  } catch (err) {
    console.error("Timeline sync failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Bug batch 1, Phase 4 -- "Find dates in lore". Runs BEFORE
// enforceGenerationCap so a request that can't possibly produce anything
// (no calendar to date against, no lore to read) is refused without
// charging a generation.
async function requireCalendarAndLore(req, res, next) {
  try {
    const calendarConfig = await getCalendarConfig(req.worldId);
    if (!calendarConfig || !Array.isArray(calendarConfig.months) || !calendarConfig.months.length) {
      return res.status(400).json({ error: "no_calendar", message: "Set up your world's calendar first -- dates need one to land on." });
    }
    const sections = (await listLoreSections(req.worldId)).filter((s) => s.content && s.content.trim());
    if (!sections.length) {
      return res.status(400).json({ error: "no_lore", message: "This world has no saved lore to read dates from yet." });
    }
    req.loreCalendarConfig = calendarConfig;
    req.loreSections = sections;
    next();
  } catch (err) {
    next(err);
  }
}

// Costs one full generation (Austin's call), refunded on any failure.
// Returns proposals only -- nothing is written here.
router.post("/timeline/extract-lore-dates", requireAiEnabled, requireCalendarAndLore, enforceGenerationCap, async (req, res) => {
  try {
    const result = await extractLoreDateProposals(req.worldId, req.loreCalendarConfig, req.loreSections);
    res.json(result);
  } catch (err) {
    console.error("Lore date extraction failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

// Writes the proposals the DM ticked. Free (the AI call was already paid
// for); everything is re-validated server-side.
router.post("/timeline/confirm-lore-dates", async (req, res) => {
  try {
    const calendarConfig = await getCalendarConfig(req.worldId);
    if (!calendarConfig) return res.status(400).json({ error: "no_calendar", message: "Set up your world's calendar first." });
    const result = await confirmLoreDateEvents(req.worldId, (req.body || {}).events, calendarConfig);
    res.json(result);
  } catch (err) {
    if (err instanceof MissingLoreDateMigrationError) {
      console.error(err.message);
      return res.status(409).json({ error: err.code, message: "Couldn't save these yet -- the app needs a database update (migration 039). Nothing was saved; try again once it's applied." });
    }
    console.error("Confirming lore dates failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
