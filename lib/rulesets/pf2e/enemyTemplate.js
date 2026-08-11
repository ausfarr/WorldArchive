// lib/rulesets/pf2e/enemyTemplate.js
//
// Renders a real PF2e creature stat-block layout -- level-centric (no
// CR/XP the way 5e has), trait-tag header, ability modifiers shown
// directly (PF2e stat blocks never show raw ability scores, only
// modifiers), Strikes instead of a generic "Actions" list. A genuinely
// different reading order than both Echoes' and 5e's templates, matching
// how a real PF2e stat block actually reads.
//
// Entry shape this expects (`enemy`, the parsed raw_json for a
// ruleset='pf2e' enemies entry):
//   {
//     id, name, level, rarity ('Common'|'Uncommon'|'Rare'|'Unique'),
//     traits: ["Beast", "Animal", ...],   // PF2e trait tags (alignment/size/type folded in as traits, matching real stat blocks)
//     perception, senses,
//     languages,
//     skills: [{ name, bonus }],
//     abilities: { str, dex, con, int, wis, cha },  // MODIFIERS, not scores
//     items,                               // free text, or null
//     armorClass,
//     savingThrows: { fort, ref, will },
//     hitPoints, immunities, resistances, weaknesses,
//     speed,
//     melee: [{ name, bonus, traits, description }],
//     ranged: [{ name, bonus, traits, description }],
//     otherActions: [{ name, description }],
//     flavor, designNotes,
//     role,          // which ROLE_TEMPLATES preset (if any) this was built from
//     sourceMode: 'homebrew' -- the only tier built for pf2e so far, see
//                 routes/generateEnemy.js's pf2e branch
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

function formatModifier(mod) {
  const n = Number(mod) || 0;
  return n >= 0 ? `+${n}` : `${n}`;
}

const ABILITY_LABELS = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };

function abilityModifiersLine(abilities) {
  return Object.keys(ABILITY_LABELS)
    .map((k) => `${ABILITY_LABELS[k]} ${formatModifier((abilities || {})[k])}`)
    .join(", ");
}

function traitTags(traits) {
  return (traits || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ");
}

function listOrDash(text) {
  return text && String(text).trim() ? escapeHtml(text) : "—";
}

function strikeBlock(strikes, label) {
  if (!strikes || !strikes.length) return "";
  const rows = strikes
    .map((s) => `<p class="action"><strong>${escapeHtml(label)}</strong> <strong>${escapeHtml(s.name)}</strong> ${formatModifier(s.bonus)}${s.traits && s.traits.length ? ` (${s.traits.map(escapeHtml).join(", ")})` : ""}, <strong>Damage</strong> ${escapeHtml(s.description)}</p>`)
    .join("\n");
  return rows;
}

function buildEnemyBodyHtml(enemy, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${enemy.id}" data-category="enemies" data-entry-id="${enemy.id}" data-label="Creature portrait" src="${imageUrl || `images/${enemy.id}.png`}" alt="${escapeHtml(enemy.name)}" onerror="handlePortraitError(this)">`;

  const skillsText = (enemy.skills || []).map((s) => `${escapeHtml(s.name)} ${formatModifier(s.bonus)}`).join(", ");
  const savingThrows = enemy.savingThrows || {};

  return `
${portraitBlock}
<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">Creature ${enemy.level} ${enemy.rarity && enemy.rarity !== "Common" ? `— ${escapeHtml(enemy.rarity)}` : ""}</p>
<div class="quote-block">${traitTags(enemy.traits)}</div>

<table class="rel-table">
<tr><th>Perception</th><td>${formatModifier(enemy.perception)}${enemy.senses ? `; ${escapeHtml(enemy.senses)}` : ""}</td></tr>
${skillsText ? `<tr><th>Skills</th><td>${skillsText}</td></tr>` : ""}
<tr><th>${abilityModifiersLine(enemy.abilities)}</th><td></td></tr>
${enemy.items ? `<tr><th>Items</th><td>${escapeHtml(enemy.items)}</td></tr>` : ""}
<tr><th>Languages</th><td>${listOrDash(enemy.languages)}</td></tr>
</table>

<table class="rel-table">
<tr><th>AC</th><td>${enemy.armorClass}; <strong>Fort</strong> ${formatModifier(savingThrows.fort)}, <strong>Ref</strong> ${formatModifier(savingThrows.ref)}, <strong>Will</strong> ${formatModifier(savingThrows.will)}</td></tr>
<tr><th>HP</th><td>${enemy.hitPoints}${enemy.immunities ? `; <strong>Immunities</strong> ${escapeHtml(enemy.immunities)}` : ""}${enemy.resistances ? `; <strong>Resistances</strong> ${escapeHtml(enemy.resistances)}` : ""}${enemy.weaknesses ? `; <strong>Weaknesses</strong> ${escapeHtml(enemy.weaknesses)}` : ""}</td></tr>
<tr><th>Speed</th><td>${listOrDash(enemy.speed)}</td></tr>
</table>

<h2>Strikes</h2>
${strikeBlock(enemy.melee, "Melee")}
${strikeBlock(enemy.ranged, "Ranged")}

${enemy.otherActions && enemy.otherActions.length ? `<h2>Actions</h2>${enemy.otherActions.map((a) => `<p class="action"><strong>${escapeHtml(a.name)}.</strong> ${escapeHtml(a.description)}</p>`).join("\n")}` : ""}

${enemy.flavor ? `<h2>Description</h2><p>${escapeHtml(enemy.flavor)}</p>` : ""}
${enemy.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(enemy.designNotes)}</p>` : ""}
`;
}

function buildEnemyManifestEntry(enemy) {
  return {
    id: enemy.id,
    name: enemy.name,
    subtitle: `Creature ${enemy.level}${enemy.traits && enemy.traits.length ? ` — ${enemy.traits.slice(0, 2).join(", ")}` : ""}`,
    tags: [`<span class="tag">Level ${escapeHtml(String(enemy.level))}</span>`, `<span class="tag">homebrew</span>`],
    faction: enemy.faction || null,
    locked: false
  };
}

module.exports = { buildEnemyBodyHtml, buildEnemyManifestEntry, slugify, escapeHtml, formatModifier };
