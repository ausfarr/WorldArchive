// lib/rulesets/pf2e/spellRepo.js
//
// Write path for PF2e Spell entries -- same shape as
// lib/rulesets/pf2e/enemyRepo.js, category "spells".

const { upsertEntry } = require("../../entriesRepo");
const { buildSpellBodyHtml, buildSpellManifestEntry } = require("./spellTemplate");

async function savePf2eSpellEntry(worldId, spell, imageUrl) {
  const bodyHtml = buildSpellBodyHtml(spell);
  const manifestFields = buildSpellManifestEntry(spell);

  const entryMeta = {
    category: "spells",
    id: spell.id,
    name: spell.name,
    eyebrow: "Spell Card",
    subtitle: manifestFields.subtitle,
    faction: spell.faction || null,
    ruleset: "pf2e",
    sourceMode: spell.sourceMode || "homebrew",
    tags: manifestFields.tags,
    raw: spell,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "spells", entryMeta);
}

module.exports = { savePf2eSpellEntry };
