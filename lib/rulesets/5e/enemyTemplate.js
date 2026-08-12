// lib/rulesets/5e/enemyTemplate.js
//
// Renders a real 5e stat-block layout -- a genuinely different HTML
// shape than Echoes' attribute-table enemy card (lib/enemyTemplate.js),
// not a relabeled version of it. Mirrors the classic 5e stat-block
// reading order: name/size-type-alignment header, AC/HP/Speed, the six
// ability scores with modifiers, saving throws, skills, damage/condition
// resistances, senses/languages, CR, then traits -> actions -> legendary
// actions.
//
// Entry shape this expects (`enemy`, the parsed raw_json for a
// ruleset='5e' enemies entry):
//   {
//     id, name, size, type, alignment,
//     armorClass, armorNote,           // e.g. 15, "leather armor, shield"
//     hitPoints, hitDice,              // e.g. 7, "2d6"
//     speed,                           // e.g. "30 ft."
//     abilities: { str, dex, con, int, wis, cha },  // raw scores, 1-30
//     savingThrows: [{ ability, bonus }],           // only proficient ones
//     skills: [{ name, bonus }],
//     damageVulnerabilities, damageResistances, damageImmunities, conditionImmunities, // free text
//     senses, languages,               // free text
//     challengeRating: { cr, xp, defensiveCr, offensiveCr, estimated },
//     traits: [{ name, description }],
//     actions: [{ name, description }],
//     legendaryActions: [{ name, description }],
//     designNotes,
//     sourceMode: 'import' | 'reflavor' | 'homebrew',
//     srdSourceId, srdLicenseNote      // only present for import/reflavor
//   }
const { abilityModifier, formatModifier, proficiencyBonusForCr } = require("./statFormulas");

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

const ABILITY_LABELS = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };

function abilityScoresTable(abilities) {
  const rows = Object.keys(ABILITY_LABELS)
    .map((key) => {
      const score = abilities[key] || 10;
      return `<td><strong>${ABILITY_LABELS[key]}</strong><br>${score} (${formatModifier(abilityModifier(score))})</td>`;
    })
    .join("");
  return `<table class="rel-table stat-block-abilities"><tr>${rows}</tr></table>`;
}

function listOrDash(text) {
  return text && String(text).trim() ? escapeHtml(text) : "—";
}

function abilityBlock(list, headingClass) {
  if (!list || !list.length) return "";
  return list
    .map((a) => `<p class="${headingClass}"><strong>${escapeHtml(a.name)}.</strong> ${escapeHtml(a.description)}</p>`)
    .join("\n");
}

