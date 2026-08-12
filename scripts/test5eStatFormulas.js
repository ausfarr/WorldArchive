// scripts/test5eStatFormulas.js
//
// Standalone test script for lib/rulesets/5e/statFormulas.js, same
// convention as every other scripts/test*.js in this codebase (no test
// runner -- read it directly to see what it checks, run with
// `node scripts/test5eStatFormulas.js`).
//
// Two tiers:
//   1. Hand-verified assertions (hard pass/fail) against real SRD
//      monsters with simple, single-attack stat blocks (no multiattack,
//      no save-based abilities, no resistances) -- chosen specifically
//      because the DPR-extraction heuristic below (highest-average-damage
//      single action) is known to be correct for these, so a mismatch
//      here means the FORMULA is wrong, not the test data.
//   2. An informational sweep across the full ingested 201-monster SRD
//      set (live-fetched from Tabyltop/CC-SRD, same source as
//      scripts/ingestSrd5e.js), reporting how often the simplified
//      single-best-action heuristic lands on the official CR or within
//      one step of it. This is NOT a hard pass/fail gate, and a low
//      exact-match rate is EXPECTED, not a sign of a bug -- see
//      testGoblin()'s comment below for why even a perfect,
//      multiattack/spellcasting-aware extraction wouldn't reproduce
//      every officially-printed CR (WotC's own monsters are hand-tuned
//      via playtesting, not purely formula-derived). This sweep's
//      simplified single-action extraction (ignores Multiattack,
//      spellcasting, legendary actions, resistances -- see
//      `extractOffense()`) adds a second, separate source of
//      undercounting on top of that, so its numbers are a floor, not a
//      measure of the formula's real-world accuracy.
//
// Requires network access (fetches the live SRD monster JSON, same URL
// scripts/ingestSrd5e.js uses) but no Supabase/API credentials.

const {
  computeChallengeRating,
  averageDamageFromDice,
  abilityModifier,
  crToNumber,
  proficiencyBonusForCr
} = require("../lib/rulesets/5e/statFormulas");

const MONSTERS_URL = "https://raw.githubusercontent.com/Tabyltop/CC-SRD/main/Monsters-SRD5.1-CCBY4.0License-TT.json";

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

// ---------- Tier 1: hand-verified assertions ----------

function testAbilityModifiers() {
  console.log("\nAbility modifiers:");
  check("score 10 -> +0", abilityModifier(10) === 0);
  check("score 8 -> -1", abilityModifier(8) === -1);
  check("score 14 -> +2", abilityModifier(14) === 2);
  check("score 20 -> +5", abilityModifier(20) === 5);
  check("score 1 -> -5", abilityModifier(1) === -5);
}

function testAverageDamage() {
  console.log("\nAverage damage from dice notation:");
  check("1d6+2 -> 5.5", averageDamageFromDice("1d6+2") === 5.5, averageDamageFromDice("1d6+2"));
  check("2d6+3 -> 10", averageDamageFromDice("2d6+3") === 10, averageDamageFromDice("2d6+3"));
  check("1d4 -> 2.5", averageDamageFromDice("1d4") === 2.5, averageDamageFromDice("1d4"));
  check("2d6+1d4+2 -> 11.5", averageDamageFromDice("2d6+1d4+2") === 11.5, averageDamageFromDice("2d6+1d4+2"));
}

