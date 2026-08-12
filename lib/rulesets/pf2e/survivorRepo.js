// lib/rulesets/pf2e/survivorRepo.js
//
// Write path for PF2e Player Character entries -- still the "survivors"
// category (see routes/generateSurvivor.js), same shape as the other
// pf2e repo files.

const { upsertEntry } = require("../../entriesRepo");
const { buildSurvivorBodyHtml, buildSurvivorManifestEntry } = require("./survivorTemplate");

async function savePf2eSurvivorEntry(worldId, pc, imageUrl) {
  const bodyHtml = buildSurvivorBodyHtml(pc, imageUrl);
  const manifestFields = buildSurvivorManifestEntry(pc);

  const entryMeta = {
    category: "survivors",
    id: pc.id,
    name: pc.name,
    eyebrow: `Player Character — Level ${pc.classLevel} ${pc.className || ""}`,
    subtitle: manifestFields.subtitle,
    faction: pc.faction || null,
    ruleset: "pf2e",
    sourceMode: pc.sourceMode || "homebrew",
    classId: pc.classId || null,
    tags: manifestFields.tags,
    raw: pc,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "survivors", entryMeta);
}

module.exports = { savePf2eSurvivorEntry };
