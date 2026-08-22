// routes/calendarNotableDates.js
//
// Session Prep Companion, Phase 8 -- DM-added recurring notable dates
// (Section 4a-ii) for the Full Calendar Page. Plain list/create/delete --
// no generation involved (the scope doc's optional "generate a holiday
// for me" helper is deliberately deferred, see this phase's commit
// summary), no cap/points system either (same as Timeline's read-only
// route and the accentColor/manualMapPosition-style small edits
// elsewhere -- this isn't content generation).

const express = require("express");
const { listNotableDates, createNotableDate, deleteNotableDate } = require("../lib/calendarNotableDatesRepo");
const { getCalendarConfig } = require("../lib/worldConfigRepo");
const { validateMonthDay } = require("../lib/calendar");

const router = express.Router();

router.get("/calendar/notable-dates", async (req, res) => {
  try {
    const dates = await listNotableDates(req.worldId);
    res.json({ dates });
  } catch (err) {
    console.error("Loading notable dates failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/calendar/notable-dates", async (req, res) => {
  try {
    const { name, monthIndex, day, note } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required." });
    }
    const calendarConfig = await getCalendarConfig(req.worldId);
    const validation = validateMonthDay(monthIndex, day, calendarConfig);
    if (!validation.valid) return res.status(400).json({ error: validation.reason });

    const created = await createNotableDate(req.worldId, { name: name.trim(), monthIndex, day, note: note ? String(note).trim() : null });
    res.json({ date: created });
  } catch (err) {
    console.error("Creating notable date failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/calendar/notable-dates/:id", async (req, res) => {
  try {
    const deleted = await deleteNotableDate(req.worldId, req.params.id);
    if (!deleted) return res.status(404).json({ error: "Notable date not found." });
    res.json({ deleted: true });
  } catch (err) {
    console.error("Deleting notable date failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
