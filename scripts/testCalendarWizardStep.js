// scripts/testCalendarWizardStep.js
//
// Bug batch 1, Phase 3 (session_addendum_bug_batch_1.md): the calendar as
// a wizard step, route level. Drives the REAL routes/wizardCalendar.js,
// routes/wizard.js, routes/wizardFactions.js and routes/wizardReview.js
// over HTTP against scripts/lib/fakeSupabase.js. Only the Anthropic call
// is stubbed (global.fetch) -- no real/paid AI call is ever made.
//
// Covers:
//   - GET /wizard/calendar-presets works with AI turned OFF (no quota,
//     no requireAiEnabled) and returns the lib/calendarPresets.js data.
//   - POST /wizard/generate-calendar repairs a wrong-length weekday list
//     instead of nulling it (the "D1..D7 / wrong week names" root cause),
//     never saves, and IS gated by the AI toggle.
//   - GET /wizard/calendar-config reports setupCompletedAt (drives
//     wizard-calendar.html's wizard vs. edit mode + the Factions guard).
//   - save validation, and POST /wizard/calendar-impact counting (never
//     mutating) stored dates a change would invalidate.
//   - Start Over (POST /wizard/reset) clears calendar_config now that
//     the calendar is a wizard step.
//   - Wizard factions: with a calendar saved BEFORE Factions (the new
//     step order), "Expand Factions" Deep Lore gets the calendar in its
//     prompt and saves a structured foundingDate.
//
// Usage: node scripts/testCalendarWizardStep.js

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key-not-real";

