// lib/rulesets/generic/survivorRepo.js
//
// Write path for Generic Player Character entries -- still the
// "survivors" category (see routes/generateSurvivor.js), same shape as
// the other generic repo files. genericSystem is threaded through
// explicitly, same pattern as classRepo.js/enemyRepo.js.

const { upsertEntry } = require("../../entriesRepo");
const { buildSurvivorBodyHtml, buildSurvivorManifestEntry } = require("./survivorTemplate");

async function saveGenericSurvivorEntry(worldId, pc, genericSystem, imageUrl) {
  const bodyHtml = buildSurvivorBodyHtml(pc, genericSystem, imageUrl);
  const manifestFields = buildSurvivorManifestEntry(pc);

  const entryMeta = {
    category: "survivors",
    id: pc.id,
    name: pc.name,
    eyebrow: "Player Character",
    subtitle: manifestFields.subtitle,
    faction: pc.faction || null,
    ruleset: "generic",
    sourceMode: pc.sourceMode || "homebrew",
    classId: pc.classId || null,
    tags: manifestFields.tags,
    raw: pc,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "survivors", entryMeta);
}

module.exports = { saveGenericSurvivorEntry };
