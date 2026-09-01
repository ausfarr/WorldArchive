// scripts/testLoreCategoryTagCoverage.js
//
// Regression test for a category-list drift bug in lib/loreParsing.js,
// same root cause and shape as the one scripts/testPdfExportCategoryCoverage.js
// covers for the export pipeline: a category list gets duplicated instead
// of imported, and silently falls out of sync when a new generator
// category ships.
//
// lib/loreParsing.js's ALL_CATEGORIES (used both as the "unmatched
// section" fallback and inside several TOPIC_CATEGORY_MAP rows) was
// missing "locations" and "spells" entirely, even though both are real
// generator categories that call getLoreContext(worldId, { category })
// (routes/generateLocation.js, routes/generateSpell.js). Since
// lib/loreContext.js's getRelevantLoreSections() only includes a non-core
// section when its categoryTags include the requested category, this
// meant an uploaded World Bible's resource/culture/history/faction/magic
// sections -- and even the generic "unmatched title" fallback, which the
// file's own header comment says should default to ALL categories --
// never reached a Location or Spell generation. Only the three
// `core: true` rows (geography/overview/glossary) got through, since core
// sections bypass categoryTags filtering entirely.
//
// Pure unit test against lib/loreParsing.js's exports directly -- no
// Supabase/fakeSupabase needed, since detectCategoryTagsAndCore() is a
// pure function.
//
// Run with: node scripts/testLoreCategoryTagCoverage.js

const { detectCategoryTagsAndCore, ALL_CATEGORIES } = require("../lib/loreParsing");
const { ALL_CATEGORIES: ENTRY_LINKER_ALL_CATEGORIES } = require("../lib/entryLinker");

const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

console.log("== Lore category tag coverage test ==\n");

console.log("-- Test 1: ALL_CATEGORIES includes every real per-category getLoreContext caller --");
check("includes locations (routes/generateLocation.js)", ALL_CATEGORIES.includes("locations"));
check("includes spells (routes/generateSpell.js)", ALL_CATEGORIES.includes("spells"));
check("still includes the original categories (npcs)", ALL_CATEGORIES.includes("npcs"));

console.log("\n-- Test 2: an unmatched section title falls back to ALL categories, locations/spells included --");
const unmatched = detectCategoryTagsAndCore("Random Musings From The Author");
check("falls back to ALL_CATEGORIES", unmatched.categoryTags.length === ALL_CATEGORIES.length);
check("fallback includes locations", unmatched.categoryTags.includes("locations"));
check("fallback includes spells", unmatched.categoryTags.includes("spells"));

console.log("\n-- Test 3: a geography section (core, obviously Location-relevant) tags locations --");
const geo = detectCategoryTagsAndCore("Geography & Climate");
check("is core", geo.core === true);
check("tags locations", geo.categoryTags.includes("locations"));

console.log("\n-- Test 4: a magic/technology section tags spells (the row's own 'magic' keyword) --");
const magic = detectCategoryTagsAndCore("Magic & Technology");
check("tags spells", magic.categoryTags.includes("spells"));
check("still tags the pre-existing categories (items, classes, enemies)",
  ["items", "classes", "enemies"].every((c) => magic.categoryTags.includes(c)));

console.log("\n-- Test 5: stays in sync with lib/entryLinker.js's canonical category list --");
check("same set as entryLinker.js's ALL_CATEGORIES",
  ALL_CATEGORIES.length === ENTRY_LINKER_ALL_CATEGORIES.length &&
  ALL_CATEGORIES.every((c) => ENTRY_LINKER_ALL_CATEGORIES.includes(c)));

console.log("");
if (failures.length === 0) {
  console.log("ALL PASS");
} else {
  console.log(`${failures.length} FAILURE(S):`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
