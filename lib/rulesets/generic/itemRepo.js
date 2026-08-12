// lib/rulesets/generic/itemRepo.js
//
// Write path for Generic Item entries -- same shape as
// lib/rulesets/generic/classRepo.js, category "items". genericSystem is
// threaded through explicitly to resolve boostsAttribute's label.

const { upsertEntry } = require("../../entriesRepo");
const { buildItemBodyHtml, buildItemManifestEntry } = require("./itemTemplate");

async function saveGenericItemEntry(worldId, item, genericSystem, imageUrl) {
  const bodyHtml = buildItemBodyHtml(item, genericSystem, imageUrl);
  const manifestFields = buildItemManifestEntry(item);

  const entryMeta = {
    category: "items",
    id: item.id,
    name: item.name,
    eyebrow: "Item Card",
    subtitle: manifestFields.subtitle,
    faction: item.faction || null,
    ruleset: "generic",
    sourceMode: item.sourceMode || "homebrew",
    tags: manifestFields.tags,
    raw: item,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "items", entryMeta);
}

module.exports = { saveGenericItemEntry };
