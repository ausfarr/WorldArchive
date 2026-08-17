// lib/rulesets/5e/survivorTemplate.js
//
// Phase 8: renders a 5e Player Character sheet -- linked Class + level,
// ability scores, code-computed HP/proficiency bonus/spell slots (never
// model-stated), personality (ideals/bonds/flaws, the real 5e PC
// convention), background, equipment. Still saved under the "survivors"
// category (see routes/generateSurvivor.js's header comment for why the
// underlying category slug wasn't renamed) but conceptually a Player
// Character, not a Colony recruit -- a genuinely different shape from
// Echoes' survivorTemplate.js (quirk + assigned class + backstory),
// which stays completely untouched.

const { abilityModifier } = require("./survivorFormulas");
const { SKILLS } = require("./classFormulas");

const SKILL_NAME_BY_KEY = Object.fromEntries(SKILLS.map((s) => [s.key, s.name]));

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
function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function abilityScoresTable(abilities) {
  const rows = Object.keys(ABILITY_LABELS)
    .map((key) => {
      const score = (abilities || {})[key] || 10;
      return `<td><strong>${ABILITY_LABELS[key]}</strong><br>${score} (${formatModifier(abilityModifier(score))})</td>`;
    })
    .join("");
  return `<table class="rel-table stat-block-abilities"><tr>${rows}</tr></table>`;
}

function formatModifierOrDash(mod) {
  return mod == null ? "—" : formatModifier(mod);
}

// R4 Phase 5 (R6 Phase 3: real 2024-rules shape) -- renders the
// mechanical Background pick's real components. The 2024 rules replaced
// the old "background feature" flavor text with a deterministic Origin
// Feat grant (bg.originFeat, resolved server-side -- see
// backgroundsAndFeatsSeed.js), and moved ability score guidance from
// Species to Background (bg.abilityScores) -- neither of those existed
// on the pre-R6 hand-authored shape this section used to render.
// Absent entirely (not even an empty section) for a PC saved before
// R4 Phase 5 existed, whose backgroundDetail is null.
function backgroundSection(pc) {
  const bg = pc.backgroundDetail;
  if (!bg) return "";
  return `
<h2>Background: ${escapeHtml(bg.name)}</h2>
<table class="rel-table">
${bg.abilityScores ? `<tr><th>Ability Scores</th><td>${escapeHtml(bg.abilityScores)}</td></tr>` : ""}
<tr><th>Skill Proficiencies</th><td>${(bg.skillProficiencies || []).map((k) => escapeHtml(SKILL_NAME_BY_KEY[k] || k)).join(", ")}</td></tr>
${bg.toolProficiency ? `<tr><th>Tool Proficiency</th><td>${escapeHtml(bg.toolProficiency)}</td></tr>` : ""}
<tr><th>Equipment</th><td>${escapeHtml(bg.equipment)}${bg.equipmentGoldAlternative ? ` <span style="color:var(--ink-faint); font-size:0.85em;">(or ${escapeHtml(bg.equipmentGoldAlternative)} instead)</span>` : ""}</td></tr>
</table>
${bg.originFeat ? `<p><strong>Origin Feat: ${escapeHtml(bg.originFeat.name)}.</strong> ${escapeHtml(bg.originFeat.description)}</p>` : ""}
${bg.licenseNote ? `<p class="flavor" style="font-size:0.7rem; color:var(--ink-faint);">${escapeHtml(bg.licenseNote)}</p>` : ""}
`;
}

// R4 Phase 5: only rendered when a Feat was actually chosen over the
// flat Ability Score Improvement -- the default (no feat) needs no
// special line, since the ASI is already implied by the class's own
// level table (lib/rulesets/5e/classTemplate.js).
function featSection(pc) {
  const feat = pc.featDetail;
  if (!feat) return "";
  return `<p><strong>Feat (taken instead of an Ability Score Improvement):</strong> ${escapeHtml(feat.name)} — ${escapeHtml(feat.description)}</p>`;
}

function skillProficienciesLine(pc) {
  if (!Array.isArray(pc.skillProficiencies) || !pc.skillProficiencies.length) return "—";
  return pc.skillProficiencies.map((key) => escapeHtml(SKILL_NAME_BY_KEY[key] || key)).join(", ");
}

function savingThrowProficienciesLine(pc) {
  if (!Array.isArray(pc.savingThrowProficiencies) || !pc.savingThrowProficiencies.length) return "—";
  return pc.savingThrowProficiencies.map((key) => ABILITY_LABELS[key] || key).join(", ");
}

function ordinalSuffix(n) {
  return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
}

