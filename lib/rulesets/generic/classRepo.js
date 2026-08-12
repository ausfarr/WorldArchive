// lib/rulesets/generic/classRepo.js
//
// Write path for Generic Class entries -- same shape as
// lib/rulesets/generic/enemyRepo.js, category "classes". genericSystem
// is threaded through explicitly (needed to resolve keyAttribute's
// label at render time), same pattern as the enemy repo.

const { upsertEntry } = require("../../entriesRepo");
const { buildClassBodyHtml, buildClassManifestEntry } = require("./classTemplate");

async function saveGenericClassEntry(worldId, cls, genericSystem, imageUrl) {
  const bodyHtml = buildClassBodyHtml(cls, genericSystem, imageUrl);
  const manifestFields = buildClassManifestEntry(cls);

  const entryMeta = {
    category: "classes",
    id: cls.id,
    name: cls.name,
    eyebrow: "Class Sheet",
    subtitle: manifestFields.subtitle,
    faction: cls.faction || null,
    ruleset: "generic",
    sourceMode: cls.sourceMode || "homebrew",
    tags: manifestFields.tags,
    raw: cls,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "classes", entryMeta);
}

module.exports = { saveGenericClassEntry };
