// routes/wizardCalendar.js
//
// World Calendar storage + generate-for-me. Originally (Session Prep
// Companion, Phase 2) reached only from the Settings page, deliberately
// NOT a wizard step, to avoid renumbering a shipped linear flow.
//
// Bug batch 1, Phase 3 reversed that call (session_addendum_bug_batch_1.md):
// the calendar is now a REQUIRED wizard step between Lore and Factions
// (archive/wizard-calendar.html), so factions and every later generation
// can propose real structured dates from day one instead of null. The
// renumbering risk is contained: calendar_config was already its own
// world_config column, so draft_json's "1".."8" keys are untouched and
// only the visible "Step N of 9" labels changed. The Settings editor is
// gone; already-completed worlds reach the same page in edit mode.
//
// Routes:
//   GET  /wizard/calendar-config       -- current calendar + setupCompletedAt
//   GET  /wizard/calendar-presets      -- non-AI templates (lib/calendarPresets.js)
//   POST /wizard/generate-calendar     -- AI proposal, never saved here
//   POST /wizard/calendar-impact       -- counts stored dates a proposed
//                                         calendar would invalidate (read-only)
//   POST /wizard/save-calendar-config  -- validate + save

const express = require("express");
const { callClaudeExpectingJson } = require("../lib/claude");
const { getDraft, getFullConfig, saveCalendarConfig } = require("../lib/worldConfigRepo");
const { validateCalendarConfigShape, repairWeekdayNames, countDatesInvalidatedByCalendar, DATE_FIELDS_BY_CATEGORY } = require("../lib/calendar");
const { listCalendarPresets } = require("../lib/calendarPresets");
const { listTimelineEvents } = require("../lib/timelineRepo");
const { listNotableDates } = require("../lib/calendarNotableDatesRepo");
const { listEntries } = require("../lib/entriesRepo");
const { getLoreContext } = require("../lib/loreContext");
const { buildWizardCalendarPrompt } = require("../prompts/wizardCalendarPrompt");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");

const router = express.Router();

// setupCompletedAt rides along so wizard-calendar.html can pick its mode
// (in-flow wizard step vs. post-setup edit) and wizard-factions.html can
// tell whether its "no calendar yet -> back to the calendar step" guard
// applies, without a second round trip.
router.get("/wizard/calendar-config", async (req, res) => {
  try {
    const config = await getFullConfig(req.worldId);
    res.json({ calendarConfig: config.calendar_config || null, setupCompletedAt: config.setup_completed_at || null });
  } catch (err) {
    console.error("Loading calendar config failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// No AI, no quota, no requireAiEnabled -- presets exist precisely so an
// AI-off DM has a starting point.
router.get("/wizard/calendar-presets", (req, res) => {
  res.json({ presets: listCalendarPresets() });
});

// requireAiEnabled, not enforceGenerationCap -- same as every other
// wizard-step generate-for-me call, stays free of the points/cap system.
router.post("/wizard/generate-calendar", requireAiEnabled, async (req, res) => {
  try {
    const draft = await getDraft(req.worldId);
    const step1 = draft["1"] || {};
    const loreContext = await getLoreContext(req.worldId, {});

    const systemPrompt = buildWizardCalendarPrompt({ step1, loreContext });
    const proposal = await callClaudeExpectingJson({
      systemPrompt,
      userMessage: "Generate the calendar now.",
      maxTokens: 1200
    });

    // Model writes narrative (names/flavor), code validates
    // structure/math before this ever reaches the DM's save step --
    // clamp/repair rather than trust raw numbers straight through.
    const months = Array.isArray(proposal.months) && proposal.months.length
      ? proposal.months.map((m) => ({
          name: (m && m.name && String(m.name).trim()) || "Unnamed Month",
          days: clampInt(m && m.days, 20, 40, 30)
        }))
      : [{ name: "Firstmonth", days: 30 }];

    const daysPerWeek = clampInt(proposal.daysPerWeek, 4, 10, 7);
    // Repair, don't discard: a count mismatch used to null the whole
    // list, and the Calendar page then showed "D1..D7" headers (bug batch
    // 1, bug 3). Extras are truncated; missing ones become "Day N"
    // placeholders the editor highlights for renaming.
    const weekdayNames = repairWeekdayNames(proposal.weekdayNames, daysPerWeek);

    const calendarConfig = {
      months,
      days_per_week: daysPerWeek,
      weekday_names: weekdayNames,
      era_name: (proposal.eraName && String(proposal.eraName).trim()) || "",
      current_date: { year: clampInt(proposal.startingYear, 1, 100000, 1), month_index: 0, day: 1 }
    };

    res.json({ calendarConfig });
  } catch (err) {
    console.error("Calendar generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// validateCalendarConfigShape now lives in lib/calendar.js, shared with
// scripts/testCalendarPresets.js.

// Read-only preview for the editor's "this change would invalidate N
// stored dates" warning. Never writes -- existing dates are left exactly
// as they are whatever the DM decides. An invalid proposed shape reports
// the shape error instead of counts (the save would reject it anyway).
router.post("/wizard/calendar-impact", async (req, res) => {
  try {
    const { calendarConfig } = req.body || {};
    const shapeError = validateCalendarConfigShape(calendarConfig);
    if (shapeError) return res.json({ shapeError });
    const [timelineEvents, notableDates, ...entryLists] = await Promise.all([
      listTimelineEvents(req.worldId),
      listNotableDates(req.worldId),
      ...Object.keys(DATE_FIELDS_BY_CATEGORY).map((category) =>
        listEntries(req.worldId, category).then((rows) => rows.map((r) => ({ ...r, category }))))
    ]);
    const impact = countDatesInvalidatedByCalendar(calendarConfig, { timelineEvents, notableDates, entries: entryLists.flat() });
    res.json({ impact });
  } catch (err) {
    console.error("Calendar impact check failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/save-calendar-config", async (req, res) => {
  try {
    const { calendarConfig } = req.body || {};
    const validationError = validateCalendarConfigShape(calendarConfig);
    if (validationError) return res.status(400).json({ error: validationError });
    const saved = await saveCalendarConfig(req.worldId, calendarConfig);
    res.json({ calendarConfig: saved });
  } catch (err) {
    console.error("Saving calendar config failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