// R4 Phase 6: pc.spellSlots is now always the plain array shape (the
// shared multiclass pool, identical structurally to a single full
// caster's own slots -- see classFormulas.js's multiclassSpellSlots());
// Warlock Pact Magic is a separate, always-additive pool in pc.pactMagic
// (present whenever ANY of the character's classes is a Warlock, even
// alongside a shared pool from a second class).
function spellSlotsLine(pc) {
  if (!Array.isArray(pc.spellSlots)) return null;
  const nonZero = pc.spellSlots.map((count, i) => (count > 0 ? `${count}×${i + 1}` : null)).filter(Boolean);
  return nonZero.length ? nonZero.join(", ") : null;
}

function pactMagicLine(pc) {
  if (!pc.pactMagic || !pc.pactMagic.slots) return null;
  return `${pc.pactMagic.slots} slots (${pc.pactMagic.slotLevel}${ordinalSuffix(pc.pactMagic.slotLevel)}-level)`;
}

// R4 Phase 6: renders every class the character has levels in --
// "Level 5 Fighter" for a single-class PC, "Fighter 3 / Wizard 2" for a
// multiclassed one.
function classesLine(pc) {
  const classes = Array.isArray(pc.classes) ? pc.classes : [];
  if (classes.length === 1) return `Level ${classes[0].classLevel} ${escapeHtml(classes[0].className || "")}`;
  return classes.map((c) => `${escapeHtml(c.className || "")} ${c.classLevel}`).join(" / ");
}

function buildSurvivorBodyHtml(pc, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${pc.id}" data-category="survivors" data-entry-id="${pc.id}" data-label="Character portrait" src="${imageUrl || `images/${pc.id}.png`}" alt="${escapeHtml(pc.name)}" onerror="handlePortraitError(this)">`;
  const slotsLine = spellSlotsLine(pc);
  const pactLine = pactMagicLine(pc);

  return `
${portraitBlock}
<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">${pc.raceName ? `${escapeHtml(pc.raceName)} ` : ""}${classesLine(pc)}</p>
<div class="quote-block">${escapeHtml(pc.background || "")}</div>

${abilityScoresTable(pc.abilities)}

<table class="rel-table">
<tr><th>Hit Points</th><td>${pc.hitPoints}</td></tr>
<tr><th>Armor Class</th><td>${pc.armorClass}${pc.armorNote ? ` (${escapeHtml(pc.armorNote)})` : ""}</td></tr>
<tr><th>Proficiency Bonus</th><td>${formatModifier(pc.proficiencyBonus)}</td></tr>
<tr><th>Initiative</th><td>${formatModifierOrDash(pc.initiativeBonus)}</td></tr>
<tr><th>Passive Perception</th><td>${pc.passivePerception != null ? pc.passivePerception : "—"}</td></tr>
<tr><th>Saving Throw Proficiencies</th><td>${savingThrowProficienciesLine(pc)}</td></tr>
<tr><th>Skill Proficiencies</th><td>${skillProficienciesLine(pc)}</td></tr>
${slotsLine ? `<tr><th>Spell Slots</th><td>${slotsLine}</td></tr>` : ""}
${pactLine ? `<tr><th>Pact Magic (Warlock)</th><td>${pactLine}</td></tr>` : ""}
<tr><th>Equipment</th><td>${escapeHtml(pc.equipment || "—")}</td></tr>
</table>

<h2>Personality</h2>
<p><strong>Ideals:</strong> ${escapeHtml(pc.ideals || "—")}</p>
<p><strong>Bonds:</strong> ${escapeHtml(pc.bonds || "—")}</p>
<p><strong>Flaws:</strong> ${escapeHtml(pc.flaws || "—")}</p>

${featSection(pc)}

${backgroundSection(pc)}
${pc.backstory ? `<h2>Backstory</h2><p>${escapeHtml(pc.backstory)}</p>` : ""}
${pc.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(pc.designNotes)}</p>` : ""}
`;
}

function buildSurvivorManifestEntry(pc) {
  const classes = Array.isArray(pc.classes) ? pc.classes : [];
  const tags = [`<span class="tag">Lvl ${escapeHtml(String(pc.totalLevel != null ? pc.totalLevel : classes.reduce((s, c) => s + c.classLevel, 0)))}</span>`];
  classes.forEach((c) => tags.push(`<span class="tag">${escapeHtml(c.className || "")}</span>`));
  if (pc.raceName) tags.push(`<span class="tag">${escapeHtml(pc.raceName)}</span>`);
  return {
    id: pc.id,
    name: pc.name,
    subtitle: `${pc.raceName ? pc.raceName + " " : ""}${classesLine(pc)}`.trim(),
    tags,
    faction: pc.faction || null,
    locked: false
  };
}

module.exports = { buildSurvivorBodyHtml, buildSurvivorManifestEntry, slugify, escapeHtml };