let aiCalls = 0;
let lastFactionSystemPrompt = "";
const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (!String(url).includes("anthropic.com")) return originalFetch(url, opts);
  aiCalls++;
  const body = JSON.parse(opts.body);
  const system = Array.isArray(body.system) ? body.system.map((b) => b.text).join("\n") : body.system;
  let payload;
  if (/calendar system/.test(system)) {
    // 8-day week but only 6 names -- the case that used to null the list.
    payload = {
      eraName: "Age of Tides", daysPerWeek: 8,
      weekdayNames: ["Brineday", "Shoalday", "Reefday", "Kelpday", "Tideday", "Foamday"],
      months: [{ name: "Ebb", days: 30 }, { name: "Flow", days: 32 }], startingYear: 412
    };
  } else if (/FACTION NAME: (.+)/.test(system)) {
    lastFactionSystemPrompt = system;
    payload = {
      nickname: "n", overviewQuote: "q", origin: "o", corePhilosophy: "p", structureHierarchy: "s",
      territory: "t. t.", goalsNearTerm: "g", goalsLongTerm: "g", internalTensions: "i", iconography: "i",
      relationships: [], economyResources: "e", joining: "j",
      foundingDate: { year: 380, monthIndex: 1, day: 17 }
    };
  } else {
    throw new Error("Unexpected Anthropic call");
  }
  return {
    ok: true, status: 200,
    json: async () => ({ content: [{ type: "text", text: JSON.stringify(payload) }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" })
  };
};

const fake = require("./lib/fakeSupabase");
fake.install();
const { db } = fake;

const express = require("express");
const { getEntry } = require("../lib/entriesRepo");
const { listCalendarPresets } = require("../lib/calendarPresets");

const USER = "test-user-calendar-step";
const WORLD = "33333333-3333-3333-3333-333333333333";

const failures = [];
function check(label, condition, detail) {
  console.log(`  ${condition ? "PASS" : "FAIL"} - ${label}${!condition && detail !== undefined ? `  (${JSON.stringify(detail)})` : ""}`);
  if (!condition) failures.push(label);
}

async function call(port, method, path, body) {
  const res = await originalFetch(`http://127.0.0.1:${port}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body || {})
  });
  return { status: res.status, body: await res.json() };
}

const worldConfig = () => db.world_config.find((r) => r.world_id === WORLD);

async function main() {
  console.log("== Calendar wizard step (fakeSupabase, stubbed AI) ==\n");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = USER; req.worldId = WORLD; next(); });
  app.use("/api", require("../routes/wizardCalendar"));
  app.use("/api", require("../routes/wizard"));
  app.use("/api", require("../routes/wizardFactions"));
  app.use("/api", require("../routes/wizardReview"));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const port = server.address().port;

  try {
    // ---- fresh world ----
    let r = await call(port, "GET", "/wizard/calendar-config");
    check("fresh world: no calendar, setup not complete (wizard mode + Factions guard applies)",
      r.status === 200 && r.body.calendarConfig === null && r.body.setupCompletedAt === null, r.body);

    // ---- presets with AI OFF ----
    db.user_settings.push({ user_id: USER, ai_enabled: false });
    r = await call(port, "GET", "/wizard/calendar-presets");
    check("presets load with AI turned off", r.status === 200 && r.body.presets.length === listCalendarPresets().length);
    check("presets carry full calendar configs", r.body.presets.every((p) => p.calendarConfig && p.calendarConfig.months.length > 0));
    r = await call(port, "POST", "/wizard/generate-calendar");
    check("generate-calendar refused with AI off", r.status === 403 && aiCalls === 0, r);
    db.user_settings[0].ai_enabled = true;

    // ---- generate: weekday repair, never saves ----
    r = await call(port, "POST", "/wizard/generate-calendar");
    const gen = r.body.calendarConfig;
    check("generate: 200, exactly one AI call", r.status === 200 && aiCalls === 1);
    check("generate: 6 names for an 8-day week are kept + padded, not nulled",
      gen.days_per_week === 8 && Array.isArray(gen.weekday_names) && gen.weekday_names.length === 8
      && gen.weekday_names[0] === "Brineday" && gen.weekday_names[6] === "Day 7" && gen.weekday_names[7] === "Day 8", gen.weekday_names);
    check("generate: nothing saved", !(worldConfig() && worldConfig().calendar_config));

    // ---- save: validation ----
    r = await call(port, "POST", "/wizard/save-calendar-config", { calendarConfig: { ...gen, weekday_names: ["only one"] } });
    check("save rejects a weekday list that doesn't match days_per_week", r.status === 400);
    r = await call(port, "POST", "/wizard/save-calendar-config", { calendarConfig: { ...gen, current_date: { year: 1, month_index: 5, day: 1 } } });
    check("save rejects an out-of-range current month", r.status === 400);

    // ---- save a preset (the Calendar step's Continue) ----
    const earth = listCalendarPresets().find((p) => p.id === "earth").calendarConfig;
    const sos = listCalendarPresets().find((p) => p.id === "sword-and-sorcery").calendarConfig;
    r = await call(port, "POST", "/wizard/save-calendar-config", { calendarConfig: { ...earth, current_date: { year: 400, month_index: 0, day: 1 } } });
    check("save a preset-based calendar", r.status === 200 && worldConfig().calendar_config.months.length === 12);

    // ---- wizard factions get the calendar ----
    await call(port, "POST", "/wizard/save-factions", { factions: [{ name: "The Tide Court", concept: "sea lords" }] });
    r = await call(port, "POST", "/wizard/upgrade-factions");
    const faction = await getEntry(WORLD, "factions", "the-tide-court");
    check("Expand Factions: Deep Lore prompt includes this world's calendar",
      /Months \(monthIndex: name \(days\)\): 0: January/.test(lastFactionSystemPrompt) && !/no calendar configured yet/.test(lastFactionSystemPrompt));
    check("Expand Factions: structured foundingDate saved on the faction",
      r.status === 200 && faction && faction.raw.foundingDate && faction.raw.foundingDate.year === 380 && faction.raw.foundingDate.monthIndex === 1,
      faction && faction.raw.foundingDate);

    // ---- impact check: counts, never mutates ----
    db.timeline_events = db.timeline_events || [];
    db.timeline_events.push({ id: "te-1", world_id: WORLD, source_type: "chronicle", summary: "Storm", world_date: { year: 399, monthIndex: 10, day: 30 }, created_at: "2026-01-01" });
    db.calendar_notable_dates = db.calendar_notable_dates || [];
    db.calendar_notable_dates.push({ id: "nd-1", world_id: WORLD, name: "Midwinter", month_index: 11, day: 21 });
    const before = JSON.stringify([db.timeline_events, db.calendar_notable_dates, faction.raw.foundingDate]);
    r = await call(port, "POST", "/wizard/calendar-impact", { calendarConfig: { ...sos, current_date: { year: 400, month_index: 0, day: 1 } } });
    check("impact: switching to 9 months flags the Timeline event and notable date in months 11-12",
      r.status === 200 && r.body.impact && r.body.impact.timelineEvents === 1 && r.body.impact.notableDates === 1, r.body);
    check("impact: the faction's February founding date still fits (1 month in, 40-day months)", r.body.impact.entryDateFields === 0, r.body.impact);
    const facAfter = await getEntry(WORLD, "factions", "the-tide-court");
    check("impact: nothing was mutated", JSON.stringify([db.timeline_events, db.calendar_notable_dates, facAfter.raw.foundingDate]) === before);
    r = await call(port, "POST", "/wizard/calendar-impact", { calendarConfig: { months: [] } });
    check("impact: a malformed proposal reports its shape error instead of counts", r.status === 200 && !!r.body.shapeError && !r.body.impact);

    // ---- review summary carries the calendar ----
    r = await call(port, "GET", "/wizard/review");
    check("review summary includes calendarConfig", r.status === 200 && r.body.calendarConfig && r.body.calendarConfig.months[0].name === "January");

    // ---- setup-complete world: status reported, reset refused w/o force ----
    worldConfig().setup_completed_at = "2026-09-01T00:00:00.000Z";
    r = await call(port, "GET", "/wizard/calendar-config");
    check("setup-complete world: calendar-config reports setupCompletedAt (edit mode)", !!r.body.setupCompletedAt && !!r.body.calendarConfig);
    r = await call(port, "POST", "/wizard/reset", {});
    check("auto-reset still refused for a setup-complete world (calendar kept)", r.status === 409 && !!worldConfig().calendar_config);

    // ---- Start Over clears the calendar ----
    r = await call(port, "POST", "/wizard/reset", { force: true });
    check("Start Over (force reset) clears calendar_config", r.status === 200 && worldConfig().calendar_config === null);
  } finally {
    server.close();
  }

  if (failures.length) {
    console.log(`\nRESULT: ${failures.length} check(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("\nRESULT: all checks passed.");
  process.exit(0);
}

main().catch((err) => { console.error("Test crashed:", err); process.exit(1); });
