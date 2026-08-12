// lib/rulesets/pf2e/enemyRepo.js
//
// Write path for PF2e Bestiary entries -- the pf2e counterpart to
// lib/fileWriter.js's saveEnemyEntry (Echoes) and
// lib/rulesets/5e/enemyRepo.js (5e). See routes/confirmEntry.js's enemy
// branch for the ruleset dispatch.

const { upsertEntry } = require("../../entriesRepo");
const { buildEnemyBodyHtml, buildEnemyManifestEntry } = require("./enemyTemplate");

async function savePf2eEnemyEntry(worldId, enemy, imageUrl) {
  const bodyHtml = buildEnemyBodyHtml(enemy, imageUrl);
  const manifestFields = buildEnemyManifestEntry(enemy);

  const entryMeta = {
    category: "enemies",
    id: enemy.id,
    name: enemy.name,
    eyebrow: `Bestiary Entry — Creature ${enemy.level}`,
    subtitle: manifestFields.subtitle,
    faction: enemy.faction || null,
    ruleset: "pf2e",
    sourceMode: enemy.sourceMode || "homebrew",
    level: enemy.level,
    tags: manifestFields.tags,
    raw: enemy,
    footer: ["Source: generated via Chronicled (Pathfinder 2e Homebrew tier)"],
    bodyHtml
  };
  return upsertEntry(worldId, "enemies", entryMeta);
}

module.exports = { savePf2eEnemyEntry };
