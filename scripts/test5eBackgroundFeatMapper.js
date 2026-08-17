// scripts/test5eBackgroundFeatMapper.js
//
// R6 Phase 3: real test coverage for the Background -> Origin Feat grant
// (this project's hard rule: formula/mechanic changes need real test
// coverage) -- covers all 4 real ingested backgrounds (Acolyte,
// Criminal, Sage, Soldier), not just the minimum 3, plus the ASI-level
// General Feat pool's real filtering rules (Epic Boon level-gating, the
// non-repeatable-duplicate exclusion, repeatable feats correctly staying
// available) and the fallback shape's parity.
//
// Pure offline unit tests against the real parsers/mappers, re-fetching
// the live source markdown fresh (same "offline, no Supabase needed"
// contract as scripts/verifySrdOriginsIngest.js / test5eRaceSystemMapper.js).
//
// Run with: node scripts/test5eBackgroundFeatMapper.js

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:1";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "offline-test-placeholder";

const { parseBackgrounds } = require("./ingestSrdOrigins5e");
const { parseFeats } = require("./ingestSrd5eFull");
const { mapSrdBackgroundRows, parseSkillNamesToKeys } = require("../lib/rulesets/5e/srdBackgroundMapper");
const { mapSrdFeatRows, parseCategoryAndPrerequisite } = require("../lib/rulesets/5e/srdFeatMapper");
const { joinOriginFeats, eligibleAsiFeats, getRealBackgroundsAndFeats } = require("../lib/rulesets/5e/backgroundsAndFeatsSeed");
const { CORE_BACKGROUNDS, CORE_FEATS } = require("../lib/rulesets/5e/backgroundsAndFeats");

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

// -- parseCategoryAndPrerequisite ------------------------------------------
check("Plain 'Origin Feat' -> category Origin, no prerequisite",
  parseCategoryAndPrerequisite("Origin Feat"), { category: "Origin", prerequisite: null });
check("'Epic Boon Feat (Prerequisite: Level 19+)' -> category + prerequisite split",
  parseCategoryAndPrerequisite("Epic Boon Feat (Prerequisite: Level 19+)"), { category: "Epic Boon", prerequisite: "Level 19+" });
check("'General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+)' -> full prerequisite text kept",
  parseCategoryAndPrerequisite("General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+)"), { category: "General", prerequisite: "Level 4+, Strength or Dexterity 13+" });

// -- parseSkillNamesToKeys --------------------------------------------------
check("'Insight and Religion' -> [insight, religion]", parseSkillNamesToKeys("Insight and Religion"), ["insight", "religion"]);
check("'Sleight of Hand and Stealth' -> [sleight_of_hand, stealth]", parseSkillNamesToKeys("Sleight of Hand and Stealth"), ["sleight_of_hand", "stealth"]);

