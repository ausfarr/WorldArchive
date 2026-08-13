// lib/rulesets/5e/encounterDifficulty.js
//
// R4 Phase 7: real DMG (2014) Encounter Building math -- per-character
// XP thresholds by level, the monster-count XP multiplier (action
// economy makes a fight with more monsters harder for the same total
// XP), and the party-size adjustment to that multiplier. Pure math
// against data that already exists (this world's own Survivors/Bestiary
// entries) -- no generation call, no new API cost.
//
// TABLE PROVENANCE: XP_THRESHOLDS_BY_LEVEL and ENCOUNTER_MULTIPLIERS are
// among the most widely reproduced tables in the entire game (the DMG's
// own "Building an Encounter" section), same non-copyrightable-mechanics
// treatment already applied to the CR table (statFormulas.js) and the
// class-leveling tables (classFormulas.js) -- independently re-typed
// here, not copy-pasted from any source. XP_BY_CR (the per-monster CR to
// XP conversion) already exists in statFormulas.js and is reused
// directly rather than duplicated.

const { XP_BY_CR } = require("./statFormulas");

// Per-CHARACTER (not party) XP thresholds by level, 1-20. Summing each
// party member's row gives the party's own Easy/Medium/Hard/Deadly total
// XP budget.
const XP_THRESHOLDS_BY_LEVEL = {
  1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
  2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
  3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
  4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
  5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
  6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
  7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
  8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
  9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
  10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
  11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
  12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
  13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
  14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
  15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
  16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
  17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
  18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
  19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
  20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 }
};

// Number-of-monsters -> XP multiplier (action economy: more monsters at
// the same total XP is a harder fight).
const ENCOUNTER_MULTIPLIERS = [
  { min: 1, max: 1, mult: 1 },
  { min: 2, max: 2, mult: 1.5 },
  { min: 3, max: 6, mult: 2 },
  { min: 7, max: 10, mult: 2.5 },
  { min: 11, max: 14, mult: 3 },
  { min: 15, max: Infinity, mult: 4 }
];

function clampLevel(level) {
  return Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
}

// Sums each party member's own per-level threshold row into the party's
// total Easy/Medium/Hard/Deadly XP budget.
function computePartyThresholds(partyLevels) {
  const totals = { easy: 0, medium: 0, hard: 0, deadly: 0 };
  (partyLevels || []).forEach((level) => {
    const row = XP_THRESHOLDS_BY_LEVEL[clampLevel(level)];
    totals.easy += row.easy;
    totals.medium += row.medium;
    totals.hard += row.hard;
    totals.deadly += row.deadly;
  });
  return totals;
}

function multiplierIndexForCount(count) {
  const idx = ENCOUNTER_MULTIPLIERS.findIndex((r) => count >= r.min && count <= r.max);
  return idx >= 0 ? idx : ENCOUNTER_MULTIPLIERS.length - 1;
}

// Real DMG rule: shift the multiplier row up (harder) for a small party
// (fewer than 3), or down (easier) for a large party (6+) -- fewer
// defenders means each monster gets relatively more actions against the
// party, and vice versa.
function encounterMultiplier(monsterCount, partySize) {
  let idx = multiplierIndexForCount(Math.max(1, monsterCount));
  if (partySize > 0 && partySize < 3) idx = Math.min(ENCOUNTER_MULTIPLIERS.length - 1, idx + 1);
  else if (partySize >= 6) idx = Math.max(0, idx - 1);
  return ENCOUNTER_MULTIPLIERS[idx].mult;
}

// monsterCrs: array of CR strings (e.g. ["1/4", "2", "2"]), each looked
// up in the real CR->XP table (statFormulas.js's XP_BY_CR, not
// duplicated here). Unrecognized/missing CR values are skipped (a
// pre-5e/homebrew CR string outside the real 0-30 table contributes 0
// rather than throwing) rather than breaking the whole calculation.
function computeEncounterXp(monsterCrs) {
  const list = (monsterCrs || []).filter((cr) => cr != null);
  const totalXp = list.reduce((sum, cr) => sum + (XP_BY_CR[String(cr)] || 0), 0);
  return { totalXp, monsterCount: list.length };
}

// Full readout: party thresholds, the encounter's raw and action-economy-
// adjusted XP, and which real DMG tier the adjusted XP lands in.
function computeEncounterDifficulty(partyLevels, monsterCrs) {
  const thresholds = computePartyThresholds(partyLevels);
  const { totalXp, monsterCount } = computeEncounterXp(monsterCrs);
  const multiplier = encounterMultiplier(monsterCount, (partyLevels || []).length);
  const adjustedXp = Math.round(totalXp * multiplier);

  let difficulty = "Trivial";
  if (adjustedXp >= thresholds.deadly) difficulty = "Deadly";
  else if (adjustedXp >= thresholds.hard) difficulty = "Hard";
  else if (adjustedXp >= thresholds.medium) difficulty = "Medium";
  else if (adjustedXp >= thresholds.easy) difficulty = "Easy";

  return { thresholds, totalXp, multiplier, adjustedXp, monsterCount, difficulty };
}

module.exports = {
  XP_THRESHOLDS_BY_LEVEL,
  ENCOUNTER_MULTIPLIERS,
  computePartyThresholds,
  encounterMultiplier,
  computeEncounterXp,
  computeEncounterDifficulty
};
