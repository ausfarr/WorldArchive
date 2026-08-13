// scripts/verifySrd5eFullIngest.js
//
// Companion to scripts/ingestSrd5eFull.js -- the mandatory spot-check
// verification trail for that ingestion, as a runnable script rather than
// only prose in a header comment (same discipline ingestSrd5e.js's own
// header documents for its Goblin cross-check).
//
// Two modes:
//   1. Offline (default, no Supabase needed): re-fetches the source
//      markdown fresh and re-runs the real parsers from
//      ingestSrd5eFull.js, asserting the same hand-verified facts this
//      project checked before trusting the parser on the full files.
//      This is what CI/a sandbox with no reachable Supabase project can
//      run.
//   2. Live (--live flag, needs SUPABASE_URL/SUPABASE_SECRET_KEY): also
//      queries the real srd_library rows scripts/ingestSrd5eFull.js
//      wrote and re-checks the same facts against what's actually in
//      the database, catching any upsert/mapping bug between "the
//      parser produced the right object" and "the right object actually
//      landed in the row Phase 5's Import UI will read."
//
// Run with: node scripts/verifySrd5eFullIngest.js [--live]

// ingestSrd5eFull.js requires lib/supabaseClient at module load time (same
// as ingestSrd5e.js), which throws immediately if SUPABASE_URL/
// SUPABASE_SECRET_KEY aren't set -- fine for actually running the
// ingestion, but this script's offline mode never touches Supabase at all
// (it only calls the pure parser functions), so fill in harmless
// placeholders when real creds aren't present rather than forcing every
// offline verification run to need a live project.
if (!process.argv.includes("--live")) {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:0";
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "offline-verification-placeholder";
}

const {
  parseSpells,
  parseFeats,
  parseMagicItems,
  parseClasses,
  parseWeapons,
  parseArmor
} = require("./ingestSrd5eFull.js");

const RAW_BASE = "https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master";

async function fetchText(filename) {
  const res = await fetch(`${RAW_BASE}/${filename}`);
  if (!res.ok) throw new Error(`Fetching ${filename} failed: ${res.status} ${res.statusText}`);
  return res.text();
}

let failures = 0;

