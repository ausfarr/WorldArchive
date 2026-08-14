// lib/rulesets/5e/srdBackgroundMapper.js
//
// R6 Phase 3: converts a srd_library 'backgrounds' row's raw ingested
// data_json (see scripts/ingestSrdOrigins5e.js's parseBackgrounds, R6
// Phase 1) into the shape this ruleset's PC-generation code needs.
//
// Two real fields need parsing, not just copying:
//
// - skillProficiencies: the source is free text ("Insight and
//   Religion"), but every other part of this codebase (Passive
//   Perception, the manual-entry skill checklist, survivorTemplate.js's
//   rendering) works with the real 18-key skill vocabulary from
//   classFormulas.js's SKILLS table -- so this parses the real skill
//   NAMES back into keys via a name->key lookup built from that same
//   table, rather than introducing a second skill vocabulary.
//
// - originFeatName/originFeatOption: already split out by Phase 1's
//   ingestion script (e.g. featName "Magic Initiate", featOption
//   "Cleric" for Acolyte) but NOT yet resolved into a real Feat object
//   here -- that requires the separate 'feats' srd_library category
//   (already ingested by R5 Phase 4), so the actual origin-feat join
//   happens one level up, in backgroundsAndFeatsSeed.js, which has both
//   lists in hand at once.

const { SKILLS } = require("./classFormulas");

const SKILL_KEY_BY_NAME = Object.fromEntries(SKILLS.map((s) => [s.name.toLowerCase(), s.key]));

function parseSkillNamesToKeys(text) {
  if (!text) return [];
  return String(text)
    .split(/\s*(?:,|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((n) => SKILL_KEY_BY_NAME[n.toLowerCase()])
    .filter(Boolean);
}

function mapSrdBackgroundToEntry(row) {
  const d = row.data_json || {};
  return {
    key: row.srd_id,
    name: d.name || row.name,
    abilityScores: d.abilityScores || null,
    skillProficiencies: parseSkillNamesToKeys(d.skillProficiencies),
    toolProficiency: d.toolProficiency || null,
    equipment: d.equipment || null,
    originFeatName: d.featName || null,
    originFeatOption: d.featOption || null
  };
}

function mapSrdBackgroundRows(rows) {
  return (rows || []).map(mapSrdBackgroundToEntry);
}

module.exports = { mapSrdBackgroundToEntry, mapSrdBackgroundRows, parseSkillNamesToKeys };
