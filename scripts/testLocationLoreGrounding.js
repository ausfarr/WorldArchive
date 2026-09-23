// scripts/testLocationLoreGrounding.js
//
// Regression test for a category-list-drift bug: "locations" was added as
// a real content category (routes/generateLocation.js grounds itself via
// getLoreContext(worldId, { category: "locations", faction })) but never
// added to either of the two hand-maintained lists that decide which
// lore_sections a non-core section's category_tags can include --
// lib/loreParsing.js's ALL_CATEGORIES/TOPIC_CATEGORY_MAP (the "import a
// lore doc" / keyword-guessing path) and routes/wizardLore.js's
// GENERATED_SECTION_META (the "generate fresh lore" path). Since
// lib/loreContext.js#getRelevantLoreSections only includes a non-core
// section when its category_tags includes the requested category, a
// Location generation could only ever ground on core:true sections
// (Overview/Geography/Peoples/Glossary) -- History/Founding,
// Faction/Politics, Culture, Resources, and Technology/Magic lore all
// silently never reached a Location prompt, on both the generate-fresh
// and import-a-doc paths, for every world.
//
// Pure-function tests -- no DB/API needed, so this runs offline with no
// real credentials.
//
// Run with: node scripts/testLocationLoreGrounding.js

const { detectCategoryTagsAndCore, ALL_CATEGORIES } = require("../lib/loreParsing");
const { GENERATED_SECTION_META } = require("../routes/wizardLore");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail !== undefined ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function run() {
  console.log("=== testLocationLoreGrounding ===\n");

  // ---- lib/loreParsing.js: the "import a lore doc" keyword-guessing path ----

  check("ALL_CATEGORIES includes locations", ALL_CATEGORIES.includes("locations"), ALL_CATEGORIES.join(","));

  // These titles are the actual bug: each is a REAL, non-core topic a DM's
  // lore doc plausibly has, and each used to tag every category EXCEPT
  // locations -- so a Location generation never saw them even though a
  // location description (a ruined capital, a temple district, a
  // faction-held outpost) is exactly the kind of content that benefits
  // from history/faction/culture/resource/technology lore.
  const nonCoreCases = [
    { title: "History of the Fallen Empire", label: "History-titled section" },
    { title: "Faction Politics and Government", label: "Faction/Politics-titled section" },
    { title: "Culture and Religion", label: "Culture-titled section" },
    { title: "Resources and Trade", label: "Resources-titled section" },
    { title: "Technology and Magic Systems", label: "Technology/Magic-titled section" }
  ];
  for (const { title, label } of nonCoreCases) {
    const { categoryTags, core } = detectCategoryTagsAndCore(title);
    check(`${label} ("${title}") tags "locations"`, categoryTags.includes("locations"), categoryTags.join(","));
    check(`${label} is still non-core (sanity: not passing by accident)`, core === false);
  }

  // Core sections (always included regardless of category_tags -- see
  // loreContext.js's `if (s.core) return true`) should still list
  // "locations" in their own categoryTags for accuracy, since
  // archive/wizard-lore.html displays category_tags to the user directly.
  const { categoryTags: geoTags, core: geoCore } = detectCategoryTagsAndCore("Geography and Climate");
  check("core Geography section still tags locations (display accuracy)", geoTags.includes("locations"));
  check("Geography section is core (sanity)", geoCore === true);

  // Unmatched title -- falls back to ALL_CATEGORIES (see loreParsing.js's
  // header comment on the completeness-over-precision tradeoff). Before
  // the fix, this "matches everything" fallback still silently excluded
  // locations, which was the most likely bug to actually bite a real user
  // (any custom section title that doesn't hit a keyword).
  const { categoryTags: unmatchedTags } = detectCategoryTagsAndCore("Miscellaneous Notes");
  check("unmatched-title fallback includes locations", unmatchedTags.includes("locations"), unmatchedTags.join(","));

  // ---- routes/wizardLore.js: the "generate fresh lore" path ----

  const nonCoreKeys = ["resources", "culture", "technologyOrSupernatural", "history"];
  for (const key of nonCoreKeys) {
    const meta = GENERATED_SECTION_META[key];
    check(`GENERATED_SECTION_META.${key} tags locations`, meta.categoryTags.includes("locations"), meta.categoryTags.join(","));
  }
  check("GENERATED_SECTION_META.geography (core) tags locations", GENERATED_SECTION_META.geography.categoryTags.includes("locations"));

  console.log(`\n${failures.length === 0 ? "ALL PASSED" : `${failures.length} FAILED`}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run();
