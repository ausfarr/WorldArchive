// scripts/verifySrdOriginsIngest.js
//
// Companion to scripts/ingestSrdOrigins5e.js -- same two-mode contract
// as verifySrd5eFullIngest.js (offline re-parse by default, --live also
// checks real srd_library rows).
//
// Run with: node scripts/verifySrdOriginsIngest.js [--live]

if (!process.argv.includes("--live")) {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:0";
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "offline-verification-placeholder";
}

const { parseBackgrounds, parseSpecies } = require("./ingestSrdOrigins5e.js");

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

  const originsText = await fetchText("character-origins.md");

  const backgrounds = parseBackgrounds(originsText);
  const bgByName = (n) => backgrounds.find((b) => b.name === n);

  check("Background count (real SRD subset, not a full PHB's 16 -- see ingestSrdOrigins5e.js header)", backgrounds.length, 4);
  check("Acolyte ability scores / featName / skills", [bgByName("Acolyte").data_json.abilityScores, bgByName("Acolyte").data_json.featName, bgByName("Acolyte").data_json.skillProficiencies], ["Intelligence, Wisdom, Charisma", "Magic Initiate", "Insight and Religion"]);
  check("Criminal featName (no option parenthetical)", [bgByName("Criminal").data_json.featName, bgByName("Criminal").data_json.featOption], ["Alert", null]);
  check("Sage featName / featOption", [bgByName("Sage").data_json.featName, bgByName("Sage").data_json.featOption], ["Magic Initiate", "Wizard"]);
  check("Soldier featName", bgByName("Soldier").data_json.featName, "Savage Attacker");
  for (const bg of backgrounds) {
    check(`${bg.name} has non-empty required fields`, [
      !!bg.data_json.abilityScores, !!bg.data_json.featName, !!bg.data_json.skillProficiencies,
      !!bg.data_json.toolProficiency, !!bg.data_json.equipment
    ], [true, true, true, true, true]);
  }
  console.log("");

  const species = parseSpecies(originsText);
  const spByName = (n) => species.find((s) => s.name === n);

  check("Species count", species.length, 9);
  check("Human creature type/size/speed", [spByName("Human").data_json.creatureType, spByName("Human").data_json.size, spByName("Human").data_json.speed], ["Humanoid", "Medium (about 4–7 feet tall) or Small (about 2–4 feet tall), chosen when you select this species", "30 feet"]);
  check("Human trait count/names (3, no ASI field -- 2024 rules moved ASI to Background)", spByName("Human").data_json.traits.map((t) => t.name), ["Resourceful", "Skillful", "Versatile"]);
  check("Elf trait count (5, includes embedded Elven Lineages table text)", spByName("Elf").data_json.traits.length, 5);
  check("Elf 'Elven Lineage' trait description contains the embedded lineage table", spByName("Elf").data_json.traits.find((t) => t.name === "Elven Lineage").description.includes("Elven Lineages"), true);
  check("Dragonborn trait count (5)", spByName("Dragonborn").data_json.traits.length, 5);
  check("Gnome 'Gnomish Lineage' trait keeps Forest Gnome/Rock Gnome nested, not split out as separate traits", spByName("Gnome").data_json.traits.map((t) => t.name), ["Darkvision", "Gnomish Cunning", "Gnomish Lineage"]);
  for (const sp of species) {
    check(`${sp.name} has no abilityScoreIncrease key (faithful to real 2024 SRD)`, "abilityScoreIncrease" in sp.data_json, false);
    check(`${sp.name} has at least one trait`, sp.data_json.traits.length > 0, true);
  }
  console.log(`\n(${backgrounds.length} backgrounds, ${species.length} species parsed total)\n`);
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

  await checkRow("backgrounds", "acolyte", "DB: Acolyte featName", (r) => r.data_json.featName, "Magic Initiate");
  await checkRow("species", "human", "DB: Human trait names", (r) => r.data_json.traits.map((t) => t.name), ["Resourceful", "Skillful", "Versatile"]);
  await checkRow("species", "elf", "DB: Elf trait count", (r) => r.data_json.traits.length, 5);
}

async function main() {
  await verifyOffline();
  if (process.argv.includes("--live")) {
    await verifyLive();
  } else {
    console.log("Skipping live DB checks (no --live flag / Supabase network-blocked in this sandbox this session -- see session_addendum_r6_*.md).");
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
