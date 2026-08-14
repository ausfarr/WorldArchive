// scripts/test5eRaceSystemMapper.js
//
// R6 Phase 2: coverage for lib/rulesets/5e/srdSpeciesMapper.js's real
// parsing logic (size/speed normalization, the Human/Tiefling
// player's-choice-size case) and lib/rulesets/5e/raceSystemSeed.js's
// fallback behavior -- this project's own rule that changed/new
// formulas need real test coverage, applied here even though this is a
// mapper rather than a PC-sheet numeric formula, since size/speed/ASI
// parsing feeds directly into what a real world's Race/Species pool
// looks like.
//
// Pure offline unit tests -- no real source fetch, no Supabase needed
// (getSeedRacePool's fallback path is exercised by pointing
// SUPABASE_URL at an address nothing is listening on, so the real
// Supabase client throws/fails fast the same way this session's actual
// network-blocked sandbox did).
//
// Run with: node scripts/test5eRaceSystemMapper.js

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:1";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "offline-test-placeholder";

const { mapSrdSpeciesToRaceEntry, parseSizeAndChoiceNote, parseSpeed } = require("../lib/rulesets/5e/srdSpeciesMapper");
const { STARTER_5E_RACES } = require("../lib/rulesets/5e/starterRaces");
const { applyAbilityScoreIncrease } = require("../lib/rulesets/5e/survivorFormulas");

let failures = 0;
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass ? "" : ` -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!pass) failures++;
}

// -- parseSizeAndChoiceNote --------------------------------------------
check("Plain 'Medium (about 5-7 feet tall)' -> Medium, no choice note",
  parseSizeAndChoiceNote("Medium (about 5–7 feet tall)"),
  { size: "Medium", choiceNote: null });

check("Plain 'Small (about 3-4 feet tall)' -> Small, no choice note",
  parseSizeAndChoiceNote("Small (about 3–4 feet tall)"),
  { size: "Small", choiceNote: null });

const humanSizeText = "Medium (about 4–7 feet tall) or Small (about 2–4 feet tall), chosen when you select this species";
const humanParsed = parseSizeAndChoiceNote(humanSizeText);
check("Human dual-size text -> default Medium", humanParsed.size, "Medium");
check("Human dual-size text -> choice note mentions Small as the alternate", humanParsed.choiceNote && humanParsed.choiceNote.includes("Small instead of Medium"), true);

// -- parseSpeed -----------------------------------------------------------
check("parseSpeed('30 feet') -> 30", parseSpeed("30 feet"), 30);
check("parseSpeed('35 feet') -> 35", parseSpeed("35 feet"), 35);
check("parseSpeed(missing) -> default 30", parseSpeed(undefined), 30);

// -- mapSrdSpeciesToRaceEntry ----------------------------------------------
const dragonbornRow = {
  srd_id: "dragonborn",
  name: "Dragonborn",
  data_json: {
    name: "Dragonborn",
    creatureType: "Humanoid",
    size: "Medium (about 5–7 feet tall)",
    speed: "30 feet",
    traits: [
      { name: "Draconic Ancestry", description: "..." },
      { name: "Breath Weapon", description: "..." },
      { name: "Damage Resistance", description: "..." },
      { name: "Darkvision", description: "..." },
      { name: "Draconic Flight", description: "..." }
    ]
  }
};
const mappedDragonborn = mapSrdSpeciesToRaceEntry(dragonbornRow);
check("Mapped Dragonborn key/name/size/speed", [mappedDragonborn.key, mappedDragonborn.name, mappedDragonborn.size, mappedDragonborn.speed], ["dragonborn", "Dragonborn", "Medium", 30]);
check("Mapped Dragonborn has empty abilityScoreIncrease (real 2024 rule: species grants none)", mappedDragonborn.abilityScoreIncrease, {});
check("Mapped Dragonborn keeps all 5 real traits verbatim", mappedDragonborn.traits.length, 5);
check("Mapped Dragonborn flavor is null (no fabricated prose)", mappedDragonborn.flavor, null);

// A real PC's base ability scores must be unchanged by a real-SRD-sourced
// species with an empty abilityScoreIncrease -- confirms
// applyAbilityScoreIncrease's existing no-op guard correctly absorbs the
// 2024-rules "species grants nothing" fact without any caller-side
// special-casing.
const baseAbilities = { str: 14, dex: 12, con: 13, int: 10, wis: 8, cha: 15 };
check("applyAbilityScoreIncrease with a real-SRD species (empty increase) leaves ability scores unchanged",
  applyAbilityScoreIncrease(baseAbilities, mappedDragonborn.abilityScoreIncrease),
  baseAbilities);

// -- getSeedRacePool fallback --------------------------------------------
async function testSeedFallback() {
  const { getSeedRacePool } = require("../lib/rulesets/5e/raceSystemSeed");
  const pool = await getSeedRacePool();
  check("getSeedRacePool falls back to STARTER_5E_RACES when srd_library is unreachable", Array.isArray(pool) && pool.length === STARTER_5E_RACES.length, true);
  check("getSeedRacePool fallback pool is exactly the hand-authored starter list (not a partial/mangled read)", pool, STARTER_5E_RACES);
}

testSeedFallback().then(() => {
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exit(1);
}).catch((err) => {
  console.error("Test script failed:", err);
  process.exit(1);
});
