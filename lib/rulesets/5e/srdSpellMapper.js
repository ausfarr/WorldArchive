// lib/rulesets/5e/srdSpellMapper.js
//
// Converts a srd_library row's raw ingested data_json (see
// scripts/ingestSrd5eFull.js's parseSpells) into the shape
// lib/rulesets/5e/spellTemplate.js already expects. Same role
// srdMonsterMapper.js / srdItemMapper.js / srdClassMapper.js play for
// Enemies/Items/Classes' Import/Reflavor tiers.
//
// cantripBaseDamage (the one field spellTemplate.js's cantrip damage-
// scaling table needs) is NOT parsed from the ingested source here --
// the source's "Cantrip Upgrade" text is prose ("The damage increases
// by 1d10 when you reach levels 5 (2d10)..."), not a structured base-
// damage field, and reliably regex-parsing a base dice count/type out of
// arbitrary spell description prose for every damaging cantrip is real
// parser work with real failure modes, not attempted here. An imported/
// reflavored cantrip's scaling is still fully described in its
// atHigherLevels text (carried through from the source verbatim), just
// not rendered as the extra computed table Homebrew cantrips get.

function parseComponents(text) {
  // "V, S, M (a ball of bat guano and sulfur)" ->
  // { components: "V, S, M", materialComponent: "a ball of bat guano and sulfur" }
  const raw = String(text || "").trim();
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { components: m[1].trim(), materialComponent: m[2].trim() };
  return { components: raw || null, materialComponent: null };
}

function mapSrdSpellMechanics(dataJson) {
  const { components, materialComponent } = parseComponents(dataJson.components);
  const castingTime = dataJson.castingTime || null;
  const duration = dataJson.duration || null;

  return {
    level: dataJson.level,
    school: dataJson.school,
    ritual: /ritual/i.test(castingTime || ""),
    concentration: /concentration/i.test(duration || ""),
    castingTime,
    range: dataJson.range || null,
    components,
    materialComponent,
    duration,
    classes: dataJson.classes || [],
    description: dataJson.description || null,
    atHigherLevels: dataJson.atHigherLevels || null,
    cantripBaseDamage: null
  };
}

module.exports = { mapSrdSpellMechanics };
