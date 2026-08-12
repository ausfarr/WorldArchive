// lib/rulesets/5e/srdMonsterMapper.js
//
// Maps a raw srd_library.data_json row (Tabyltop/CC-SRD's monster JSON
// shape -- see scripts/ingestSrd5e.js) onto this project's normalized
// enemy field names (lib/rulesets/5e/enemyTemplate.js's expected shape).
// Shared by both the Import path (uses the mapped fields verbatim) and
// the Reflavor path (uses the mapped MECHANICAL fields verbatim, only
// swapping in the model's rewritten narrative fields) -- see
// routes/generateEnemy.js.

function parseLeadingNumber(text) {
  const m = String(text || "").match(/^(\d+)\s*(?:\((.*)\))?/);
  if (!m) return { value: null, note: null };
  return { value: Number(m[1]), note: m[2] || null };
}

function mapSrdMonsterMechanics(data) {
  const ac = parseLeadingNumber(data.armor_class);
  const hp = parseLeadingNumber(data.hit_points);
  const crMatch = String(data.challenge || "").match(/^([\d/]+)/);
  const stats = data.stats || {};

  return {
    size: data.size || null,
    type: data.type || null,
    alignment: data.alignment || null,
    armorClass: ac.value,
    armorNote: ac.note,
    hitPoints: hp.value,
    hitDice: hp.note,
    speed: data.speed || null,
    abilities: {
      str: Number(stats.str) || 10,
      dex: Number(stats.dex) || 10,
      con: Number(stats.con) || 10,
      int: Number(stats.int) || 10,
      wis: Number(stats.wis) || 10,
      cha: Number(stats.cha) || 10
    },
    // Free-text, straight from the source -- enemyTemplate.js renders
    // these as-is (see its savingThrowsText/skillsText handling).
    savingThrows: data.saving_throws || "",
    skills: data.skills || "",
    damageVulnerabilities: data.damage_vulnerabilities || null,
    damageResistances: data.damage_resistances || null,
    damageImmunities: data.damage_immunities || null,
    conditionImmunities: data.condition_immunities || null,
    senses: data.senses || null,
    // Tabyltop's SRD 5.1 monster JSON doesn't carry a `languages` field
    // at all (checked across the full 201-monster set) -- the SRD's own
    // monster stat blocks are inconsistent about listing it, so this is
    // a real source-data gap, not a mapping bug. Falls back to an em
    // dash, matching how the official books render "no languages."
    languages: data.languages || "—",
    challengeRating: {
      cr: crMatch ? crMatch[1] : null,
      xp: null, // filled in by the caller from statFormulas.XP_BY_CR -- keeps this mapper formula-free
      defensiveCr: null,
      offensiveCr: null,
      estimated: false // official printed CR, not code-computed
    },
    // Traits/actions carry their full original description text
    // (mechanics are embedded in that prose, e.g. "+4 to hit... 1d6+2
    // damage") -- Reflavor's job is rewriting the NAME and description
    // WORDING while keeping every number in that prose unchanged; this
    // mapper just extracts the source shape both paths start from.
    traits: (data.abilities || []).map((a) => ({ name: (a.name || "").replace(/\.$/, ""), description: a.description || "" })),
    actions: (data.actions || []).map((a) => ({ name: (a.name || "").replace(/\.$/, ""), description: a.description || "" })),
    legendaryActions: (data.legendary_actions || []).map((a) => ({ name: (a.name || "").replace(/\.$/, ""), description: a.description || "" }))
  };
}

module.exports = { mapSrdMonsterMechanics };
