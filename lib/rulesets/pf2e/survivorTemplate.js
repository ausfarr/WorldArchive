// lib/rulesets/pf2e/survivorTemplate.js
//
// Phase 8 pattern, PF2e version: renders a PF2e Player Character sheet
// -- linked Class + level, ability scores, code-computed HP/Class DC/
// Perception/saves (never model-stated, see survivorFormulas.js's
// computePcProfile), background. Still saved under the "survivors"
// category slug, same scoping decision 5e's Phase 8 made (see
// routes/generateSurvivor.js's header comment).

const { abilityModifierFromScore } = require("./survivorFormulas");

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

const ABILITY_LABELS = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function abilityScoresTable(abilities) {
  const rows = Object.keys(ABILITY_LABELS)
    .map((key) => {
      const score = (abilities || {})[key] || 10;
      return `<td><strong>${ABILITY_LABELS[key]}</strong><br>${score} (${formatModifier(abilityModifierFromScore(score))})</td>`;
    })
    .join("");
  return `<table class="rel-table stat-block-abilities"><tr>${rows}</tr></table>`;
}

function buildSurvivorBodyHtml(pc, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${pc.id}" data-category="survivors" data-entry-id="${pc.id}" data-label="Character portrait" src="${imageUrl || `images/${pc.id}.png`}" alt="${escapeHtml(pc.name)}" onerror="handlePortraitError(this)">`;
  const saves = pc.savingThrows || {};

  return `
${portraitBlock}
<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">Level ${pc.classLevel} ${escapeHtml(pc.className || "")}</p>
<div class="quote-block">${escapeHtml(pc.background || "")}</div>

${abilityScoresTable(pc.abilities)}

<table class="rel-table">
<tr><th>Hit Points</th><td>${pc.hitPoints}</td></tr>
<tr><th>Armor Class</th><td>${pc.armorClass}${pc.armorNote ? ` (${escapeHtml(pc.armorNote)})` : ""}</td></tr>
<tr><th>Class DC</th><td>${pc.classDC}</td></tr>
<tr><th>Perception</th><td>${formatModifier(pc.perception)}</td></tr>
<tr><th>Saving Throws</th><td>Fort ${formatModifier(saves.fortitude)}, Ref ${formatModifier(saves.reflex)}, Will ${formatModifier(saves.will)}</td></tr>
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
    subtitle: `Level ${pc.classLevel} ${pc.className || ""}`.trim(),
    tags: [`<span class="tag">Lvl ${escapeHtml(String(pc.classLevel))}</span>`, `<span class="tag">${escapeHtml(pc.className || "")}</span>`],
    faction: pc.faction || null,
    locked: false
  };
}

module.exports = { buildSurvivorBodyHtml, buildSurvivorManifestEntry, slugify, escapeHtml };
