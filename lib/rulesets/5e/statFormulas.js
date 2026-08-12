// lib/rulesets/5e/statFormulas.js
//
// Real 5e math: ability modifiers, proficiency bonus, and the DMG's
// actual Challenge Rating algorithm (DMG ch. 9, "Creating a Monster" --
// the "Monster Statistics by Challenge Rating" table and its averaging
// method). This is the ruleset-genericization project's Phase 3 proof of
// concept -- see session_addendum_ruleset_genericization.md.
//
// Echoes' lib/statFormulas.js is untouched and unrelated -- this is a
// completely different mechanical system living in its own file, per
// this project's hard constraint that ruleset-specific logic never
// reuses or repurposes Echoes' formula files.
//
// TABLE PROVENANCE: the CHALLENGE_THRESHOLDS table below encodes the
// DMG's own numeric CR thresholds (HP/AC/attack-bonus/damage-per-round/
// save-DC bands per CR, plus proficiency bonus by CR) -- these are game
// mechanics/balance numbers, not literary SRD text, and are reproduced
// across countless independent unofficial GM tools for that reason (not
// under CC-BY-4.0 -- they don't need to be; mechanical thresholds like
// this aren't the kind of expression copyright protects). Cross-checked
// row-by-row against the MIT-licensed github.com/AsmodeusXI/dnd-5e-cr-calculator
// implementation of the same table while building this file. That
// project's own CR-25 row has an obvious transcription bug (`sdc: 11`,
// breaking an otherwise-monotonic 20/20/20/21/21/21/22/22/22/23
// sequence) -- fixed to 21 here. See SESSION_LOG.md's Phase 3 entry.
//
// ROUNDING RULE for averaging Defensive CR + Offensive CR into a final
// CR: round up on an exact half (verified against a worked DMG example:
// offensive 9 + defensive 6 -> 7.5 -> published result is CR 8, not 7).