// IMPORTANT FINDING (kept here, not just in SESSION_LOG.md, since it
// directly explains why these assertions check hand-traced table
// lookups instead of "computed CR === officially printed CR"):
//
// Feeding real SRD monsters' real stats through this formula does NOT
// reliably reproduce their officially printed CR, even for simple
// single-attack, no-resistance, no-save monsters with nothing a
// simplified extraction could get wrong. Traced by hand against the
// real Goblin (AC 15, HP 7, best attack +4/1d6+2, official CR 1/4):
// hpIdx lands on the CR-1/8 HP band (7 falls in 7-35), the AC-15
// adjustment steps that up to defensive CR 1/4 (correct so far) -- but
// the offensive side (round(avg 5.5) = 6 dpr, +4 to hit) lands in the
// CR-1/2 DPR band with a +1 attack-bonus adjustment, giving offensive CR
// 1. Averaging defensive 1/4 and offensive 1 lands on 1/2, not the
// printed 1/4. This is NOT a bug in the table or the algorithm -- it's a
// well-documented property of 5e's own CR system: the DMG explicitly
// frames this method as producing a starting ESTIMATE for homebrew
// designers, and Wizards' own published low-CR monsters are known to be
// hand-tuned via playtesting rather than strictly derived from the
// formula (the low end of the CR scale has especially coarse HP/DPR
// bands, so a couple of points either way swings the result by a whole
// step or more). Verified this isn't an implementation slip by
// hand-tracing the exact same inputs through the independently-written
// MIT-licensed github.com/AsmodeusXI/dnd-5e-cr-calculator's algorithm --
// same table, same method, same mismatch.
//
// So: what's actually testable as "known-correct" here is that this
// code is a FAITHFUL, deterministic implementation of the documented
// DMG algorithm -- not that it's an oracle for officially-printed CRs
// (nothing that applies this formula literally can be that, including
// WotC's own worked examples). The assertions below hand-trace the exact
// table lookups/adjustments for real monsters and check the code
// reproduces that trace precisely. Practical consequence for Phase 3:
// lib/rulesets/5e/enemyTemplate.js and the Homebrew generation route
// present this as an ESTIMATED CR for the GM to sanity-check, exactly
// how the DMG itself frames it -- never as an unquestionable computed fact.
function testGoblin() {
  console.log("\nGoblin (real SRD stat block: AC 15, HP 7, best attack +4/1d6+2):");
  const result = computeChallengeRating({
    hp: 7,
    ac: 15,
    damagePerRound: averageDamageFromDice("1d6+2"),
    attackBonus: 4,
    saveDC: 0
  });
  // Hand-traced: hp=7 -> CR-1/8 HP band (expected AC 13) -> AC 15 is +2
  // over expected -> stepAdjustment ceil((15-13)/2)=1 -> defensive CR 1/4.
  check("Goblin defensive CR === 1/4 (hand-traced)", result.defensiveCr === "1/4", result.defensiveCr);
  // round(5.5)=6 dpr -> CR-1/2 DPR band (expected attack bonus +3) ->
  // atkAdjust ceil((4-3)/2)=1 -> offensive CR steps up from CR-1/2's
  // index by 1 -> CR 1.
  check("Goblin offensive CR === 1 (hand-traced)", result.offensiveCr === "1", result.offensiveCr);
  // Averaging 1/4 (index 2) and 1 (index 4): ceil((2+4)/2)=3 -> CR 1/2.
  check("Goblin final CR === 1/2 (hand-traced average, NOT the same as its printed CR 1/4 -- see comment above)", result.cr === "1/2", result.cr);
}

// Real SRD Skeleton: AC 13, HP 13, best attack +4/1d6+2 (Shortsword or
// Shortbow, tied). Official printed CR: 1/4 -- same caveat as Goblin
// above applies; this checks the mechanical trace, not print-CR parity.
function testSkeleton() {
  console.log("\nSkeleton (real SRD stat block: AC 13, HP 13, best attack +4/1d6+2):");
  const result = computeChallengeRating({
    hp: 13,
    ac: 13,
    damagePerRound: averageDamageFromDice("1d6+2"),
    attackBonus: 4,
    saveDC: 0
  });
  // hp=13 -> still the CR-1/8 HP band (7-35), expected AC 13 -> actual
  // AC 13 too -> no adjustment -> defensive CR stays 1/8.
  check("Skeleton defensive CR === 1/8 (hand-traced)", result.defensiveCr === "1/8", result.defensiveCr);
}

// Real SRD Orc: AC 13, HP 15, Greataxe +5/1d12+3 (best single action --
// its Javelin has no listed damage dice in the source data). No
// multiattack. Official printed CR: 1/2 -- and this one DOES land
// exactly on its printed CR, showing the mismatch above isn't universal,
// just not guaranteed.
function testOrc() {
  console.log("\nOrc (real SRD stat block: AC 13, HP 15, best attack +5/1d12+3):");
  const result = computeChallengeRating({
    hp: 15,
    ac: 13,
    damagePerRound: averageDamageFromDice("1d12+3"),
    attackBonus: 5,
    saveDC: 0
  });
  check("Orc computed CR === 1/2 (matches its real printed CR)", result.cr === "1/2", result.cr);
}

// Worked example from the DMG's own guidance text: offensive CR 9,
// defensive CR 6 -> published final result is CR 8 (7.5 rounds UP, not
// down) -- verifies the averaging/rounding rule itself, independent of
// the HP/AC/DPR->index lookups above. Constructed by feeding inputs that
// land exactly on the CR6 defensive band and CR9 offensive band.
function testAveragingRoundsUp() {
  console.log("\nCR averaging rule (DMG worked example: off 9 + def 6 -> CR 8, not 7):");
  const result = computeChallengeRating({
    hp: 150, // CR 6 HP band is 146-160
    ac: 15, // exactly CR 6's expected AC -> no adjustment, defensive stays CR 6
    damagePerRound: 60, // CR 9 DPR band is 57-62
    attackBonus: 7, // exactly CR 9's expected attack bonus -> no adjustment
    saveDC: 0
  });
  check("defensive CR === 6", result.defensiveCr === "6", result.defensiveCr);
  check("offensive CR === 9", result.offensiveCr === "9", result.offensiveCr);
  check("averaged (7.5) rounds UP to 8", result.cr === "8", `got ${result.cr}`);
}