async function main() {
  const originsText = await fetchText("character-origins.md");
  const featsText = await fetchText("feats.md");

  const bgRows = parseBackgrounds(originsText).map((b) => ({ srd_id: b.srd_id, name: b.name, data_json: b.data_json }));
  const featRows = parseFeats(featsText).map((f) => ({ srd_id: f.srd_id, name: f.name, data_json: f.data_json }));

  const feats = mapSrdFeatRows(featRows);
  const backgrounds = joinOriginFeats(mapSrdBackgroundRows(bgRows), feats);
  const bgByName = (n) => backgrounds.find((b) => b.name === n);

  // -- The Background -> Origin Feat grant itself, all 4 real backgrounds --
  check("Acolyte -> Magic Initiate (non-repeatable? no, repeatable)", [bgByName("Acolyte").originFeat.name, bgByName("Acolyte").originFeat.repeatable], ["Magic Initiate", true]);
  check("Criminal -> Alert (non-repeatable)", [bgByName("Criminal").originFeat.name, bgByName("Criminal").originFeat.repeatable], ["Alert", false]);
  check("Sage -> Magic Initiate (same repeatable feat as Acolyte, different option)", [bgByName("Sage").originFeat.name, bgByName("Sage").originFeatOption], ["Magic Initiate", "Wizard"]);
  check("Soldier -> Savage Attacker (non-repeatable)", [bgByName("Soldier").originFeat.name, bgByName("Soldier").originFeat.repeatable], ["Savage Attacker", false]);
  check("Every real background resolved a real originFeat (no silent join miss)", backgrounds.every((b) => !!b.originFeat), true);
  check("Every real background carries the CC-BY-4.0 license note", backgrounds.every((b) => !!b.licenseNote), true);

  // -- Background equipment/tool-proficiency auto-resolve (Quest slot-
  // fill session -- see
  // session_addendum_quest_slot_fill_ruleset_and_background_equipment.md).
  // The SRD source embeds unresolved player CHOICE text directly in the
  // Tool Proficiency/Equipment fields ("Choose one kind of X", "Choose A
  // or B") -- srdBackgroundMapper.js resolves both deterministically at
  // read time, no AI call.
  check("Soldier's Tool Proficiency resolves 'Choose one kind of Gaming Set' to a concrete tool", bgByName("Soldier").toolProficiency, "Dice Set");
  check("No background's resolved Equipment still contains the raw 'Choose' instruction", backgrounds.every((b) => !/Choose/i.test(b.equipment)), true);
  check("Soldier's resolved Equipment shows the concrete tool, not '(same as above)'", /Dice Set/.test(bgByName("Soldier").equipment) && !/same as above/i.test(bgByName("Soldier").equipment), true);
  check("Every real background's Option B gold alternative was preserved (equipmentGoldAlternative)", backgrounds.every((b) => !!b.equipmentGoldAlternative), true);

  // -- eligibleAsiFeats: Epic Boon level-gating -----------------------------
  const poolLevel4 = eligibleAsiFeats(feats, { totalLevel: 4 });
  const poolLevel19 = eligibleAsiFeats(feats, { totalLevel: 19 });
  check("Epic Boon feats excluded below level 19", poolLevel4.some((f) => f.category === "Epic Boon"), false);
  check("Epic Boon feats included at level 19+", poolLevel19.some((f) => f.category === "Epic Boon"), true);
  check("Non-Epic-Boon feat count unaffected by level", poolLevel4.filter((f) => f.category !== "Epic Boon").length, poolLevel19.filter((f) => f.category !== "Epic Boon").length);

  // -- eligibleAsiFeats: non-repeatable duplicate exclusion -----------------
  const criminalOriginKey = bgByName("Criminal").originFeat.key; // Alert, non-repeatable
  const poolExcludingAlert = eligibleAsiFeats(feats, { totalLevel: 4, excludeNonRepeatableKey: criminalOriginKey });
  check("Criminal's own (non-repeatable) Alert is excluded from its ASI-level pool", poolExcludingAlert.some((f) => f.key === criminalOriginKey), false);

  const acolyteOriginKey = bgByName("Acolyte").originFeat.key; // Magic Initiate, repeatable
  const poolKeepingMagicInitiate = eligibleAsiFeats(feats, { totalLevel: 4, excludeNonRepeatableKey: acolyteOriginKey });
  check("Acolyte's own (repeatable) Magic Initiate is NOT excluded -- real 2024 rule allows taking it again", poolKeepingMagicInitiate.some((f) => f.key === acolyteOriginKey), true);

  // -- Fallback shape parity (offline mode, srd_library unreachable) -------
  const fallback = await getRealBackgroundsAndFeats(); // SUPABASE_URL points nowhere -> forces the fallback path
  check("Fallback falls back to the hand-authored background count", fallback.backgrounds.length, CORE_BACKGROUNDS.length);
  check("Fallback falls back to the hand-authored feat count", fallback.feats.length, CORE_FEATS.length);
  check("Fallback backgrounds honestly report no Origin Feat (old shape predates the mechanic)", fallback.backgrounds.every((b) => b.originFeat === null), true);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test script failed:", err);
  process.exit(1);
});
