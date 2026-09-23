// scripts/testPendingUpdateDedupeRace.js
//
// Regression test for the check-then-act race fixed in
// lib/pendingEntryUpdatesRepo.js's dedup path (findOrCreatePendingUpdate).
// lib/logDateSuggestions.js and lib/sessionChronicleSuggestions.js both
// used to call findExistingUpdate() then createPendingUpdate() as two
// separate, unguarded steps -- two confirms of the same Log/Chronicle
// landing close together (double-click on Confirm, or the same dossier
// open in two tabs) could each run findExistingUpdate() before either
// insert landed, both see "no existing row," and both insert, leaving
// two near-identical pending_entry_updates rows for the same
// (source, entry, field) fact -- the exact "check-then-act" shape of bug
// already fixed for Campaign Arc/Quest cleanup, entry metadata patches,
// and generate-once resources (see scripts/testCampaignStructureRaces.js,
// scripts/testEntryMetaPatchRace.js).
//
// Uses the same fakeSupabase.js real-macrotask-yield fake those two
// files rely on to actually reproduce interleaved concurrent calls, not
// just sequential ones that happen to run back to back.
//
// Run with: node scripts/testPendingUpdateDedupeRace.js

const { install, db } = require("./lib/fakeSupabase");
install();

const { maybeCreateDateSuggestion } = require("../lib/logDateSuggestions");
const { createSuggestionsFromChronicle } = require("../lib/sessionChronicleSuggestions");

const WORLD = "test-world";
const CALENDAR_CONFIG = {
  months: [{ name: "Frostmere", days: 30 }],
  era_name: "Age of Ash"
};

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail !== undefined ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function resetDb() {
  db.entries.length = 0;
  db.pending_entry_updates = [];
}

function seedEntry(category, { id, name, raw = {} }) {
  db.entries.push({
    world_id: WORLD,
    category,
    entry_id: id,
    name,
    subtitle: null,
    faction: null,
    tags_json: [],
    body_html: "<p>seed</p>",
    raw_json: { id, name, category, raw },
    locked: false
  });
}

async function testConcurrentLogDateSuggestionsDontDuplicate() {
  console.log("\nTest 1: two concurrent maybeCreateDateSuggestion calls for the same Log don't duplicate");
  resetDb();
  seedEntry("npcs", { id: "miller-thom", name: "Miller Thom", raw: {} });

  const log = {
    id: "mill-log-1",
    name: "The Mill's Silence",
    resolvedDate: { year: 812, monthIndex: 0, day: 10 },
    resolvedDateSubject: { category: "npcs", entryId: "miller-thom", dateField: "birthDate" }
  };

  await Promise.all([
    maybeCreateDateSuggestion(WORLD, log, CALENDAR_CONFIG),
    maybeCreateDateSuggestion(WORLD, log, CALENDAR_CONFIG)
  ]);

  const rows = db.pending_entry_updates.filter((r) => r.source === "log:mill-log-1");
  check("exactly one suggestion row created, not two", rows.length === 1, `found ${rows.length}`);
}

async function testConcurrentChronicleSuggestionsDontDuplicate() {
  console.log("\nTest 2: two concurrent createSuggestionsFromChronicle calls for the same Chronicle don't duplicate");
  resetDb();
  seedEntry("npcs", { id: "odalys-kess", name: "Odalys Kess", raw: { status: "active" } });

  const log = {
    id: "chronicle-log-1",
    sessionChronicle: "Odalys Kess fell defending the gate.",
    impliedUpdates: [
      { category: "npcs", entryId: "odalys-kess", suggestionType: "status_flip", targetStatus: "dead", deltaText: "Died defending the gate." }
    ]
  };

  const [rowsA, rowsB] = await Promise.all([
    createSuggestionsFromChronicle(WORLD, log),
    createSuggestionsFromChronicle(WORLD, log)
  ]);

  const created = db.pending_entry_updates.filter((r) => r.source === "chronicle:chronicle-log-1");
  check("exactly one suggestion row created, not two", created.length === 1, `found ${created.length}`);
  const totalReturned = rowsA.length + rowsB.length;
  check("exactly one of the two concurrent calls reports having created the row (the other sees it already exists)", totalReturned === 1, `total returned ${totalReturned}`);
}