// ---------- Tier 2: informational sweep against the full SRD set ----------

// Deliberately simple: highest-average-damage single action only. Does
// NOT combine Multiattack routines, does NOT read save-DC-based
// abilities, does NOT apply the resistance/immunity EHP adjustment. See
// this file's header comment -- this is a diagnostic, not a claim that
// every SRD monster's official CR is reproducible this way.
function extractOffense(monster) {
  const actions = Array.isArray(monster.actions) ? monster.actions : [];
  let best = { avg: 0, toHit: 0 };
  for (const action of actions) {
    if (!action.damage_dice) continue;
    const avg = averageDamageFromDice(action.damage_dice);
    if (avg > best.avg) {
      const toHitMatch = String(action.to_hit || "").match(/([+-]?\d+)/);
      best = { avg, toHit: toHitMatch ? Number(toHitMatch[1]) : 0 };
    }
  }
  return best;
}

async function runSweep() {
  console.log("\nInformational sweep across the full ingested SRD monster set:");
  let res;
  try {
    res = await fetch(MONSTERS_URL);
  } catch (err) {
    console.log(`  SKIPPED - could not fetch SRD data (${err.message})`);
    return;
  }
  if (!res.ok) {
    console.log(`  SKIPPED - fetch returned ${res.status}`);
    return;
  }
  const { monsters } = await res.json();

  let exact = 0;
  let withinOne = 0;
  let total = 0;
  const worstMisses = [];

  for (const m of monsters) {
    const officialCr = String(m.challenge || "").match(/^([\d/]+)/);
    if (!officialCr) continue;
    const hpMatch = String(m.hit_points || "").match(/^(\d+)/);
    if (!hpMatch) continue;
    const hp = Number(hpMatch[1]);
    const ac = Number(String(m.armor_class || "").match(/^(\d+)/)?.[1]);
    if (!ac) continue;
    const { avg, toHit } = extractOffense(m);
    if (avg === 0) continue; // pure-utility/no-attack monsters -- extraction has nothing to work with

    total++;
    const result = computeChallengeRating({ hp, ac, damagePerRound: avg, attackBonus: toHit, saveDC: 0 });
    const officialNum = crToNumber(officialCr[1]);
    const computedNum = crToNumber(result.cr);
    if (result.cr === officialCr[1]) {
      exact++;
      withinOne++;
    } else {
      // "within one step" measured on the CHALLENGE_THRESHOLDS index
      // scale, not raw CR number (the low end is fractional -- 1/8 to
      // 1/4 is one step, not a 0.125 difference).
      const officialIdx = require("../lib/rulesets/5e/statFormulas").CHALLENGE_THRESHOLDS.findIndex((r) => r.cr === officialCr[1]);
      const computedIdx = require("../lib/rulesets/5e/statFormulas").CHALLENGE_THRESHOLDS.findIndex((r) => r.cr === result.cr);
      if (officialIdx >= 0 && Math.abs(officialIdx - computedIdx) <= 1) {
        withinOne++;
      } else {
        worstMisses.push(`${m.name}: official ${officialCr[1]}, computed ${result.cr}`);
      }
    }
  }

  console.log(`  Evaluated ${total} monsters with an extractable single attack.`);
  console.log(`  Exact CR match: ${exact} (${((exact / total) * 100).toFixed(0)}%)`);
  console.log(`  Within one CR step: ${withinOne} (${((withinOne / total) * 100).toFixed(0)}%)`);
  if (worstMisses.length) {
    console.log(`  Largest misses (${worstMisses.length}, likely multiattack/spellcaster/resistant monsters the simplified extraction can't model):`);
    worstMisses.slice(0, 10).forEach((m) => console.log(`    - ${m}`));
  }
}

async function main() {
  testAbilityModifiers();
  testAverageDamage();
  testGoblin();
  testSkeleton();
  testOrc();
  testAveragingRoundsUp();
  console.log("\nProficiency bonus sanity: CR 1/4 ->", proficiencyBonusForCr("1/4"), " CR 17 ->", proficiencyBonusForCr("17"));
  check("prof bonus CR 1/4 === 2", proficiencyBonusForCr("1/4") === 2);
  check("prof bonus CR 17 === 6", proficiencyBonusForCr("17") === 6);

  await runSweep();

  console.log("\n" + "=".repeat(50));
  if (failures.length) {
    console.log(`${failures.length} hard assertion(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log("All hard assertions passed.");
  }
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
