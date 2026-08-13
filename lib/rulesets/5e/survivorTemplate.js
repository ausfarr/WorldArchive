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

// R4 Phase 5: renders the mechanical Background pick's four real
// components -- absent entirely (not even an empty section) for a PC
// saved before this phase existed, whose backgroundDetail is null.
function backgroundSection(pc) {
  const bg = pc.backgroundDetail;
  if (!bg) return "";
  return `
<h2>Background: ${escapeHtml(bg.name)}</h2>
<table class="rel-table">
<tr><th>Skill Proficiencies</th><td>${bg.skillProficiencies.map((k) => escapeHtml(SKILL_NAME_BY_KEY[k] || k)).join(", ")}</td></tr>
${bg.toolProficiency ? `<tr><th>Tool Proficiency</th><td>${escapeHtml(bg.toolProficiency)}</td></tr>` : ""}
${bg.languagesNote ? `<tr><th>Languages</th><td>${escapeHtml(bg.languagesNote)}</td></tr>` : ""}
<tr><th>Equipment</th><td>${escapeHtml(bg.equipment)}</td></tr>
</table>
<p><strong>${escapeHtml(bg.featureName)}.</strong> ${escapeHtml(bg.featureDescription)}</p>
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

function spellSlotsLine(pc) {
  if (!pc.spellSlots) return null;
  if (pc.spellSlots.slots !== undefined) {
    // Warlock Pact Magic shape: { slots, slotLevel }
    return pc.spellSlots.slots > 0 ? `${pc.spellSlots.slots} slots (${pc.spellSlots.slotLevel}${pc.spellSlots.slotLevel === 1 ? "st" : pc.spellSlots.slotLevel === 2 ? "nd" : pc.spellSlots.slotLevel === 3 ? "rd" : "th"}-level)` : null;
  }
  if (Array.isArray(pc.spellSlots)) {
    const nonZero = pc.spellSlots.map((count, i) => (count > 0 ? `${count}×${i + 1}` : null)).filter(Boolean);
    return nonZero.length ? nonZero.join(", ") : null;
  }
  return null;
}

function buildSurvivorBodyHtml(pc, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${pc.id}" data-category="survivors" data-entry-id="${pc.id}" data-label="Character portrait" src="${imageUrl || `images/${pc.id}.png`}" alt="${escapeHtml(pc.name)}" onerror="handlePortraitError(this)">`;
  const slotsLine = spellSlotsLine(pc);

  return `
${portraitBlock}
<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">${pc.raceName ? `${escapeHtml(pc.raceName)} ` : ""}Level ${pc.classLevel} ${escapeHtml(pc.className || "")}</p>
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
  const tags = [`<span class="tag">Lvl ${escapeHtml(String(pc.classLevel))}</span>`, `<span class="tag">${escapeHtml(pc.className || "")}</span>`];
  if (pc.raceName) tags.push(`<span class="tag">${escapeHtml(pc.raceName)}</span>`);
  return {
    id: pc.id,
    name: pc.name,
    subtitle: `${pc.raceName ? pc.raceName + " " : ""}Level ${pc.classLevel} ${pc.className || ""}`.trim(),
    tags,
    faction: pc.faction || null,
    locked: false
  };
}

module.exports = { buildSurvivorBodyHtml, buildSurvivorManifestEntry, slugify, escapeHtml };