// Tests 3-4 cover the interaction between this lock and the "refresh a
// stale pending suggestion in place" fix (awesome-mayer-yze9tz, see
// scripts/testEntryDriftSuggestions.js) -- the two were built in parallel
// against the same find-then-create step and are only correct together
// when the refresh happens inside the same lock as the insert. A
// regenerate-confirm with revised facts, double-submitted, must still
// leave exactly one row carrying the *revised* content.
async function testConcurrentRevisedChronicleRefreshesOnce() {
  console.log("\nTest 3: two concurrent confirms of a revised Chronicle refresh the existing row once, not duplicate it");
  resetDb();
  seedEntry("npcs", { id: "odalys-kess", name: "Odalys Kess", raw: { status: "active" } });

  const first = {
    id: "chronicle-log-2",
    sessionChronicle: "Odalys Kess was wounded at the gate.",
    impliedUpdates: [
      { category: "npcs", entryId: "odalys-kess", suggestionType: "status_flip", targetStatus: "missing", deltaText: "Went missing after the gate." }
    ]
  };
  await createSuggestionsFromChronicle(WORLD, first);

  const revised = {
    ...first,
    sessionChronicle: "Odalys Kess fell defending the gate.",
    impliedUpdates: [
      { category: "npcs", entryId: "odalys-kess", suggestionType: "status_flip", targetStatus: "dead", deltaText: "Died defending the gate." }
    ]
  };
  const [rowsA, rowsB] = await Promise.all([
    createSuggestionsFromChronicle(WORLD, revised),
    createSuggestionsFromChronicle(WORLD, revised)
  ]);

  const rows = db.pending_entry_updates.filter((r) => r.source === "chronicle:chronicle-log-2");
  check("still exactly one suggestion row", rows.length === 1, `found ${rows.length}`);
  check("row carries the revised deltaText", rows[0] && rows[0].delta_text === "Died defending the gate.", rows[0] && rows[0].delta_text);
  check("row carries the revised payload", rows[0] && rows[0].payload && rows[0].payload.targetStatus === "dead", rows[0] && JSON.stringify(rows[0].payload));
  const totalReturned = rowsA.length + rowsB.length;
  check("exactly one caller reports the refresh (the other sees it already current)", totalReturned === 1, `total returned ${totalReturned}`);
}

async function testConcurrentRevisedLogDateRefreshesOnce() {
  console.log("\nTest 4: two concurrent confirms of a Log with a revised resolved date refresh once, not duplicate");
  resetDb();
  seedEntry("npcs", { id: "miller-thom", name: "Miller Thom", raw: {} });

  const log = {
    id: "mill-log-2",
    name: "The Mill's Silence",
    resolvedDate: { year: 812, monthIndex: 0, day: 10 },
    resolvedDateSubject: { category: "npcs", entryId: "miller-thom", dateField: "birthDate" }
  };
  await maybeCreateDateSuggestion(WORLD, log, CALENDAR_CONFIG);
  const before = db.pending_entry_updates.find((r) => r.source === "log:mill-log-2");
  const beforeText = before && before.delta_text;

  const revised = { ...log, resolvedDate: { year: 812, monthIndex: 0, day: 22 } };
  await Promise.all([
    maybeCreateDateSuggestion(WORLD, revised, CALENDAR_CONFIG),
    maybeCreateDateSuggestion(WORLD, revised, CALENDAR_CONFIG)
  ]);

  const rows = db.pending_entry_updates.filter((r) => r.source === "log:mill-log-2");
  check("still exactly one suggestion row", rows.length === 1, `found ${rows.length}`);
  check("row's date text was refreshed to the revised date", rows[0] && rows[0].delta_text !== beforeText && /22/.test(rows[0].delta_text), rows[0] && rows[0].delta_text);
}

async function main() {
  await testConcurrentLogDateSuggestionsDontDuplicate();
  await testConcurrentChronicleSuggestionsDontDuplicate();
  await testConcurrentRevisedChronicleRefreshesOnce();
  await testConcurrentRevisedLogDateRefreshesOnce();

  console.log(`\n${failures.length === 0 ? "All checks passed." : `${failures.length} check(s) FAILED:`}`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
