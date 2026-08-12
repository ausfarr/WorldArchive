// lib/rulesets/5e/itemRepo.js
//
// Write path for 5e Item entries -- same shape as the other 5e repo
// files, category "items".

const { upsertEntry } = require("../../entriesRepo");
const { buildItemBodyHtml, buildItemManifestEntry } = require("./itemTemplate");

async function save5eItemEntry(worldId, item, imageUrl) {
  const bodyHtml = buildItemBodyHtml(item, imageUrl);
  const manifestFields = buildItemManifestEntry(item);

  const entryMeta = {
    category: "items",
    id: item.id,
    name: item.name,
    eyebrow: item.rarity ? `${item.rarity} Item` : "Mundane Item",
    subtitle: manifestFields.subtitle,
    faction: item.faction || null,
    ruleset: "5e",
    sourceMode: item.sourceMode || "homebrew",
    tags: manifestFields.tags,
    raw: item,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "items", entryMeta);
}

module.exports = { save5eItemEntry };