const CHALLENGE_THRESHOLDS = [
  { cr: "0", prof: 2, ac: 13, hpLow: 1, hpHigh: 6, atk: 3, dprLow: 0, dprHigh: 1, sdc: 13 },
  { cr: "1/8", prof: 2, ac: 13, hpLow: 7, hpHigh: 35, atk: 3, dprLow: 2, dprHigh: 3, sdc: 13 },
  { cr: "1/4", prof: 2, ac: 13, hpLow: 36, hpHigh: 49, atk: 3, dprLow: 4, dprHigh: 5, sdc: 13 },
  { cr: "1/2", prof: 2, ac: 13, hpLow: 50, hpHigh: 70, atk: 3, dprLow: 6, dprHigh: 8, sdc: 13 },
  { cr: "1", prof: 2, ac: 13, hpLow: 71, hpHigh: 85, atk: 3, dprLow: 9, dprHigh: 14, sdc: 13 },
  { cr: "2", prof: 2, ac: 13, hpLow: 86, hpHigh: 100, atk: 3, dprLow: 15, dprHigh: 20, sdc: 13 },
  { cr: "3", prof: 2, ac: 13, hpLow: 101, hpHigh: 115, atk: 4, dprLow: 21, dprHigh: 26, sdc: 13 },
  { cr: "4", prof: 2, ac: 14, hpLow: 116, hpHigh: 130, atk: 5, dprLow: 27, dprHigh: 32, sdc: 14 },
  { cr: "5", prof: 3, ac: 15, hpLow: 131, hpHigh: 145, atk: 6, dprLow: 33, dprHigh: 38, sdc: 15 },
  { cr: "6", prof: 3, ac: 15, hpLow: 146, hpHigh: 160, atk: 6, dprLow: 39, dprHigh: 44, sdc: 15 },
  { cr: "7", prof: 3, ac: 15, hpLow: 161, hpHigh: 175, atk: 6, dprLow: 45, dprHigh: 50, sdc: 15 },
  { cr: "8", prof: 3, ac: 16, hpLow: 176, hpHigh: 190, atk: 7, dprLow: 51, dprHigh: 56, sdc: 16 },
  { cr: "9", prof: 4, ac: 16, hpLow: 191, hpHigh: 205, atk: 7, dprLow: 57, dprHigh: 62, sdc: 16 },
  { cr: "10", prof: 4, ac: 17, hpLow: 206, hpHigh: 220, atk: 7, dprLow: 63, dprHigh: 68, sdc: 16 },
  { cr: "11", prof: 4, ac: 17, hpLow: 221, hpHigh: 235, atk: 8, dprLow: 69, dprHigh: 74, sdc: 17 },
  { cr: "12", prof: 4, ac: 17, hpLow: 236, hpHigh: 250, atk: 8, dprLow: 75, dprHigh: 80, sdc: 17 },
  { cr: "13", prof: 5, ac: 18, hpLow: 251, hpHigh: 265, atk: 8, dprLow: 81, dprHigh: 86, sdc: 18 },
  { cr: "14", prof: 5, ac: 18, hpLow: 266, hpHigh: 280, atk: 8, dprLow: 87, dprHigh: 92, sdc: 18 },
  { cr: "15", prof: 5, ac: 18, hpLow: 281, hpHigh: 295, atk: 8, dprLow: 93, dprHigh: 98, sdc: 18 },
  { cr: "16", prof: 5, ac: 18, hpLow: 296, hpHigh: 310, atk: 9, dprLow: 99, dprHigh: 104, sdc: 18 },
  { cr: "17", prof: 6, ac: 19, hpLow: 311, hpHigh: 325, atk: 10, dprLow: 105, dprHigh: 110, sdc: 19 },
  { cr: "18", prof: 6, ac: 19, hpLow: 326, hpHigh: 340, atk: 10, dprLow: 111, dprHigh: 116, sdc: 19 },
  { cr: "19", prof: 6, ac: 19, hpLow: 341, hpHigh: 355, atk: 10, dprLow: 117, dprHigh: 122, sdc: 19 },
  { cr: "20", prof: 6, ac: 19, hpLow: 356, hpHigh: 400, atk: 10, dprLow: 123, dprHigh: 140, sdc: 19 },
  { cr: "21", prof: 7, ac: 19, hpLow: 401, hpHigh: 445, atk: 11, dprLow: 141, dprHigh: 158, sdc: 20 },
  { cr: "22", prof: 7, ac: 19, hpLow: 446, hpHigh: 490, atk: 11, dprLow: 159, dprHigh: 176, sdc: 20 },
  { cr: "23", prof: 7, ac: 19, hpLow: 491, hpHigh: 535, atk: 11, dprLow: 177, dprHigh: 194, sdc: 20 },
  { cr: "24", prof: 7, ac: 19, hpLow: 536, hpHigh: 580, atk: 12, dprLow: 195, dprHigh: 212, sdc: 21 },
  { cr: "25", prof: 8, ac: 19, hpLow: 581, hpHigh: 625, atk: 12, dprLow: 213, dprHigh: 230, sdc: 21 },
  { cr: "26", prof: 8, ac: 19, hpLow: 626, hpHigh: 670, atk: 12, dprLow: 231, dprHigh: 248, sdc: 21 },
  { cr: "27", prof: 8, ac: 19, hpLow: 671, hpHigh: 715, atk: 13, dprLow: 249, dprHigh: 266, sdc: 22 },
  { cr: "28", prof: 8, ac: 19, hpLow: 716, hpHigh: 760, atk: 13, dprLow: 267, dprHigh: 284, sdc: 22 },
  { cr: "29", prof: 9, ac: 19, hpLow: 761, hpHigh: 805, atk: 13, dprLow: 285, dprHigh: 302, sdc: 22 },
  { cr: "30", prof: 9, ac: 19, hpLow: 806, hpHigh: 850, atk: 14, dprLow: 303, dprHigh: 320, sdc: 23 }
];

function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function proficiencyBonusForCr(cr) {
  const row = CHALLENGE_THRESHOLDS.find((r) => r.cr === String(cr));
  return row ? row.prof : 2;
}

// Parses a dice-notation average damage roll, e.g. "2d6+3" -> 10,
// "1d4" -> 2.5 (kept fractional -- callers round only at the point CR
// math needs a whole number; the raw average is also useful for display).
// Multiple terms joined by +/- are supported ("2d6+1d4+2").
function averageDamageFromDice(diceExpression) {
  if (typeof diceExpression === "number") return diceExpression;
  if (!diceExpression) return 0;
  const cleaned = String(diceExpression).replace(/\s+/g, "");
  const terms = cleaned.match(/[+-]?\d+d\d+|[+-]?\d+/g) || [];
  let total = 0;
  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const unsigned = term.replace(/^[+-]/, "");
    const diceMatch = unsigned.match(/^(\d+)d(\d+)$/);
    if (diceMatch) {
      const count = Number(diceMatch[1]);
      const sides = Number(diceMatch[2]);
      total += sign * count * ((sides + 1) / 2);
    } else {
      total += sign * Number(unsigned);
    }
  }
  return total;
}

function findThresholdIndexByHp(hp) {
  const idx = CHALLENGE_THRESHOLDS.findIndex((row) => hp >= row.hpLow && hp <= row.hpHigh);
  return idx >= 0 ? idx : CHALLENGE_THRESHOLDS.length - 1;
}

function findThresholdIndexByDpr(dpr) {
  const idx = CHALLENGE_THRESHOLDS.findIndex((row) => dpr >= row.dprLow && dpr <= row.dprHigh);
  return idx >= 0 ? idx : CHALLENGE_THRESHOLDS.length - 1;
}

