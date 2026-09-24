// scripts/testLoreDateExtraction.js
//
// Bug batch 1, Phase 4 (session_addendum_bug_batch_1.md): "Find dates in
// lore". Drives the REAL routes/timeline.js endpoints over HTTP against
// scripts/lib/fakeSupabase.js with the legacy (BILLING_ENABLED unset)
// generation cap; only the Anthropic call is stubbed -- no real/paid AI
// call is ever made.
//
// Covers:
//   - No calendar / no lore -> refused BEFORE the generation is charged.
//   - Extraction charges exactly one generation, and refunds it when the
//     AI call fails.
//   - Code-side validation of model proposals: verbatim-quote check (the
//     hallucination guard), calendar range + year bounds, approximate /
//     year-precision dates, in-batch dedupe, and a flagged (not dropped)
//     possible duplicate of an existing structured entry-date event.
//   - Confirm writes only what's sent, re-validates it (a tampered date is
//     skipped), is idempotent, and reports a clear 409 when migration 039
//     hasn't been run -- writing nothing.
//   - "c. Year 512" formatting for approximate / year-precision dates.
//
// Usage: node scripts/testLoreDateExtraction.js

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key-not-real";
delete process.env.BILLING_ENABLED;

let aiMode = "ok";
let aiCalls = 0;
const originalFetch = global.fetch;
const LORE = [
  "## The Founding",
  "The Iron Pact was sworn on the 12th of Ashfall in the year 640, under a red sky.",
  "Three centuries ago the river Vell changed its course and drowned the old capital.",
  "The Salt Choir first sang in Frostmere of 790."
].join("\n");
global.fetch = async (url, opts) => {
  if (!String(url).includes("anthropic.com")) return originalFetch(url, opts);
  aiCalls++;
  if (aiMode === "fail") throw new Error("simulated Anthropic outage");
  const events = [
    // valid, exact day
    { summary: "The Iron Pact was sworn", year: 640, monthIndex: 1, day: 12, precision: "day", approximate: false, sectionTitle: "The Founding", quote: "The Iron Pact was sworn on the 12th of Ashfall in the year 640" },
    // valid, relative -> approximate year (812 - 300)
    { summary: "The river Vell drowned the old capital", year: 512, monthIndex: null, day: null, precision: "year", approximate: true, sectionTitle: "The Founding", quote: "Three centuries ago the river Vell changed its course" },
    // valid, month precision
    { summary: "The Salt Choir first sang", year: 790, monthIndex: 0, day: null, precision: "month", approximate: false, sectionTitle: "The Founding", quote: "The Salt Choir first sang in Frostmere of 790." },
    // quote not in the lore -> dropped (hallucination guard)
    { summary: "A dragon burned the western fields", year: 700, monthIndex: 0, day: 3, precision: "day", approximate: false, sectionTitle: "The Founding", quote: "a dragon burned the western fields" },
    // month out of range -> dropped
    { summary: "The Iron Pact was sworn again", year: 641, monthIndex: 7, day: 1, precision: "day", approximate: false, sectionTitle: "The Founding", quote: "under a red sky" },
    // exact repeat of the first -> deduped within the batch
    { summary: "The Iron Pact was sworn", year: 640, monthIndex: 1, day: 12, precision: "day", approximate: false, sectionTitle: "The Founding", quote: "The Iron Pact was sworn on the 12th of Ashfall" }
  ];
  return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ events }) }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" }) };
};

const fake = require("./lib/fakeSupabase");
fake.install();
const { db } = fake;

const express = require("express");
const { supabase } = require("../lib/supabaseClient");
const { formatWorldDate } = require("../lib/calendar");
const { listTimelineEvents, createTimelineEvent } = require("../lib/timelineRepo");

const WORLD = "55555555-5555-5555-5555-555555555555";
const USER = "test-user-lore-dates";
const CAL = {
  months: [{ name: "Frostmere", days: 30 }, { name: "Ashfall", days: 28 }],
  days_per_week: 7, weekday_names: null, era_name: "Age of Ash",
  current_date: { year: 812, month_index: 1, day: 10 }
};

const failures = [];
function check(label, condition, detail) {
  console.log(`  ${condition ? "PASS" : "FAIL"} - ${label}${!condition && detail !== undefined ? `  (${JSON.stringify(detail)})` : ""}`);
  if (!condition) failures.push(label);
}

