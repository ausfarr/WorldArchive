// lib/rulesets/generic/statFormulas.js
//
// Phase 10 (Generic/Homebrew ruleset). Unlike every other ruleset in
// this project, there's no "official" mechanical system to look up or
// verify -- a Generic world defines its OWN attributes and (optionally)
// its own derived-stat formulas via world_config.generic_system_json
// (migrations/021_generic_ruleset_system.sql). This file can't hardcode
// a real game's math the way statFormulas.js does for 5e/pf2e/Echoes --
// it's a small, honest FORMULA ENGINE that evaluates whatever simple
// linear formulas the world configured, and does nothing at all (by
// design) when the world opted for flavor-text-only stats. "Since
// arbitrary homebrew systems can't be hardcoded, don't force
// code-computed math where none was requested" -- the project's own
// scope doc, quoted directly because it's the reason this file looks
// the way it does.
//
// Formula shape (one entry in generic_system_json.derivedStats):
//   { key, label, attributeKey, coefficient, base }
// Evaluates to: base + (coefficient * attributes[attributeKey])
// Deliberately simple -- a single-attribute linear formula, not a
// general expression parser. This mirrors the SHAPE of Echoes' own
// formulas (lib/statFormulas.js: e.g. maxHealth = (body*2)+(sanity*2)+BASE
// is a sum of a few linear terms) without hardcoding Echoes' specific
// attributes/coefficients -- a world picks its own.
//
// A more expressive multi-term formula (like Echoes' actual sum of TWO
// attributes) is real future work if a Generic world ever needs it; this
// ships the single-term version since that's enough to prove the
// pattern and cover simple "one main stat drives one derived stat"
// homebrew designs.

function evaluateDerivedStat(formulaDef, attributes) {
  const attrValue = Number((attributes || {})[formulaDef.attributeKey]) || 0;
  const coefficient = Number(formulaDef.coefficient) || 0;
  const base = Number(formulaDef.base) || 0;
  return Math.round(base + coefficient * attrValue);
}

// Computes every derived stat this world configured, from a proposed
// creature's raw attributes. Returns {} (not an error) if the world has
// no formula layer at all (useFormula: false) or hasn't configured any
// derivedStats yet -- callers should treat an empty result as "this
// world uses flavor-text stats, don't render a derived-stats table."
function computeDerivedStats(genericSystem, attributes) {
  if (!genericSystem || !genericSystem.useFormula || !Array.isArray(genericSystem.derivedStats)) {
    return {};
  }
  const result = {};
  for (const formulaDef of genericSystem.derivedStats) {
    result[formulaDef.key] = evaluateDerivedStat(formulaDef, attributes);
  }
  return result;
}

// Validates that a proposed attributes object only uses keys this world
// actually defined -- catches a model hallucinating an attribute name
// that doesn't exist in this world's own system before it gets saved.
function validateAttributeKeys(genericSystem, attributes) {
  if (!genericSystem || !Array.isArray(genericSystem.attributes)) return { valid: true, unknownKeys: [] };
  const validKeys = new Set(genericSystem.attributes.map((a) => a.key));
  const unknownKeys = Object.keys(attributes || {}).filter((k) => !validKeys.has(k));
  return { valid: unknownKeys.length === 0, unknownKeys };
}

module.exports = { evaluateDerivedStat, computeDerivedStats, validateAttributeKeys };