function clampIndex(i) {
  return Math.max(0, Math.min(CHALLENGE_THRESHOLDS.length - 1, i));
}

// DMG's "round up or down 1 step per 2 points of difference" adjustment,
// used for both the AC-vs-expected-AC (defensive) and
// attack-bonus/save-DC-vs-expected (offensive) adjustments.
function stepAdjustment(actual, expected) {
  return Math.ceil((actual - expected) / 2);
}

// Effective HP adjustment for damage resistance/immunity (DMG p.278,
// "Damage Resistance and Immunity to Damage" -- an EXPLICITLY qualitative
// GM judgment call in the book, not a hard formula: "roughly double" EHP
// for resistance to most damage, "roughly triple" isn't stated either --
// community practice converged on doubling for either resistance or
// immunity to a broad spread of common damage types, so that's what's
// implemented here. Flagged the same way Echoes' own itemFormulas.js
// flags its provisional armor DR formula -- this is an approximation of
// qualitative guidance, not a transcribed table value like the CR
// thresholds above.
function effectiveHp(hp, { resistantToCommonDamage = false, immuneToCommonDamage = false } = {}) {
  if (immuneToCommonDamage || resistantToCommonDamage) return hp * 2;
  return hp;
}

// Core DMG algorithm. Inputs are already-resolved numbers, not raw
// stat-block text -- callers (the enemy template / homebrew generation
// route) are responsible for turning a monster's actions into
// damagePerRound (average damage of its most damaging routine) and
// attackBonus (that routine's to-hit bonus), and separately the highest
// save DC among its save-forcing abilities, if any -- exactly the two
// "offensive" inputs the DMG method itself asks for.
//
// Returns { cr, defensiveCr, offensiveCr, prof } -- cr/defensiveCr/
// offensiveCr are the official string tokens ("1/4", "13", etc.) so
// display code never has to re-derive fraction formatting.
function computeChallengeRating({ hp, ac, damagePerRound, attackBonus = 0, saveDC = 0, resistantToCommonDamage = false, immuneToCommonDamage = false }) {
  const ehp = Math.round(effectiveHp(hp, { resistantToCommonDamage, immuneToCommonDamage }));

  const hpIdx = findThresholdIndexByHp(ehp);
  const acAdjust = stepAdjustment(ac, CHALLENGE_THRESHOLDS[hpIdx].ac);
  const defIdx = clampIndex(hpIdx + acAdjust);

  // DPR bands are contiguous whole numbers (0-1, 2-3, 4-5, 6-8, ...) --
  // averageDamageFromDice() can return a fractional average (e.g. 1d6+2
  // = 5.5), which wouldn't land in any band unrounded. Round to the
  // nearest whole number first, same as the DMG's own worked examples
  // ("record the average damage... as a whole number").
  const dprIdx = findThresholdIndexByDpr(Math.round(damagePerRound));
  const atkAdjust = stepAdjustment(attackBonus, CHALLENGE_THRESHOLDS[dprIdx].atk);
  const sdcAdjust = stepAdjustment(saveDC, CHALLENGE_THRESHOLDS[dprIdx].sdc);
  // Whichever offensive lever (attack bonus or save DC) pushes CR higher
  // wins -- a monster might rely on either or both, and the DMG method
  // takes the more dangerous reading rather than averaging the two levers
  // against each other.
  const offIdx = clampIndex(Math.max(dprIdx + atkAdjust, dprIdx + sdcAdjust));

  const finalIdx = defIdx === offIdx ? defIdx : clampIndex(Math.ceil((defIdx + offIdx) / 2));

  return {
    cr: CHALLENGE_THRESHOLDS[finalIdx].cr,
    defensiveCr: CHALLENGE_THRESHOLDS[defIdx].cr,
    offensiveCr: CHALLENGE_THRESHOLDS[offIdx].cr,
    prof: CHALLENGE_THRESHOLDS[finalIdx].prof
  };
}

// "1/4" -> 0.25, "13" -> 13 -- for sorting/comparison, not display (keep
// the official string token for anything user-facing).
function crToNumber(crToken) {
  if (crToken == null) return null;
  const s = String(crToken);
  if (s.includes("/")) {
    const [num, den] = s.split("/").map(Number);
    return den ? num / den : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const XP_BY_CR = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100,
  "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400,
  "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000,
  "29": 135000, "30": 155000
};

module.exports = {
  CHALLENGE_THRESHOLDS,
  abilityModifier,
  formatModifier,
  proficiencyBonusForCr,
  averageDamageFromDice,
  computeChallengeRating,
  crToNumber,
  XP_BY_CR
};