async function post(port, path, body) {
  const res = await originalFetch(`http://127.0.0.1:${port}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: res.status, body: await res.json() };
}
const points = () => (db.world_config.find((r) => r.world_id === WORLD) || {}).generation_count || 0;

async function main() {
  console.log("== Find dates in lore (fakeSupabase, stubbed AI) ==\n");
  db.world_config.push({ world_id: WORLD, draft_json: {}, generation_count: 0, calendar_config: null });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = USER; req.worldId = WORLD; next(); });
  app.use("/api", require("../routes/timeline"));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const port = server.address().port;

  try {
    check("formatWorldDate: year precision -> 'c. Year 512 of the Age of Ash'",
      formatWorldDate({ year: 512, monthIndex: 0, day: 1, precision: "year", approximate: true }, CAL) === "c. Year 512 of the Age of Ash");
    check("formatWorldDate: month precision -> 'Frostmere, Year 790 ...' (no day)",
      formatWorldDate({ year: 790, monthIndex: 0, day: 1, precision: "month", approximate: false }, CAL) === "Frostmere, Year 790 of the Age of Ash");
    check("formatWorldDate: plain dates unchanged",
      formatWorldDate({ year: 640, monthIndex: 1, day: 12 }, CAL) === "the 12th of Ashfall, Year 640 of the Age of Ash");

    let r = await post(port, "/timeline/extract-lore-dates");
    check("no calendar -> 400 no_calendar, not charged, no AI call", r.status === 400 && r.body.error === "no_calendar" && points() === 0 && aiCalls === 0, r.body);

    db.world_config[0].calendar_config = CAL;
    r = await post(port, "/timeline/extract-lore-dates");
    check("no lore -> 400 no_lore, not charged", r.status === 400 && r.body.error === "no_lore" && points() === 0 && aiCalls === 0, r.body);

    db.lore_sections = db.lore_sections || [];
    db.lore_sections.push({ id: "ls1", world_id: WORLD, title: "The Founding", content: LORE.split("\n").slice(1).join("\n"), position: 0, core: true });
    // An existing structured entry-date event the lore also mentions.
    await createTimelineEvent(WORLD, {
      sourceType: "entry_date", sourceId: "the-salt-choir", sourceCategory: "factions", sessionNumber: null,
      worldDate: { year: 790, monthIndex: 0, day: 5 }, summary: "Founded: The Salt Choir", linkedEntryIds: [], linkedFactionIds: []
    });

    aiMode = "fail";
    r = await post(port, "/timeline/extract-lore-dates");
    check("AI failure -> 500 and the generation is refunded", r.status === 500 && aiCalls >= 1 && points() === 0, { status: r.status, points: points() });

    aiMode = "ok";
    const callsBefore = aiCalls;
    r = await post(port, "/timeline/extract-lore-dates");
    const proposals = r.body.proposals || [];
    check("extraction: 200, one AI call, exactly one generation charged (5 points)", r.status === 200 && aiCalls === callsBefore + 1 && points() === 5, { status: r.status, points: points() });
    check("3 valid proposals kept (bad quote, bad month, and in-batch repeat dropped)", proposals.length === 3 && r.body.droppedCount === 3, proposals.map((p) => p.summary));
    check("sorted chronologically", proposals.map((p) => p.worldDate.year).join(",") === "512,640,790");
    const river = proposals.find((p) => /river/.test(p.summary));
    check("relative date kept as approximate year precision, labelled 'c. Year 512...'",
      river && river.worldDate.precision === "year" && river.worldDate.approximate === true && river.dateLabel === "c. Year 512 of the Age of Ash", river);
    const choir = proposals.find((p) => /Salt Choir/.test(p.summary));
    check("possible duplicate of the structured 'Founded: The Salt Choir' event is flagged, not dropped",
      choir && choir.possibleDuplicateOf === "Founded: The Salt Choir", choir);
    check("nothing written by extraction", (await listTimelineEvents(WORLD)).length === 1);

    // Confirm: the two non-duplicates + one tampered event.
    const pact = proposals.find((p) => /Iron Pact/.test(p.summary));
    const toSend = [
      { summary: pact.summary, worldDate: pact.worldDate, sectionTitle: pact.sectionTitle },
      { summary: river.summary, worldDate: river.worldDate, sectionTitle: river.sectionTitle },
      { summary: "Tampered", worldDate: { year: 640, monthIndex: 9, day: 1, precision: "day" }, sectionTitle: "x" }
    ];

    // Migration 039 not applied: the insert fails the check constraint.
    const originalFrom = supabase.from;
    supabase.from = function (table) {
      const q = originalFrom.call(this, table);
      if (table !== "timeline_events") return q;
      const origInsert = q.insert.bind(q);
      q.insert = (row) => {
        if (row && row.source_type === "lore_date") {
          const failing = { select() { return failing; }, single() { return failing; }, then(res) { setImmediate(() => res({ data: null, error: { code: "23514", message: 'new row for relation "timeline_events" violates check constraint "timeline_events_source_type_check"' } })); } };
          return failing;
        }
        return origInsert(row);
      };
      return q;
    };
    const origErr = console.error;
    console.error = () => {};
    r = await post(port, "/timeline/confirm-lore-dates", { events: toSend });
    console.error = origErr;
    supabase.from = originalFrom;
    check("migration 039 missing -> 409 with a clear message, nothing written",
      r.status === 409 && r.body.error === "migration_039_required" && (await listTimelineEvents(WORLD)).length === 1, r.body);

    r = await post(port, "/timeline/confirm-lore-dates", { events: toSend });
    const loreEvents = (await listTimelineEvents(WORLD)).filter((e) => e.sourceType === "lore_date");
    check("confirm: 2 created, tampered one skipped as invalid", r.status === 200 && r.body.created === 2 && r.body.skippedInvalid === 1, r.body);
    check("stored as lore_date with precision/approximate kept",
      loreEvents.length === 2 && loreEvents.some((e) => e.worldDate.precision === "year" && e.worldDate.approximate === true));
    r = await post(port, "/timeline/confirm-lore-dates", { events: toSend.slice(0, 2) });
    check("confirm again: idempotent (2 skipped as duplicates, 0 created)", r.body.created === 0 && r.body.skippedDuplicate === 2, r.body);
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
