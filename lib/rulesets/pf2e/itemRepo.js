// lib/rulesets/pf2e/itemRepo.js
//
// Write path for PF2e Item entries -- same shape as
// lib/rulesets/pf2e/enemyRepo.js, category "items".

const { upsertEntry } = require("../../entriesRepo");
const { buildItemBodyHtml, buildItemManifestEntry } = require("./itemTemplate");

async function savePf2eItemEntry(worldId, item, imageUrl) {
  const bodyHtml = buildItemBodyHtml(item, imageUrl);
  const manifestFields = buildItemManifestEntry(item);

  const entryMeta = {
    category: "items",
    id: item.id,
    name: item.name,
    eyebrow: "Item Card",
    subtitle: manifestFields.subtitle,
    faction: item.faction || null,
    ruleset: "pf2e",
    sourceMode: item.sourceMode || "homebrew",
    tags: manifestFields.tags,
    raw: item,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "items", entryMeta);
}

module.exports = { savePf2eItemEntry };
