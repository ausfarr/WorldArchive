// routes/wizardCalendar.js
//
// Session Prep Companion, Phase 2 -- minimal Calendar (see
// session_prep_companion_scope.md Section 4a-i). Lives alongside the
// other world_config-backed settings routes (wizardStatSystem.js,
// wizardStyleGuide.js) but is reached from the Settings page rather than
// a new step in the 8-step setup wizard -- see this session's Phase 2
// commit summary for why: the wizard is a shipped, linear flow real beta
// worlds have already completed (setup_completed_at set), and every step
// number is baked into wizard.html's nav, wizard-review.html's summary,
// and draft_json's own "1".."8" step keys. Inserting a new step mid-
// sequence would mean renumbering all of that for a field that, like
// Stat System/Style Guide, is really just one more independent
// world_config column -- a standalone settings action carries the same
// "generate for me + manual edit" wizard-step pattern without that
// renumbering risk. Kept the "wizard" file/route naming (matching
// wizardStatSystem.js etc.) since this is still config storage, not a
// generation route.

const express = require("express");
const { callClaudeExpectingJson } = require("../lib/claude");
const { getDraft, getCalendarConfig, saveCalendarConfig } = require("../lib/worldConfigRepo");
const { getLoreContext } = require("../lib/loreContext");
const { buildWizardCalendarPrompt } = require("../prompts/wizardCalendarPrompt");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");

const router = express.Router();

router.get("/wizard/calendar-config", async (req, res) => {
  try {
    const calendarConfig = await getCalendarConfig(req.worldId);
    res.json({ calendarConfig });
  } catch (err) {
    console.error("Loading calendar config failed:", err);
    res.status(500).json({ error: err.message });
  }
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
    let weekdayNames = Array.isArray(proposal.weekdayNames) ? proposal.weekdayNames.map((w) => String(w).trim()).filter(Boolean) : [];
    if (weekdayNames.length !== daysPerWeek) weekdayNames = null; // don't guess a mismatched list -- DM can fill it in manually

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

function validateCalendarConfigShape(calendarConfig) {
  if (!calendarConfig || typeof calendarConfig !== "object") return "calendarConfig is required.";
  if (!Array.isArray(calendarConfig.months) || calendarConfig.months.length === 0) {
    return "At least one month is required.";
  }
  for (const m of calendarConfig.months) {
    if (!m || typeof m.name !== "string" || !m.name.trim()) return "Every month needs a name.";
    if (!Number.isInteger(m.days) || m.days < 1) return `Month "${m.name}" needs a positive whole number of days.`;
  }
  if (!Number.isInteger(calendarConfig.days_per_week) || calendarConfig.days_per_week < 1) {
    return "days_per_week must be a positive whole number.";
  }
  if (calendarConfig.weekday_names != null) {
    if (!Array.isArray(calendarConfig.weekday_names) || calendarConfig.weekday_names.length !== calendarConfig.days_per_week) {
      return "weekday_names, if set, must have exactly days_per_week entries.";
    }
  }
  const cd = calendarConfig.current_date;
  if (!cd || !Number.isInteger(cd.year) || !Number.isInteger(cd.month_index) || !Number.isInteger(cd.day)) {
    return "current_date must have integer year, month_index, and day.";
  }
  if (cd.month_index < 0 || cd.month_index >= calendarConfig.months.length) {
    return "current_date.month_index is out of range for the given months.";
  }
  const month = calendarConfig.months[cd.month_index];
  if (cd.day < 1 || cd.day > month.days) {
    return `current_date.day must be between 1 and ${month.days} for ${month.name}.`;
  }
  return null;
}

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
