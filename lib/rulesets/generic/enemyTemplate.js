// lib/rulesets/generic/enemyTemplate.js
//
// Phase 10 (Generic ruleset) Bestiary stat block -- renders whatever
// attributes/derived stats THIS world configured (world_config.generic_system_json),
// not a fixed set. Two modes, matching the scope doc's own toggle:
//   - useFormula: true  -> attribute table + a Derived Stats table
//     (computed by lib/rulesets/generic/statFormulas.js, never model-stated)
//   - useFormula: false -> attributes are still shown (the world still
//     defined them), but no derived-stats table -- the model's own
//     "flavorStats" free text is the whole mechanical picture, exactly
//     as the scope doc describes ("let the model just write stat blocks
//     as flavor text, no formula").
//
// Entry shape (`enemy`):
//   {
//     id, name, attributes: { <world-defined keys>: number },
//     derivedStats: { <world-defined keys>: number } | null,  // code-computed, present only when useFormula
//     flavorStats,   // free text -- present only when NOT useFormula
//     traits: [{ name, description }], actions: [{ name, description }],
//     flavor, designNotes, faction, sourceMode: 'homebrew'
//   }

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

function buildEnemyBodyHtml(enemy, genericSystem, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${enemy.id}" data-category="enemies" data-entry-id="${enemy.id}" data-label="Enemy portrait" src="${imageUrl || `images/${enemy.id}.png`}" alt="${escapeHtml(enemy.name)}" onerror="handlePortraitError(this)">`;
  const attributeDefs = (genericSystem && genericSystem.attributes) || [];
  const derivedStatDefs = (genericSystem && genericSystem.useFormula && genericSystem.derivedStats) || [];

  return `
${portraitBlock}
<div class="quote-block">${escapeHtml(enemy.flavor || "")}</div>

${attributeTable(attributeDefs, enemy.attributes)}

${derivedStatDefs.length ? derivedStatsTable(derivedStatDefs, enemy.derivedStats) : (enemy.flavorStats ? `<h2>Stats</h2><p>${escapeHtml(enemy.flavorStats)}</p>` : "")}

${enemy.traits && enemy.traits.length ? `<h2>Traits</h2>${enemy.traits.map((t) => `<p><strong>${escapeHtml(t.name)}.</strong> ${escapeHtml(t.description)}</p>`).join("\n")}` : ""}
${enemy.actions && enemy.actions.length ? `<h2>Actions</h2>${enemy.actions.map((a) => `<p><strong>${escapeHtml(a.name)}.</strong> ${escapeHtml(a.description)}</p>`).join("\n")}` : ""}

${enemy.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(enemy.designNotes)}</p>` : ""}
`;
}

// Compact version for embedding inside an NPC entry's page (no
// portrait), same purpose as 5e's buildEmbeddedCombatProfileHtml() and
// pf2e's version -- used by lib/entryTemplate.js's combatProfileBlock()
// for generic-ruleset worlds' NPC "Combatant" default/upgrade profile.
// Unlike the main buildEnemyBodyHtml() above, this does NOT take a
// genericSystem parameter -- the profile object it renders already
// carries its own attribute/derived-stat LABELS denormalized onto it
// (see lib/rulesets/generic/npcCombatDefaults.js's header comment for
// why), so there's nothing to look up.
function buildEmbeddedCombatProfileHtml(profile) {
  const attrCells = (profile.attributes || []).map((a) => `<td><strong>${escapeHtml(a.label)}</strong><br>${a.value}</td>`).join("");
  const attributeTableHtml = attrCells ? `<table class="rel-table stat-block-abilities"><tr>${attrCells}</tr></table>` : "";

  const derivedRows = (profile.derivedStats || []).map((d) => `<tr><th>${escapeHtml(d.label)}</th><td>${d.value}</td></tr>`).join("\n");
  const derivedTableHtml = derivedRows ? `<h3>Derived Stats</h3><table class="rel-table">${derivedRows}</table>` : (profile.flavorStats ? `<p>${escapeHtml(profile.flavorStats)}</p>` : "");

  const traitsHtml = (profile.traits || []).map((t) => `<p><strong>${escapeHtml(t.name)}.</strong> ${escapeHtml(t.description)}</p>`).join("\n");
  const actionsHtml = (profile.actions || []).map((a) => `<p><strong>${escapeHtml(a.name)}.</strong> ${escapeHtml(a.description)}</p>`).join("\n");

  return `
${attributeTableHtml}
${derivedTableHtml}
${traitsHtml}
${actionsHtml}
`;
}

function buildEnemyManifestEntry(enemy) {
  return {
    id: enemy.id,
    name: enemy.name,
    subtitle: "Homebrew creature",
    tags: [`<span class="tag">homebrew</span>`],
    faction: enemy.faction || null,
    locked: false
  };
}

module.exports = { buildEnemyBodyHtml, buildEmbeddedCombatProfileHtml, buildEnemyManifestEntry, slugify, escapeHtml };
