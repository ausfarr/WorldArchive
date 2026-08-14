// scripts/test5eMagicItemMapper.js
//
// R6 Phase 4: real test coverage for wiring the 260 real ingested Magic
// Items into srdItemMapper.js's mapSrdItemMechanics() -- the real gap
// this phase closed: rarity/attunement were being silently dropped
// (routes/generateItem.js hardcoded rarity:null/requiresAttunement:false
// for EVERY Import/Reflavor item, correct for mundane equipment but
// wrong for a Magic Item, which the mapper now resolves for real from
// the row's own data_json instead).
//
// Pure offline unit tests against the real parser + mapper, re-fetching
// the live magic-items.md source fresh (same "offline, no Supabase
// needed" contract as this session's other verify/test scripts) --
// covers every one of the real ~258 ingested rows, not just a sample.
//
// Run with: node scripts/test5eMagicItemMapper.js

const { parseMagicItems } = require("./ingestSrd5eFull");
const { mapSrdItemMechanics, parseAttunement } = require("../lib/rulesets/5e/srdItemMapper");

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

// -- parseAttunement, hand-verified against real source text --------------
check("Plain '(Requires Attunement)', no restriction", parseAttunement("Wondrous Item, Uncommon (Requires Attunement)"), { requiresAttunement: true, attunementRequirement: null });
check("No attunement clause at all", parseAttunement("Wondrous Item, Uncommon"), { requiresAttunement: false, attunementRequirement: null });
check("Restricted: 'Requires Attunement by a Dwarf or...'", parseAttunement("Weapon (Warhammer), Very Rare (Requires Attunement by a Dwarf or a Creature Attuned to a Belt of Dwarvenkind)"), { requiresAttunement: true, attunementRequirement: "by a Dwarf or a Creature Attuned to a Belt of Dwarvenkind" });
check("Restricted: 'Requires Attunement by a Spellcaster'", parseAttunement("Wondrous Item, Uncommon (Requires Attunement by a Spellcaster)"), { requiresAttunement: true, attunementRequirement: "by a Spellcaster" });
check("Missing/empty typeLine doesn't throw", parseAttunement(undefined), { requiresAttunement: false, attunementRequirement: null });

// -- mapSrdItemMechanics: mundane equipment stays unaffected (rarity/attunement default) --
const mundaneWeapon = mapSrdItemMechanics({ name: "Longsword", itemType: "weapon", damage: "1d8 Slashing", properties: "Versatile (1d10)", mastery: "Sap", weight: "3 lb.", cost: "15 GP" });
check("Mundane weapon: rarity null, requiresAttunement false (unaffected by this phase)", [mundaneWeapon.rarity, mundaneWeapon.requiresAttunement], [null, false]);
const mundaneGear = mapSrdItemMechanics({ name: "Rope, Hempen", itemType: "Adventuring Gear", cost: "2 GP", description: "50 feet of rope." });
check("Mundane gear: rarity null (no rarity field on real mundane data_json)", mundaneGear.rarity, null);

async function main() {
  const magicItemsText = await fetchText("magic-items.md");
  const items = parseMagicItems(magicItemsText);
  check("Real magic item count is substantial (real ingestion, not a stub)", items.length > 200, true);

  const mapped = items.map((i) => ({ name: i.name, ...mapSrdItemMechanics(i.data_json) }));

  check("Every real magic item resolved a non-null rarity", mapped.every((m) => !!m.rarity), true);
  const rawAttunementCount = items.filter((i) => /Requires Attunement/i.test(i.data_json.typeLine)).length;
  const mappedAttunementCount = mapped.filter((m) => m.requiresAttunement).length;
  check("requiresAttunement=true count matches the real 'Requires Attunement' text count exactly", mappedAttunementCount, rawAttunementCount);

  const byName = (n) => mapped.find((m) => m.name === n);
  check("Bag of Holding: Uncommon, no attunement", [byName("Bag of Holding").rarity, byName("Bag of Holding").requiresAttunement], ["Uncommon", false]);
  check("Cloak of Protection: Uncommon, requires attunement, no restriction text", [byName("Cloak of Protection").rarity, byName("Cloak of Protection").requiresAttunement, byName("Cloak of Protection").attunementRequirement], ["Uncommon", true, null]);
  check("Ring of Protection: Rare, requires attunement", [byName("Ring of Protection").rarity, byName("Ring of Protection").requiresAttunement], ["Rare", true]);
  check("No magic item's real description was dropped", mapped.every((m) => !!m.description), true);
  check("Magic items get no fabricated resolvedStats (itemTemplate.js just shows rarity/description)", mapped.every((m) => m.resolvedStats === null), true);

  console.log(`\n(${items.length} real magic items parsed and mapped total)`);
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test script failed:", err);
  process.exit(1);
});
