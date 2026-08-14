// lib/rulesets/5e/srdFeatMapper.js
//
// R6 Phase 3: converts a srd_library 'feats' row's raw ingested
// data_json (see scripts/ingestSrd5eFull.js's parseFeats, R5 Phase 4 --
// this script does NOT re-ingest feats, they're already there) into a
// shape this ruleset's PC-generation code can actually use: real
// category (Origin/General/Fighting Style/Epic Boon) and prerequisite
// text pulled out of the raw combined string, plus a repeatable flag
// detected from the description -- needed to correctly allow Magic
// Initiate/Skilled to be taken a second time (once via a Background's
// Origin Feat grant, once again as a General ASI-level pick) without
// treating that as an accidental duplicate the way a non-repeatable
// feat would be.
//
// Raw data_json shape (from ingestSrd5eFull.js): { name, category,
// description } where `category` is the FULL combined string exactly as
// printed under the feat's name, e.g. "Origin Feat" or "Epic Boon Feat
// (Prerequisite: Level 19+)" or "General Feat (Prerequisite: Level 4+,
// Strength or Dexterity 13+)".

function parseCategoryAndPrerequisite(rawCategory) {
  if (!rawCategory) return { category: null, prerequisite: null };
  const match = String(rawCategory).match(/^(.+?)\s+Feat(?:\s*\(Prerequisite:\s*(.+)\))?\s*$/);
  if (!match) return { category: String(rawCategory).trim(), prerequisite: null };
  return { category: match[1].trim(), prerequisite: match[2] ? match[2].trim() : null };
}

function mapSrdFeatToEntry(row) {
  const d = row.data_json || {};
  const { category, prerequisite } = parseCategoryAndPrerequisite(d.category);
  return {
    key: row.srd_id,
    name: d.name || row.name,
    category, // "Origin" | "General" | "Fighting Style" | "Epic Boon"
    prerequisite,
    description: d.description || "",
    // Note: NOT a leading \b -- the source marks this as italic markdown
    // ("_Repeatable._ You can take this feat more than once..."), and
    // underscore counts as a \w character, so a leading \b would sit
    // between two word characters ("_" and "R") and never match. A
    // trailing \b (after "Repeatable", before the following ".") is
    // sufficient and correctly matches every real occurrence.
    repeatable: /Repeatable\b/i.test(d.description || "")
  };
}

function mapSrdFeatRows(rows) {
  return (rows || []).map(mapSrdFeatToEntry);
}

module.exports = { mapSrdFeatToEntry, mapSrdFeatRows, parseCategoryAndPrerequisite };
