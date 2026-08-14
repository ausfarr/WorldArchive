// lib/rulesets/5e/srdSpeciesMapper.js
//
// R6 Phase 2: converts a srd_library row's raw ingested data_json (see
// scripts/ingestSrdOrigins5e.js's parseSpecies) into the shape the
// Race/Species reference pool already expects everywhere it's read --
// lib/rulesets/5e/starterRaces.js's STARTER_5E_RACES array shape:
// { key, name, abilityScoreIncrease, choiceNote, size, speed, traits,
//   flavor }. Same role srdMonsterMapper.js/srdItemMapper.js/
// srdClassMapper.js play for their categories.
//
// Three real fields need normalizing, not just copying:
//
// - abilityScoreIncrease is always {} (no keys at all). This is
//   faithful to the real 2024 SRD, not a gap: ability score increases
//   moved from Species to Background in the 2024 rules (confirmed by
//   ingestSrdOrigins5e.js's own header finding). applyAbilityScoreIncrease()
//   in survivorFormulas.js already no-ops safely on an empty/missing
//   increase object, so this doesn't change any PC's final numbers vs.
//   what a real 2024-rules species SHOULD contribute (nothing) -- it's
//   the STARTER_5E_RACES fallback list that was actually wrong on this
//   point (2014-rules shaped), not this mapper.
//
// - size: the raw SRD text is descriptive ("Medium (about 5-7 feet
//   tall)"), and two species (Human, Tiefling) genuinely offer a
//   player's choice between Medium and Small in the real 2024 rules
//   ("...chosen when you select this species"). The UI's Size field is
//   a hard Small/Medium picklist (archive/wizard-stats.html), so this
//   maps to the first-listed size as the default and records the real
//   choice in choiceNote rather than silently dropping it.
//
// - speed: the raw SRD text is "30 feet"/"35 feet"; the UI's Speed
//   field is a plain number of feet (archive/wizard-stats.html /
//   world-info.html both format it as "${speed} ft."), so this extracts
//   just the number.
//
// flavor is left null (rendered only if present, both in
// wizard-stats.html and world-info.html) -- the source has no per-species
// one-line flavor sentence to draw from (only a section-level intro
// paragraph shared across all 9), and this project's standing precedent
// for ingested-not-hand-authored content is to carry real SRD data
// verbatim rather than fabricate prose to fill an optional field.

function parseSizeAndChoiceNote(sizeText) {
  const text = String(sizeText || "Medium");
  const firstMatch = text.match(/^(Small|Medium)\b/);
  const size = firstMatch ? firstMatch[1] : "Medium";
  const isPlayerChoice = /\bor\s+(Small|Medium)\b.*chosen when you select this species/i.test(text);
  const choiceNote = isPlayerChoice
    ? `Player's choice at character creation: can also be ${size === "Medium" ? "Small" : "Medium"} instead of ${size} (SRD: "${text}").`
    : null;
  return { size, choiceNote };
}

function parseSpeed(speedText) {
  const match = String(speedText || "").match(/(\d+)/);
  return match ? Number(match[1]) : 30;
}

function mapSrdSpeciesToRaceEntry(row) {
  const d = row.data_json || {};
  const { size, choiceNote } = parseSizeAndChoiceNote(d.size);
  return {
    key: row.srd_id,
    name: d.name || row.name,
    abilityScoreIncrease: {},
    choiceNote,
    size,
    speed: parseSpeed(d.speed),
    traits: Array.isArray(d.traits) ? d.traits : [],
    flavor: null
  };
}

function mapSrdSpeciesRows(rows) {
  return (rows || []).map(mapSrdSpeciesToRaceEntry);
}

module.exports = { mapSrdSpeciesToRaceEntry, mapSrdSpeciesRows, parseSizeAndChoiceNote, parseSpeed };
