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
//
// - toolProficiency/equipment: the SRD source text for some Backgrounds
//   embeds an unresolved player CHOICE directly in the field text --
//   e.g. Soldier's real source line is `**Tool Proficiency:** _Choose one
//   kind of_ Gaming Set (see "Equipment")` and every one of the 4 real
//   SRD backgrounds' Equipment line reads `_Choose A or B:_ (A) <gear
//   list>; or (B) <gold>`. Left unresolved, that instructional text got
//   rendered verbatim onto a generated PC's character sheet (looks like
//   the PC's actual gear, not an unresolved chargen instruction --
//   session_addendum_quest_slot_fill_ruleset_and_background_equipment.md
//   has the full story). Resolved deterministically below, no AI call --
//   this project's standing preference over fuzzy/AI resolution wherever
//   the input space is small and closed (same reasoning as the
//   entry-linking system's normalized-name matching). Only Soldier's
//   Tool Proficiency and all 4 backgrounds' Equipment actually need this
//   today (confirmed against the real ingested source), but both
//   resolvers fall back to the raw text untouched if the pattern doesn't
//   match -- safe for a future non-core background with different
//   phrasing, and for any background that was never a choice to begin
//   with.

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

// Extensible if a future non-core background introduces another "choose
// one kind of X" tool category (Musical Instrument, Artisan's Tools,
// etc.) -- but only Gaming Set exists in the current 4-background SRD
// set (Soldier), so this isn't over-built beyond that one real case.
const TOOL_CATEGORY_DEFAULTS = {
  "gaming set": "Dice Set"
};

// "_Choose one kind of_ Gaming Set (see "Equipment")" -> captures
// "Gaming Set" -> resolved via TOOL_CATEGORY_DEFAULTS -> "Dice Set".
// (note: no whitespace between "of" and the source's own italics-closing
// "_", hence the optional "_?" before \s+.)
function resolveToolProficiency(text) {
  if (!text) return text;
  const match = String(text).match(/Choose one kind of_?\s+(.+?)\s*\(see/i);
  if (!match) return text;
  const resolved = TOOL_CATEGORY_DEFAULTS[match[1].trim().toLowerCase()];
  return resolved || text; // unresolved category -- safe fallback to the raw text rather than erroring
}

// "_Choose A or B:_ (A) Spear, Shortbow, 20 Arrows, Gaming Set (same as
// above), Healer's Kit, Quiver, Traveler's Clothes, 14 GP; or (B) 50 GP"
// -> resolves to Option A's item list (a starting-gear kit is more
// useful/flavorful on a generated PC's sheet than a flat gold amount),
// with Option A's "(same as above)" back-reference (Soldier only) swapped
// for the concrete tool name once resolveToolProficiency has actually
// resolved one -- `resolvedToolProficiency` still reading "Choose ..."
// means resolution failed (unrecognized category), so the substitution
// is skipped rather than baking an unresolved instruction into the swap.
// Option B (the gold alternative) is kept on the side as
// equipmentGoldAlternative rather than discarded outright.
function resolveEquipment(text, resolvedToolProficiency) {
  if (!text) return { equipment: text, equipmentGoldAlternative: null };
  const match = String(text).match(/Choose A or B:_?\s*\(A\)\s*(.+?)\s*[;,]?\s*or\s*\(B\)\s*(.+)$/i);
  if (!match) return { equipment: text, equipmentGoldAlternative: null };

  let optionA = match[1].trim();
  const optionB = match[2].trim();
  if (resolvedToolProficiency && !/choose/i.test(resolvedToolProficiency)) {
    optionA = optionA.replace(/\(same as above\)/i, `(${resolvedToolProficiency})`);
  }
  return { equipment: optionA, equipmentGoldAlternative: optionB };
}

function mapSrdBackgroundToEntry(row) {
  const d = row.data_json || {};
  const toolProficiency = resolveToolProficiency(d.toolProficiency);
  const { equipment, equipmentGoldAlternative } = resolveEquipment(d.equipment, toolProficiency);
  return {
    key: row.srd_id,
    name: d.name || row.name,
    abilityScores: d.abilityScores || null,
    skillProficiencies: parseSkillNamesToKeys(d.skillProficiencies),
    toolProficiency,
    equipment,
    equipmentGoldAlternative,
    originFeatName: d.featName || null,
    originFeatOption: d.featOption || null
  };
}

function mapSrdBackgroundRows(rows) {
  return (rows || []).map(mapSrdBackgroundToEntry);
}

module.exports = { mapSrdBackgroundToEntry, mapSrdBackgroundRows, parseSkillNamesToKeys, resolveToolProficiency, resolveEquipment, TOOL_CATEGORY_DEFAULTS };
