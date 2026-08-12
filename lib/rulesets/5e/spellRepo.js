// lib/rulesets/5e/spellRepo.js
//
// Write path for 5e Spell entries -- same shape as
// lib/rulesets/5e/enemyRepo.js, category "spells" instead of "enemies".

const { upsertEntry } = require("../../entriesRepo");
const { buildSpellBodyHtml, buildSpellManifestEntry } = require("./spellTemplate");

async function save5eSpellEntry(worldId, spell) {
  const bodyHtml = buildSpellBodyHtml(spell);
  const manifestFields = buildSpellManifestEntry(spell);

  const entryMeta = {
    category: "spells",
    id: spell.id,
    name: spell.name,
    eyebrow: `Spell — ${spell.level === 0 ? "Cantrip" : `Level ${spell.level}`}`,
    subtitle: manifestFields.subtitle,
    faction: spell.faction || null,
    ruleset: "5e",
    sourceMode: spell.sourceMode || "homebrew",
    level: spell.level,
    tags: manifestFields.tags,
    raw: spell,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "spells", entryMeta);
}

module.exports = { save5eSpellEntry };
