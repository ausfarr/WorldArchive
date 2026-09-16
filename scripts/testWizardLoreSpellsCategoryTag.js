// scripts/testWizardLoreSpellsCategoryTag.js
//
// Regression test for a category-list-drift bug: "spells" is a real
// generator category (routes/generateSpell.js calls getLoreContext(worldId,
// { category: "spells" })) but routes/wizardLore.js's GENERATED_SECTION_META
// -- the table deciding which categoryTags a wizard-generated-fresh lore
// section gets -- never listed "spells" anywhere. Since
// lib/loreContext.js#getRelevantLoreSections only includes a non-core
// section when its categoryTags include the requested category, a
// 5e-ruleset world's wizard-generated Resources/Culture/Technology/History
// lore silently never reached a Spell generation prompt, even though the
// generate-fresh path is the common case (import is the alternative, not
// the default) and technologyOrSupernatural's "magic" framing is the
// single most Spell-relevant section in the schema.
//
// Pure-function test -- no DB/API needed, so this runs offline with no
// real credentials.
//
// Run with: node scripts/testWizardLoreSpellsCategoryTag.js

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
  console.log("=== testWizardLoreSpellsCategoryTag ===\n");

  const nonCoreKeys = ["resources", "culture", "technologyOrSupernatural", "history"];
  for (const key of nonCoreKeys) {
    const meta = GENERATED_SECTION_META[key];
    check(`GENERATED_SECTION_META.${key} tags spells`, meta.categoryTags.includes("spells"), meta.categoryTags.join(","));
  }

  // technologyOrSupernatural is the one section whose own framing ("magic")
  // is most directly relevant to Spells -- the most likely to actually be
  // missed by a reviewer skimming for "does this look right."
  check(
    "technologyOrSupernatural keeps its pre-existing tags too (items/classes/enemies)",
    ["items", "classes", "enemies"].every((c) => GENERATED_SECTION_META.technologyOrSupernatural.categoryTags.includes(c))
  );

  check(
    "GENERATED_SECTION_META.geography (core) tags spells for display accuracy",
    GENERATED_SECTION_META.geography.categoryTags.includes("spells")
  );

  // peoples is deliberately left untouched -- population/demographic lore
  // is about "who," not spell mechanics, same selectivity call the
  // analogous Locations fix made for this section.
  check(
    "GENERATED_SECTION_META.peoples deliberately NOT tagged spells (sanity: not a blanket add-everywhere)",
    !GENERATED_SECTION_META.peoples.categoryTags.includes("spells")
  );

  console.log(`\n${failures.length === 0 ? "ALL PASSED" : `${failures.length} FAILED`}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run();
