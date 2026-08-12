// lib/rulesets/pf2e/spellTemplate.js
//
// Renders a real PF2e spell card -- rank/traits header, the standard
// PF2e spell-block fields (Actions, Range, Targets/Area, Duration,
// Saving Throw), description, and (for "Heightened (+N)" spells only) a
// code-derived scaling table from spellFormulas.js's
// computeHeightenedDiceCount() -- the model states the base dice and
// per-rank increment, code computes every rank's actual total, the same
// "model writes narrative, code writes math" split 5e's cantrip damage
// table already uses in this project.
//
// Entry shape (`spell`, the parsed raw_json for a ruleset='pf2e' spells entry):
//   {
//     id, name, rank, isCantrip, traits: ["fire","evocation"],
//     actions, range, targetsOrArea, duration, savingThrow,
//     description,
//     heightening: {
//       type: 'plus' | 'specific' | 'none',
//       baseDiceCount, diceIncrementPerRank, damageType,   // used when type === 'plus'
//       specificEntries: [{ rank, effect }]                 // used when type === 'specific'
//     },
//     flavor, designNotes, faction, sourceMode: 'homebrew'
//   }

const { computeHeightenedDiceCount, MAX_SPELL_RANK } = require("./spellFormulas");

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function rankLabel(spell) {
  return spell.isCantrip ? "Cantrip" : `Rank ${spell.rank}`;
}

function heighteningTable(spell) {
  const h = spell.heightening;
  if (!h || h.type !== "plus" || h.baseDiceCount == null) return null;
  const baseRank = spell.rank || 1;
  const rows = [];
  for (let rank = baseRank; rank <= MAX_SPELL_RANK; rank++) {
    rows.push({ rank, diceCount: computeHeightenedDiceCount(h.baseDiceCount, baseRank, h.diceIncrementPerRank || 0, rank) });
  }
  return rows;
}

function buildSpellBodyHtml(spell) {
  const traits = (spell.traits || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ");
  const table = heighteningTable(spell);

  return `
<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">${rankLabel(spell)}</p>
<p>${traits}</p>

<table class="rel-table">
<tr><th>Actions</th><td>${escapeHtml(spell.actions)}</td></tr>
<tr><th>Range</th><td>${escapeHtml(spell.range) || "—"}</td></tr>
<tr><th>Targets / Area</th><td>${escapeHtml(spell.targetsOrArea) || "—"}</td></tr>
<tr><th>Duration</th><td>${escapeHtml(spell.duration) || "—"}</td></tr>
<tr><th>Saving Throw</th><td>${escapeHtml(spell.savingThrow) || "—"}</td></tr>
</table>

<h2>Description</h2>
<p>${escapeHtml(spell.description)}</p>

${spell.heightening && spell.heightening.type === "plus" ? `<p><strong>Heightened (+1)</strong>: damage increases by ${spell.heightening.diceIncrementPerRank}${escapeHtml(spell.heightening.damageType ? ` ${spell.heightening.damageType}` : "")} per rank.</p>` : ""}
${spell.heightening && spell.heightening.type === "specific" ? (spell.heightening.specificEntries || []).map((e) => `<p><strong>Heightened (Rank ${e.rank})</strong>: ${escapeHtml(e.effect)}</p>`).join("\n") : ""}

${table ? `<h2>Damage by Cast Rank</h2>
<table class="rel-table">
<tr><th>Rank</th><th>Dice</th></tr>
${table.map((row) => `<tr><td>${row.rank}</td><td>${row.diceCount}d${escapeHtml(spell.heightening.dieSize || 6)}</td></tr>`).join("\n")}
</table>` : ""}

${spell.flavor ? `<h2>Flavor</h2><p>${escapeHtml(spell.flavor)}</p>` : ""}
${spell.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(spell.designNotes)}</p>` : ""}
`;
}

function buildSpellManifestEntry(spell) {
  return {
    id: spell.id,
    name: spell.name,
    subtitle: rankLabel(spell),
    tags: [`<span class="tag">${escapeHtml(rankLabel(spell))}</span>`],
    faction: spell.faction || null,
    locked: false
  };
}

module.exports = { buildSpellBodyHtml, buildSpellManifestEntry, slugify, escapeHtml };