function buildEnemyBodyHtml(enemy, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${enemy.id}" data-category="enemies" data-entry-id="${enemy.id}" data-label="Enemy portrait" src="${imageUrl || `images/${enemy.id}.png`}" alt="${escapeHtml(enemy.name)}" onerror="handlePortraitError(this)">`;

  const cr = enemy.challengeRating || {};
  const proficiencyBonus = formatModifier(proficiencyBonusForCr(cr.cr));

  // savingThrows/skills come as structured {ability,bonus}/{name,bonus}
  // arrays from Homebrew (the model fills in the schema) but as plain
  // free-text strings from Import/Reflavor (straight from the SRD source
  // data, e.g. "Con +10, Int +12, Wis +9") -- rendering both without
  // forcing a lossy re-parse of the SRD text into structured objects.
  const savingThrowsText = Array.isArray(enemy.savingThrows)
    ? enemy.savingThrows.map((s) => `${ABILITY_LABELS[s.ability] || s.ability} ${formatModifier(s.bonus)}`).join(", ")
    : (enemy.savingThrows || "");
  const skillsText = Array.isArray(enemy.skills)
    ? enemy.skills.map((s) => `${escapeHtml(s.name)} ${formatModifier(s.bonus)}`).join(", ")
    : (enemy.skills || "");

  const sourceBadge = enemy.sourceMode
    ? `<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">Source: ${escapeHtml(enemy.sourceMode)}${enemy.srdSourceId ? ` — SRD "${escapeHtml(enemy.srdSourceId)}"` : ""}</p>`
    : "";
  const licenseNote = enemy.srdLicenseNote
    ? `<p class="flavor" style="font-size:0.7rem; color:var(--ink-faint);">${escapeHtml(enemy.srdLicenseNote)}</p>`
    : "";

  return `
${portraitBlock}
${sourceBadge}
<div class="quote-block">${escapeHtml(enemy.size)} ${escapeHtml(enemy.type)}, ${escapeHtml(enemy.alignment)}</div>

<table class="rel-table">
<tr><th>Armor Class</th><td>${enemy.armorClass}${enemy.armorNote ? ` (${escapeHtml(enemy.armorNote)})` : ""}</td></tr>
<tr><th>Hit Points</th><td>${enemy.hitPoints}${enemy.hitDice ? ` (${escapeHtml(enemy.hitDice)})` : ""}</td></tr>
<tr><th>Speed</th><td>${listOrDash(enemy.speed)}</td></tr>
</table>

${abilityScoresTable(enemy.abilities || {})}

<table class="rel-table">
${savingThrowsText ? `<tr><th>Saving Throws</th><td>${savingThrowsText}</td></tr>` : ""}
${skillsText ? `<tr><th>Skills</th><td>${skillsText}</td></tr>` : ""}
<tr><th>Damage Vulnerabilities</th><td>${listOrDash(enemy.damageVulnerabilities)}</td></tr>
<tr><th>Damage Resistances</th><td>${listOrDash(enemy.damageResistances)}</td></tr>
<tr><th>Damage Immunities</th><td>${listOrDash(enemy.damageImmunities)}</td></tr>
<tr><th>Condition Immunities</th><td>${listOrDash(enemy.conditionImmunities)}</td></tr>
<tr><th>Senses</th><td>${listOrDash(enemy.senses)}</td></tr>
<tr><th>Languages</th><td>${listOrDash(enemy.languages)}</td></tr>
<tr><th>Challenge</th><td>${escapeHtml(cr.cr)} (${cr.xp ? cr.xp.toLocaleString() : "?"} XP) &middot; Proficiency Bonus ${proficiencyBonus}${cr.estimated ? ` <span style="color:var(--ink-faint); font-size:0.8em;">(estimated -- review before play)</span>` : ""}</td></tr>
</table>

${enemy.traits && enemy.traits.length ? `<h2>Traits</h2>${abilityBlock(enemy.traits, "trait")}` : ""}

${enemy.actions && enemy.actions.length ? `<h2>Actions</h2>${abilityBlock(enemy.actions, "action")}` : ""}

${enemy.legendaryActions && enemy.legendaryActions.length ? `<h2>Legendary Actions</h2>${abilityBlock(enemy.legendaryActions, "legendary-action")}` : ""}

${enemy.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(enemy.designNotes)}</p>` : ""}
${licenseNote}
`;
}

// Compact stat-block renderer for EMBEDDING inside another category's
// entry body (Phase 7: NPCs' "Combat Profile" section, see
// lib/entryTemplate.js's buildBodyHtml) -- no portrait image tag, no
// source/license badge (those make sense for a standalone Bestiary
// entry, not a few lines tucked into an NPC dossier). Reuses the same
// internal helpers as the full buildEnemyBodyHtml() so the numbers are
// guaranteed to read identically wherever a 5e stat block appears.
function buildEmbeddedCombatProfileHtml(enemy) {
  const cr = enemy.challengeRating || {};
  const proficiencyBonus = formatModifier(proficiencyBonusForCr(cr.cr));
  const savingThrowsText = Array.isArray(enemy.savingThrows)
    ? enemy.savingThrows.map((s) => `${ABILITY_LABELS[s.ability] || s.ability} ${formatModifier(s.bonus)}`).join(", ")
    : (enemy.savingThrows || "");

  return `
${abilityScoresTable(enemy.abilities || {})}
<table class="rel-table">
<tr><th>Armor Class</th><td>${enemy.armorClass}${enemy.armorNote ? ` (${escapeHtml(enemy.armorNote)})` : ""}</td></tr>
<tr><th>Hit Points</th><td>${enemy.hitPoints}${enemy.hitDice ? ` (${escapeHtml(enemy.hitDice)})` : ""}</td></tr>
<tr><th>Speed</th><td>${listOrDash(enemy.speed)}</td></tr>
${savingThrowsText ? `<tr><th>Saving Throws</th><td>${savingThrowsText}</td></tr>` : ""}
<tr><th>Challenge</th><td>${escapeHtml(cr.cr)} (${cr.xp ? cr.xp.toLocaleString() : "?"} XP) &middot; Proficiency Bonus ${proficiencyBonus}${cr.estimated ? ` <span style="color:var(--ink-faint); font-size:0.8em;">(estimated)</span>` : ""}</td></tr>
</table>
${enemy.actions && enemy.actions.length ? abilityBlock(enemy.actions, "action") : ""}
`;
}

function escapeForTemplateLiteral(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildEnemyManifestEntry(enemy) {
  const cr = enemy.challengeRating || {};
  return {
    id: enemy.id,
    name: enemy.name,
    subtitle: `${enemy.size || ""} ${enemy.type || ""} — CR ${cr.cr || "?"}`.trim(),
    tags: [`<span class="tag">CR ${escapeHtml(cr.cr || "?")}</span>`, `<span class="tag">${escapeHtml(enemy.sourceMode || "homebrew")}</span>`],
    faction: enemy.faction || null,
    locked: false
  };
}

module.exports = {
  buildEnemyBodyHtml,
  buildEmbeddedCombatProfileHtml,
  buildEnemyManifestEntry,
  slugify,
  escapeForTemplateLiteral,
  escapeHtml,
  formatModifier
};
