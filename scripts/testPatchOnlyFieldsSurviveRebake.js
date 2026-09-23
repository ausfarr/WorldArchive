// scripts/testPatchOnlyFieldsSurviveRebake.js
//
// Regression test for a gap entriesRepo.js's patchEntryMeta() and
// lib/entryLinker.js's backfill rebake path both explicitly documented as
// "known, not yet fixed" (see CHANGELOG.md's patchEntryMeta race-fix entry
// and its "NOTE this does NOT protect a patched field..." comment): a
// patchEntryMeta-only field (one that lives on raw_json but was never part
// of the category's own content object) got silently wiped out the next
// time that entry's save*Entry() writer ran a full raw_json overwrite --
// on a normal regenerate-confirm, AND on an entryLinker.js backfill rebake.
//
// Two concrete instances existed:
//   - Locations: dungeonMap (routes/dungeonMap.js's baked battle map, real
//     Gemini image spend) and manualMapPosition (routes/entries.js's
//     dragged world-map pin), both patched via patchEntryMeta, both
//     dropped by saveLocationEntry()'s full overwrite.
//   - Factions: bannerImageUrl (routes/worldArt.js's AI-generated banner),
//     patched via patchEntryMeta, dropped by saveFactionEntry()'s full
//     overwrite -- accentColor was ALREADY carried forward (the exact
//     pattern this fix ports to the other three fields).
//
// Fixed by having saveLocationEntry()/saveFactionEntry() (lib/fileWriter.js)
// read the existing row first and carry these fields forward, mirroring
// the accentColor precedent exactly. This script fails against the
// pre-fix code (all four checks below read back null) and passes against
// the fix.
//
// Run with: node scripts/testPatchOnlyFieldsSurviveRebake.js

const { install, db } = require("./lib/fakeSupabase");
install();

const { getEntry, patchEntryMeta } = require("../lib/entriesRepo");
const { saveLocationEntry, saveFactionEntry } = require("../lib/fileWriter");
const { backfillReferencesFromNewEntry } = require("../lib/entryLinker");

const WORLD = "world-patchfields";

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

async function testLocationRegenerateConfirmPreservesMapFields() {
  console.log("\nsaveLocationEntry -- dungeonMap/manualMapPosition survive a regenerate-confirm:");
  resetDb();

  await saveLocationEntry(WORLD, {
    id: "rust-atrium",
    name: "Rust Atrium",
    regionBiome: "Subway Substructure",
    faction: null
  }, null);

  await patchEntryMeta(WORLD, "locations", "rust-atrium", {
    dungeonMap: { imageUrl: "https://example/map.png", gridSize: 24, generatedAt: 1 }
  });
  await patchEntryMeta(WORLD, "locations", "rust-atrium", { manualMapPosition: { x: 12, y: 34 } });

  // Simulates routes/confirmEntry.js's regenerate-confirm write: a freshly
  // AI-generated content object for the SAME id, which never mentions
  // dungeonMap/manualMapPosition at all (regenerate only ever produces
  // fresh lore/description).
  await saveLocationEntry(WORLD, {
    id: "rust-atrium",
    name: "Rust Atrium",
    regionBiome: "Subway Substructure (regenerated)",
    faction: null
  }, null);

  const after = await getEntry(WORLD, "locations", "rust-atrium");
  check("dungeonMap survives the regenerate", after.dungeonMap && after.dungeonMap.imageUrl === "https://example/map.png", JSON.stringify(after.dungeonMap));
  check("manualMapPosition survives the regenerate", after.manualMapPosition && after.manualMapPosition.x === 12, JSON.stringify(after.manualMapPosition));
}

async function testLocationBackfillRebakePreservesMapFields() {
  console.log("\nentryLinker backfill rebake -- dungeonMap/manualMapPosition survive a rebake triggered by an unrelated new NPC:");
  resetDb();

  await saveLocationEntry(WORLD, {
    id: "scrap-market",
    name: "Scrap Market",
    regionBiome: "Ferro-Kings Territory",
    faction: null,
    // Unresolved Category B reference -- exactly what makes this row a
    // rebake candidate the moment the matching NPC is created below.
    notableNpcs: [{ toLabel: "Odalys Kess", toId: null }]
  }, null);

  await patchEntryMeta(WORLD, "locations", "scrap-market", {
    dungeonMap: { imageUrl: "https://example/scrap-market.png", gridSize: 20, generatedAt: 2 },
    manualMapPosition: { x: 5, y: 9 }
  });

  const { patchedCount } = await backfillReferencesFromNewEntry(WORLD, "npcs", { id: "odalys-kess", name: "Odalys Kess" });
  check("the location was actually rebaked", patchedCount === 1, patchedCount);

  const after = await getEntry(WORLD, "locations", "scrap-market");
  check("dungeonMap survives the rebake", after.dungeonMap && after.dungeonMap.imageUrl === "https://example/scrap-market.png", JSON.stringify(after.dungeonMap));
  check("manualMapPosition survives the rebake", after.manualMapPosition && after.manualMapPosition.y === 9, JSON.stringify(after.manualMapPosition));
  check("the reference itself was actually resolved (rebake did its real job too)", after.raw.notableNpcs[0].toId === "odalys-kess", JSON.stringify(after.raw.notableNpcs[0]));
}

async function testFactionRegenerateConfirmPreservesBannerAndAccentColor() {
  console.log("\nsaveFactionEntry -- accentColor (already fixed) and bannerImageUrl (newly fixed) survive a Deep Lore regenerate-confirm:");
  resetDb();

  await saveFactionEntry(WORLD, {
    id: "the-board",
    name: "The Board",
    factionKey: "the-board",
    territory: "Downtown Core.",
    nickname: "Suits"
  }, []);

  await patchEntryMeta(WORLD, "factions", "the-board", { accentColor: "#3fa9f5" });
  await patchEntryMeta(WORLD, "factions", "the-board", { bannerImageUrl: "https://example/board-banner.png" });

  // Simulates a Deep Lore regenerate: fresh content object, no
  // accentColor/bannerImageUrl on it at all.
  await saveFactionEntry(WORLD, {
    id: "the-board",
    name: "The Board",
    factionKey: "the-board",
    territory: "Downtown Core (regenerated).",
    nickname: "Suits"
  }, []);

  const after = await getEntry(WORLD, "factions", "the-board");
  check("accentColor still survives (pre-existing fix, not a regression)", after.accentColor === "#3fa9f5", after.accentColor);
  check("bannerImageUrl survives the regenerate", after.bannerImageUrl === "https://example/board-banner.png", after.bannerImageUrl);
}

async function main() {
  await testLocationRegenerateConfirmPreservesMapFields();
  await testLocationBackfillRebakePreservesMapFields();
  await testFactionRegenerateConfirmPreservesBannerAndAccentColor();

  console.log(`\n${failures.length === 0 ? "All checks passed." : `${failures.length} check(s) FAILED:`}`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
