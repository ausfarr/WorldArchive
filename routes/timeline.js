// routes/timeline.js
//
// Session Prep Companion, Phase 6 -- read-only listing for the Timeline
// of Events. Pure aggregation already happened at confirm-time (see
// lib/timelineEvents.js) -- this route is just a GET, no generation cost,
// same "thin route, real logic lives in lib/" convention as everywhere
// else.

const express = require("express");
const { listTimelineEvents } = require("../lib/timelineRepo");

const router = express.Router();

router.get("/timeline-events", async (req, res) => {
  try {
    const events = await listTimelineEvents(req.worldId);
    res.json({ events });
  } catch (err) {
    console.error("Loading timeline events failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
