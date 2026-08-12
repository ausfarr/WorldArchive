// lib/rulesets/generic/survivorTemplate.js
//
// Renders a Generic-ruleset Player Character sheet -- a real Class
// instance (classId referencing a lib/rulesets/generic/classTemplate.js
// entry), with this world's own attributes assigned and derived stats
// computed by lib/rulesets/generic/statFormulas.js (never model-stated)
// when the world opted into a formula layer. Still saved under the
// "survivors" category slug, same scoping decision every other ruleset's
// Phase 8 made.
//
// Entry shape (`pc`, the parsed raw_json for a ruleset='generic' survivors entry):
//   {
//     id, name, classId, className,
//     attributes: { <world-defined keys>: number },
//     derivedStats: { <world-defined keys>: number } | null,
//     flavorStats,   // present only when this world has no formula layer
//     background, backstory, equipment, designNotes, faction, sourceMode: 'homebrew'
//   }

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function attributeTable(attributeDefs, attributes) {
  if (!attributeDefs || !attributeDefs.length) return "";
  const cells = attributeDefs.map((def) => `<td><strong>${escapeHtml(def.label)}</strong><br>${(attributes || {})[def.key] != null ? (attributes || {})[def.key] : "—"}</td>`).join("");
  return `<table class="rel-table stat-block-abilities"><tr>${cells}</tr></table>`;
}

function derivedStatsTable(derivedStatDefs, derivedStats) {
  if (!derivedStatDefs || !derivedStatDefs.length || !derivedStats) return "";
  const rows = derivedStatDefs.map((def) => `<tr><th>${escapeHtml(def.label)}</th><td>${derivedStats[def.key] != null ? derivedStats[def.key] : "—"}</td></tr>`).join("\n");
  return `<h2>Derived Stats</h2><table class="rel-table">${rows}</table>`;
}

function buildSurvivorBodyHtml(pc, genericSystem, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${pc.id}" data-category="survivors" data-entry-id="${pc.id}" data-label="Character portrait" src="${imageUrl || `images/${pc.id}.png`}" alt="${escapeHtml(pc.name)}" onerror="handlePortraitError(this)">`;
  const attributeDefs = (genericSystem && genericSystem.attributes) || [];
  const derivedStatDefs = (genericSystem && genericSystem.useFormula && genericSystem.derivedStats) || [];

  return `
${portraitBlock}
<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">${escapeHtml(pc.className || "")}</p>
<div class="quote-block">${escapeHtml(pc.background || "")}</div>

${attributeTable(attributeDefs, pc.attributes)}

${derivedStatDefs.length ? derivedStatsTable(derivedStatDefs, pc.derivedStats) : (pc.flavorStats ? `<h2>Stats</h2><p>${escapeHtml(pc.flavorStats)}</p>` : "")}

<table class="rel-table">
<tr><th>Equipment</th><td>${escapeHtml(pc.equipment || "—")}</td></tr>
</table>

${pc.backstory ? `<h2>Backstory</h2><p>${escapeHtml(pc.backstory)}</p>` : ""}
${pc.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(pc.designNotes)}</p>` : ""}
`;
}

function buildSurvivorManifestEntry(pc) {
  return {
    id: pc.id,
    name: pc.name,
    subtitle: pc.className || "",
    tags: [`<span class="tag">${escapeHtml(pc.className || "")}</span>`],
    faction: pc.faction || null,
    locked: false
  };
}

module.exports = { buildSurvivorBodyHtml, buildSurvivorManifestEntry, slugify, escapeHtml };
