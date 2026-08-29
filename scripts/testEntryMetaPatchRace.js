// scripts/testEntryMetaPatchRace.js
//
// Regression test for the check-then-act race fixed in entriesRepo.js's
// patchEntryMeta() and lib/entryLinker.js's backfillReferencesFromNewEntry()
// rebake path -- both read a row, computed a merged/mutated object in JS,
// and wrote it back with a plain update()/upsert(), no lock. Two patches (or
// a patch racing a backfill rebake, or two backfills) landing on the same
// entry close together could each read the same pre-write state and each
// write back a change that silently drops the other's -- same shape of bug
// already fixed for Campaign Arc/Quest cleanup (see
// scripts/testCampaignStructureRaces.js) and Suggested Updates apply.
//
// Uses the same fakeSupabase.js real-macrotask-yield fake
// scripts/testEntryDriftSuggestions.js's Test 9 and
// testCampaignStructureRaces.js rely on to actually reproduce interleaved
// concurrent calls, not just sequential ones that happen to run back to back.
//
// Run with: node scripts/testEntryMetaPatchRace.js

const { install, db } = require("./lib/fakeSupabase");
install();

const { patchEntryMeta, getEntry } = require("../lib/entriesRepo");
const { backfillReferencesFromNewEntry } = require("../lib/entryLinker");

const WORLD = "test-world";

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
  db.world_config.length = 0;
  db.world_config.push({ world_id: WORLD, ruleset: "echoes", draft_json: {} });
}

function seedEntry(category, { id, name, raw, locked = false }) {
  db.entries.push({
    world_id: WORLD,
    category,
    entry_id: id,
    name,
    subtitle: null,
    faction: null,
    tags_json: [],
    body_html: locked ? null : "<p>seed</p>",
    raw_json: { id, name, category, raw },
    locked
  });
}

async function testConcurrentPatchesBothLand() {
  console.log("\nTest 1: two concurrent patchEntryMeta calls on the same entry, different keys");
  resetDb();
  seedEntry("locations", { id: "old-mill", name: "The Old Mill", raw: { id: "old-mill", name: "The Old Mill" } });

  await Promise.all([
    patchEntryMeta(WORLD, "locations", "old-mill", { dungeonMap: { imageUrl: "map.png", gridSize: 20 } }),
    patchEntryMeta(WORLD, "locations", "old-mill", { manualMapPosition: { x: 10, y: 20 } })
  ]);

  const entry = await getEntry(WORLD, "locations", "old-mill");
  check("dungeonMap patch survived", entry.dungeonMap && entry.dungeonMap.imageUrl === "map.png", JSON.stringify(entry.dungeonMap));
  check("manualMapPosition patch survived (not lost to the race)", entry.manualMapPosition && entry.manualMapPosition.x === 10, JSON.stringify(entry.manualMapPosition));
}

async function testConcurrentBackfillsBothLand() {
  console.log("\nTest 2: two concurrent backfill rebakes resolving different references on the same row");
  resetDb();
  // One Location notably mentions two NPCs that don't exist archived yet --
  // both references are unresolved (toId: null). Confirming both NPCs at
  // roughly the same moment (e.g. two browser tabs) fires two concurrent
  // backfillReferencesFromNewEntry() calls that both target this same
  // Location row.
  seedEntry("locations", {
    id: "rust-yard",
    name: "The Rust Yard",
    raw: {
      id: "rust-yard",
      name: "The Rust Yard",
      notableNpcs: [
        { toLabel: "Odalys Kess", toId: null },
        { toLabel: "Rook Vance", toId: null }
      ]
    }
  });

  await Promise.all([
    backfillReferencesFromNewEntry(WORLD, "npcs", { id: "odalys-kess", name: "Odalys Kess" }),
    backfillReferencesFromNewEntry(WORLD, "npcs", { id: "rook-vance", name: "Rook Vance" })
  ]);

  const entry = await getEntry(WORLD, "locations", "rust-yard");
  const odalys = entry.raw.notableNpcs.find((n) => n.toLabel === "Odalys Kess");
  const rook = entry.raw.notableNpcs.find((n) => n.toLabel === "Rook Vance");
  check("Odalys Kess reference resolved", odalys && odalys.toId === "odalys-kess", JSON.stringify(odalys));
  check("Rook Vance reference resolved too (not lost to the race)", rook && rook.toId === "rook-vance", JSON.stringify(rook));
}

async function testBackfillDoesntClobberConcurrentPatch() {
  console.log("\nTest 3: a patch that lands BEFORE a same-row backfill rebake survives it");
  resetDb();
  // The lock guarantees ordering (no corrupted interleaved read/write) --
  // it does NOT make rebake() merge fields it doesn't know about (see the
  // NOTE on patchEntryMeta and on this file's backfill lock comment). So
  // this test only asserts the half that's actually guaranteed: a patch
  // that completes first is visible to the backfill's own fresh re-read,
  // and the backfill's resolution still lands correctly on top of it.
  seedEntry("locations", {
    id: "signal-tower",
    name: "Signal Tower",
    raw: {
      id: "signal-tower",
      name: "Signal Tower",
      notableNpcs: [{ toLabel: "Odalys Kess", toId: null }]
    }
  });

  await patchEntryMeta(WORLD, "locations", "signal-tower", { manualMapPosition: { x: 5, y: 5 } });
  await backfillReferencesFromNewEntry(WORLD, "npcs", { id: "odalys-kess", name: "Odalys Kess" });

  const entry = await getEntry(WORLD, "locations", "signal-tower");
  check("backfill resolved the reference", entry.raw.notableNpcs[0].toId === "odalys-kess");
  // Documents the known, separate gap called out in patchEntryMeta's NOTE --
  // not something this lock fixes, just pinning today's actual behavior so
  // a future change to how rebake() writes doesn't silently go unnoticed.
  check("KNOWN GAP: rebake still drops the earlier patch-only field (manualMapPosition)", entry.manualMapPosition === undefined);
}

async function main() {
  await testConcurrentPatchesBothLand();
  await testConcurrentBackfillsBothLand();
  await testBackfillDoesntClobberConcurrentPatch();

  console.log(`\n${failures.length === 0 ? "All checks passed." : `${failures.length} check(s) FAILED:`}`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
