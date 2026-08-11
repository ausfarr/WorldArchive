// lib/rulesets/5e/enemyRepo.js
//
// Ruleset-specific write path for 5e Bestiary entries -- the 5e
// counterpart to lib/fileWriter.js's saveEnemyEntry (Echoes' writer,
// left completely untouched). routes/confirmEntry.js dispatches to
// whichever of the two matches the world's ruleset; see that file's
// enemy branch.
//
// Doesn't reuse fileWriter.js's resolveFactionLabel-based footer
// convention verbatim -- 5e stat blocks show faction as part of the
// flavor text instead of a footer line, since a 5e dossier's "footer"
// slot is used for the SRD attribution line when the entry has one
// (import/reflavor sourceMode) instead.

const { upsertEntry } = require("../../entriesRepo");
const { buildEnemyBodyHtml, buildEnemyManifestEntry } = require("./enemyTemplate");

async function save5eEnemyEntry(worldId, enemy, imageUrl) {
  const bodyHtml = buildEnemyBodyHtml(enemy, imageUrl);
  const manifestFields = buildEnemyManifestEntry(enemy);
  const cr = enemy.challengeRating || {};
  const footer = enemy.sourceMode === "import" || enemy.sourceMode === "reflavor"
    ? [enemy.srdLicenseNote || "Source: 5e SRD (CC-BY-4.0) — see licenses.html", "Generated/imported via Chronicled"]
    : ["Source: generated via Chronicled"];

  const entryMeta = {
    category: "enemies",
    id: enemy.id,
    name: enemy.name,
    eyebrow: `Bestiary Entry — CR ${cr.cr || "?"}`,
    subtitle: manifestFields.subtitle,
    faction: enemy.faction || null,
    ruleset: "5e",
    sourceMode: enemy.sourceMode || "homebrew",
    srdSourceId: enemy.srdSourceId || null,
    tags: manifestFields.tags,
    raw: enemy,
    footer,
    bodyHtml
  };
  return upsertEntry(worldId, "enemies", entryMeta);
}

module.exports = { save5eEnemyEntry };