function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass ? "" : ` -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!pass) failures++;
}

async function verifyOffline() {
  console.log("Re-fetching source markdown and re-running the real parsers...\n");

  const spells = parseSpells(await fetchText("spells.md"));
  const spellByName = (n) => spells.find((s) => s.name === n);

  check("Fireball level/school", [spellByName("Fireball").level, spellByName("Fireball").school], [3, "Evocation"]);
  check("Fireball range", spellByName("Fireball").range, "150 feet");
  check("Fire Bolt level/school (cantrip)", [spellByName("Fire Bolt").level, spellByName("Fire Bolt").school], [0, "Evocation"]);
  check("Cure Wounds level/school", [spellByName("Cure Wounds").level, spellByName("Cure Wounds").school], [1, "Abjuration"]);
  check("Cure Wounds range", spellByName("Cure Wounds").range, "Touch");
  check("Magic Missile level/school", [spellByName("Magic Missile").level, spellByName("Magic Missile").school], [1, "Evocation"]);
  check("Shield level/school", [spellByName("Shield").level, spellByName("Shield").school], [1, "Abjuration"]);
  console.log(`(${spells.length} spells parsed total)\n`);

  const classes = parseClasses(await fetchText("classes.md"));
  const classByName = (n) => classes.find((c) => c.name === n);

  check("Fighter hit die / primary ability", [classByName("Fighter").hitDie, classByName("Fighter").primaryAbility], [10, "Strength or Dexterity"]);
  check("Wizard hit die / primary ability", [classByName("Wizard").hitDie, classByName("Wizard").primaryAbility], [6, "Intelligence"]);
  check("Sorcerer hit die / primary ability", [classByName("Sorcerer").hitDie, classByName("Sorcerer").primaryAbility], [6, "Charisma"]);
  console.log(`(${classes.length} classes parsed total, each with exactly one SRD sample subclass)\n`);

  const equipmentText = await fetchText("equipment.md");
  const weapons = parseWeapons(equipmentText);
  const armor = parseArmor(equipmentText);
  const weaponByName = (n) => weapons.find((w) => w.name === n);
  const armorByName = (n) => armor.find((a) => a.name === n);

  check("Chain Mail AC/Str/Stealth/weight/cost", [armorByName("Chain Mail").armorClass, armorByName("Chain Mail").strength, armorByName("Chain Mail").stealth, armorByName("Chain Mail").weight, armorByName("Chain Mail").cost], ["16", "Str 13", "Disadvantage", "55 lb.", "75 GP"]);
  check("Studded Leather Armor AC/Str/Stealth/weight/cost", [armorByName("Studded Leather Armor").armorClass, armorByName("Studded Leather Armor").strength, armorByName("Studded Leather Armor").stealth, armorByName("Studded Leather Armor").weight, armorByName("Studded Leather Armor").cost], ["12 + Dex modifier", "—", "—", "13 lb.", "45 GP"]);
  check("Longsword damage/properties/mastery/weight/cost", [weaponByName("Longsword").damage, weaponByName("Longsword").properties, weaponByName("Longsword").mastery, weaponByName("Longsword").weight, weaponByName("Longsword").cost], ["1d8 Slashing", "Versatile (1d10)", "Sap", "3 lb.", "15 GP"]);
  console.log(`(${weapons.length} weapons, ${armor.length} armor entries parsed total)\n`);

  const items = parseMagicItems(await fetchText("magic-items.md"));
  const itemByName = (n) => items.find((i) => i.name === n);

  check("Bag of Holding rarity/attunement", [itemByName("Bag of Holding").rarity, itemByName("Bag of Holding").attunement], ["Uncommon", null]);
  check("Cloak of Protection rarity/attunement", [itemByName("Cloak of Protection").rarity, itemByName("Cloak of Protection").attunement], ["Uncommon", "Requires Attunement"]);
  check("Ring of Protection rarity/attunement", [itemByName("Ring of Protection").rarity, itemByName("Ring of Protection").attunement], ["Rare", "Requires Attunement"]);
  console.log(`(${items.length} magic items parsed total)\n`);

  const feats = parseFeats(await fetchText("feats.md"));
  check("Alert category/prerequisite", [feats.find((f) => f.name === "Alert").category, feats.find((f) => f.name === "Alert").prerequisite], ["Origin", null]);
  console.log(`(${feats.length} feats parsed total -- note: the free SRD's feat list is much smaller than a full PHB's, see this session's addendum for the discrepancy this surfaced against R4's hand-authored feat fallback)\n`);
}

async function verifyLive() {
  const { supabase } = require("../lib/supabaseClient");
  console.log("\nLive mode: checking rows actually in srd_library...\n");

  async function checkRow(category, srdId, label, extractor, expected) {
    const { data, error } = await supabase
      .from("srd_library")
      .select("*")
      .eq("ruleset", "5e")
      .eq("category", category)
      .eq("srd_id", srdId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      console.log(`FAIL  ${label} -- no row found for ${category}/${srdId}`);
      failures++;
      return;
    }
    check(label, extractor(data), expected);
  }

  await checkRow("spells", "fireball", "DB: Fireball level/school", (r) => [r.level, r.data_json.school], [3, "Evocation"]);
  await checkRow("classes", "wizard", "DB: Wizard hit die", (r) => r.data_json.hitDie, 6);
  await checkRow("magic-items", "bag-of-holding", "DB: Bag of Holding rarity", (r) => r.rarity, "Uncommon");
}

async function main() {
  await verifyOffline();
  if (process.argv.includes("--live")) {
    await verifyLive();
  } else {
    console.log("Skipping live DB checks (no --live flag / no reachable Supabase project in this sandbox).");
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
