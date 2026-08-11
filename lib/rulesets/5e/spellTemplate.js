// lib/rulesets/5e/spellTemplate.js
//
// Renders a real 5e spell stat block -- level/school header, the four
// standard spell-block fields (Casting Time, Range, Components,
// Duration), class list, description, "At Higher Levels" text, and (for
// cantrips only) the code-derived damage-scaling table from
// spellFormulas.js's cantripScalingTable().
//
// Entry shape (`spell`, the parsed raw_json for a ruleset='5e' spells entry):
//   {
//     id, name, level, school, ritual, concentration,
//     castingTime, range, components, materialComponent,
//     duration, classes: ["Wizard", "Sorcerer"],
//     description, atHigherLevels,
//     cantripBaseDamage: { diceCount, dieSize, damageType } | null,  // cantrips only
//     flavor, designNotes, faction, sourceMode: 'homebrew'
//   }

const { cantripScalingTable } = require("./spellFormulas");

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function levelSchoolLabel(spell) {
  const levelText = spell.level === 0 ? "Cantrip" : `${spell.level}${ordinalSuffix(spell.level)}-level`;
  const ritualTag = spell.ritual ? " (ritual)" : "";
  return `${levelText} ${escapeHtml(spell.school)}${ritualTag}`;
}

function ordinalSuffix(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function componentsText(spell) {
  const parts = [];
  if (spell.components) parts.push(spell.components);
  if (spell.materialComponent) parts.push(`(${spell.materialComponent})`);
  return parts.join(" ") || "—";
}

function buildSpellBodyHtml(spell) {
  const cantripTable = spell.level === 0 && spell.cantripBaseDamage
    ? cantripScalingTable(spell.cantripBaseDamage.diceCount, spell.cantripBaseDamage.dieSize)
    : null;

  return `
<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">${levelSchoolLabel(spell)}${spell.concentration ? " · Concentration" : ""}</p>

<table class="rel-table">
<tr><th>Casting Time</th><td>${escapeHtml(spell.castingTime)}</td></tr>
<tr><th>Range</th><td>${escapeHtml(spell.range)}</td></tr>
<tr><th>Components</th><td>${componentsText(spell)}</td></tr>
<tr><th>Duration</th><td>${escapeHtml(spell.duration)}</td></tr>
<tr><th>Classes</th><td>${(spell.classes || []).map(escapeHtml).join(", ") || "—"}</td></tr>
</table>

<h2>Description</h2>
<p>${escapeHtml(spell.description)}</p>

${spell.atHigherLevels ? `<h2>At Higher Levels</h2><p>${escapeHtml(spell.atHigherLevels)}</p>` : ""}

${cantripTable ? `<h2>Cantrip Damage by Character Level</h2>
<table class="rel-table">
<tr><th>Character Level</th><th>Damage</th></tr>
${cantripTable.map((row) => `<tr><td>${row.levels}</td><td>${row.dice} ${escapeHtml(spell.cantripBaseDamage.damageType || "")}</td></tr>`).join("\n")}
</table>` : ""}

${spell.flavor ? `<h2>Flavor</h2><p>${escapeHtml(spell.flavor)}</p>` : ""}
${spell.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(spell.designNotes)}</p>` : ""}
`;
}

function buildSpellManifestEntry(spell) {
  return {
    id: spell.id,
    name: spell.name,
    subtitle: spell.level === 0 ? `Cantrip — ${spell.school}` : `Level ${spell.level} — ${spell.school}`,
    tags: [`<span class="tag">${spell.level === 0 ? "Cantrip" : `Lvl ${spell.level}`}</span>`, `<span class="tag">${escapeHtml(spell.school || "")}</span>`],
    faction: spell.faction || null,
    locked: false
  };
}

module.exports = { buildSpellBodyHtml, buildSpellManifestEntry, slugify, escapeHtml };
