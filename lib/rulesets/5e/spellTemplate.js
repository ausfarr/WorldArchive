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
//     flavor, designNotes, faction,
//     sourceMode: 'import' | 'reflavor' | 'homebrew',
//     srdSourceId, srdLicenseNote      // only present for import/reflavor
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

// Entry cross-linking, Phase 3: spell.classes is Category A (see
// lib/entryLinkRegistry.js) -- lib/entryLinker.js upgrades each entry
// from a bare name string to {name, id} on every save, resolving id
// against this world's real Classes roster where it can. A resolved
// entry renders as a real link; an unresolved one gets the
// .unarchived-ref styling (archive/css/style.css) instead of silently
// dropping the fact that it's not linkable yet. Handles a bare string
// too, defensively, for any spell saved before this phase shipped and
// not yet swept by the one-off backfill script (Phase 4) -- `raw.classes`
// is otherwise guaranteed {name,id}-shaped post-Phase-2, but nothing here
// should crash on the pre-migration shape in the meantime.
function classesLine(spell) {
  const classes = spell.classes || [];
  if (!classes.length) return "—";
  return classes
    .map((c) => {
      const name = typeof c === "string" ? c : (c && c.name) || "";
      const id = typeof c === "object" && c ? c.id : null;
      if (!name) return null;
      return id
        ? `<a href="dossier.html?category=classes&id=${escapeHtml(id)}">${escapeHtml(name)}</a>`
        : `<span class="unarchived-ref" title="Not yet archived in this world">${escapeHtml(name)}</span>`;
    })
    .filter(Boolean)
    .join(", ") || "—";
}

function buildSpellBodyHtml(spell) {
  const cantripTable = spell.level === 0 && spell.cantripBaseDamage
    ? cantripScalingTable(spell.cantripBaseDamage.diceCount, spell.cantripBaseDamage.dieSize)
    : null;

  // Source/attribution badge -- same pattern as
  // lib/rulesets/5e/enemyTemplate.js's buildEnemyBodyHtml() for Import/
  // Reflavor entries. Required for CC-BY-4.0 compliance (the license
  // text mandates attribution be shown, not just stored).
  const sourceBadge = spell.sourceMode
    ? `<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">Source: ${escapeHtml(spell.sourceMode)}${spell.srdSourceId ? ` — SRD "${escapeHtml(spell.srdSourceId)}"` : ""}</p>`
    : "";
  const licenseNote = spell.srdLicenseNote
    ? `<p class="flavor" style="font-size:0.7rem; color:var(--ink-faint);">${escapeHtml(spell.srdLicenseNote)}</p>`
    : "";

  return `
${sourceBadge}
<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">${levelSchoolLabel(spell)}${spell.concentration ? " · Concentration" : ""}</p>

<table class="rel-table">
<tr><th>Casting Time</th><td>${escapeHtml(spell.castingTime)}</td></tr>
<tr><th>Range</th><td>${escapeHtml(spell.range)}</td></tr>
<tr><th>Components</th><td>${componentsText(spell)}</td></tr>
<tr><th>Duration</th><td>${escapeHtml(spell.duration)}</td></tr>
<tr><th>Classes</th><td>${classesLine(spell)}</td></tr>
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
${licenseNote}
`;
}

function buildSpellManifestEntry(spell) {
  return {
    id: spell.id,
    name: spell.name,
    subtitle: spell.level === 0 ? `Cantrip — ${spell.school}` : `Level ${spell.level} — ${spell.school}`,
    tags: [`<span class="tag">${spell.level === 0 ? "Cantrip" : `Lvl ${spell.level}`}</span>`, `<span class="tag">${escapeHtml(spell.school || "")}</span>`, `<span class="tag">${escapeHtml(spell.sourceMode || "homebrew")}</span>`],
    faction: spell.faction || null,
    locked: false
  };
}

module.exports = { buildSpellBodyHtml, buildSpellManifestEntry, slugify, escapeHtml };
