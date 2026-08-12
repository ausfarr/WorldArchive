// lib/rulesets/generic/enemyRepo.js
//
// Write path for Generic-ruleset Bestiary entries. Needs the world's
// generic_system_json passed in (unlike the 5e/pf2e repos, which don't
// need any world-level config to render a stat block) since the
// template has to know THIS world's own attribute/derived-stat
// definitions to label the table correctly.

const { upsertEntry } = require("../../entriesRepo");
const { buildEnemyBodyHtml, buildEnemyManifestEntry } = require("./enemyTemplate");

async function saveGenericEnemyEntry(worldId, enemy, genericSystem, imageUrl) {
  const bodyHtml = buildEnemyBodyHtml(enemy, genericSystem, imageUrl);
  const manifestFields = buildEnemyManifestEntry(enemy);

  const entryMeta = {
    category: "enemies",
    id: enemy.id,
    name: enemy.name,
    eyebrow: "Bestiary Entry",
    subtitle: manifestFields.subtitle,
    faction: enemy.faction || null,
    ruleset: "generic",
    sourceMode: "homebrew",
    tags: manifestFields.tags,
    raw: enemy,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "enemies", entryMeta);
}

module.exports = { saveGenericEnemyEntry };
