// lib/rulesets/generic/npcCombatDefaults.js
//
// Phase 7 pattern, Generic ruleset version: every NPC in a generic-
// ruleset world gets a lightweight default combat profile at creation.
//
// Unlike 5e/pf2e's DEFAULT_NPC_COMBAT_PROFILE (a static object, since
// both rulesets have a fixed, known attribute scale to default to zero/
// weak), a Generic world's attributes are entirely world-defined --
// there's no way to know what a "weak" value looks like on an arbitrary
// scale a world invented. buildDefaultCombatProfile() below sidesteps
// that by defaulting every attribute to 0 (true "no combat capability"
// rather than a guessed-at weak number) and DENORMALIZING each
// attribute/derived-stat's label directly onto the profile object
// itself (an array of {key, label, value}, not a bare {key: value} map
// the way Bestiary "enemies" entries store it).
//
// That denormalization is the one real design deviation from the
// Bestiary pattern (lib/rulesets/generic/enemyTemplate.js's
// buildEnemyBodyHtml(enemy, genericSystem, imageUrl) takes genericSystem
// as an explicit render-time parameter instead) -- and it's deliberate:
// lib/entryTemplate.js's buildBodyHtml(npc)/combatProfileBlock() is
// called SYNCHRONOUSLY from many places (lib/fileWriter.js's
// saveNpcEntry, regenerate previews, the static entry-file builder) with
// no async DB access available to fetch this world's generic_system_json
// at render time the way the Bestiary route already does. Baking the
// labels into the profile once, at generation time, keeps every existing
// synchronous call site working unchanged rather than threading
// genericSystem through all of them.
function buildDefaultCombatProfile(genericSystem) {
  const attributeDefs = (genericSystem && genericSystem.attributes) || [];
  const derivedStatDefs = (genericSystem && genericSystem.useFormula && genericSystem.derivedStats) || [];
  return {
    ruleset: "generic",
    attributes: attributeDefs.map((def) => ({ key: def.key, label: def.label, value: 0 })),
    derivedStats: derivedStatDefs.length ? derivedStatDefs.map((def) => ({ key: def.key, label: def.label, value: 0 })) : null,
    flavorStats: derivedStatDefs.length ? null : "No combat capability recorded yet.",
    traits: [],
    actions: [],
    isDefaultProfile: true
  };
}

// Converts a Bestiary-shaped enemy object (attributes/derivedStats as
// bare {key: value} maps, per lib/rulesets/generic/enemyTemplate.js's
// own entry shape) into the denormalized combatProfile shape above --
// used by the "Combatant" upgrade (routes/npcCombatant.js), which
// generates via the same lib/rulesets/generic/homebrewEnemyGenerator.js
// Bestiary itself uses and then needs to embed the result inside an
// NPC entry instead of saving it as its own `enemies` row.
function denormalizeEnemyIntoCombatProfile(enemy, genericSystem) {
  const attributeDefs = (genericSystem && genericSystem.attributes) || [];
  const derivedStatDefs = (genericSystem && genericSystem.useFormula && genericSystem.derivedStats) || [];
  return {
    ruleset: "generic",
    attributes: attributeDefs.map((def) => ({ key: def.key, label: def.label, value: (enemy.attributes || {})[def.key] != null ? enemy.attributes[def.key] : 0 })),
    derivedStats: derivedStatDefs.length ? derivedStatDefs.map((def) => ({ key: def.key, label: def.label, value: (enemy.derivedStats || {})[def.key] != null ? enemy.derivedStats[def.key] : 0 })) : null,
    flavorStats: enemy.flavorStats || null,
    traits: enemy.traits || [],
    actions: enemy.actions || [],
    isDefaultProfile: false
  };
}

module.exports = { buildDefaultCombatProfile, denormalizeEnemyIntoCombatProfile };
