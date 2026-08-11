// lib/rulesets/5e/classRepo.js
//
// Write path for 5e Class entries -- same shape as
// lib/rulesets/5e/enemyRepo.js / spellRepo.js, category "classes".

const { upsertEntry } = require("../../entriesRepo");
const { buildClassBodyHtml, buildClassManifestEntry } = require("./classTemplate");

async function save5eClassEntry(worldId, cls, imageUrl) {
  const bodyHtml = buildClassBodyHtml(cls, imageUrl);
  const manifestFields = buildClassManifestEntry(cls);

  const entryMeta = {
    category: "classes",
    id: cls.id,
    name: cls.name,
    eyebrow: "Class Sheet — Full 1–20 Progression",
    subtitle: manifestFields.subtitle,
    faction: cls.faction || null,
    ruleset: "5e",
    sourceMode: cls.sourceMode || "homebrew",
    tags: manifestFields.tags,
    raw: cls,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "classes", entryMeta);
}

module.exports = { save5eClassEntry };
