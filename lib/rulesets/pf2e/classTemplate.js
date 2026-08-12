// lib/rulesets/pf2e/classTemplate.js
//
// Renders a real PF2e class sheet -- key ability/HP tier/saves header, a
// full level 1-20 table (Class DC, Perception, the three saves, HP,
// features), all computed from classFormulas.js's verified proficiency
// math, not model-guessed. A genuinely different shape from both Echoes'
// (lib/classTemplate.js) and 5e's (lib/rulesets/5e/classTemplate.js)
// tables -- PF2e has no subclasses or spell-slot columns at this layer.
//
// Entry shape (`cls`, the parsed raw_json for a ruleset='pf2e' classes entry):
//   {
//     id, name, keyAbility: 'str'|'dex'|'con'|'int'|'wis'|'cha', hpTier: 'high'|'medium'|'low'|'caster',
//     classDcSchedule: [{level, rank}],   // model-proposed, code-validated
//     goodSaves: ['fortitude','will'],     // model picks 2 of 3; the third is this class's "poor" save
//     features: [{ level, name, description }],
//     flavor, designNotes, faction, sourceMode: 'homebrew'
//   }

const {
  proficiencyAtLevel,
  computeClassDC,
  computeHitPoints,
  abilityModifierFromScore,
  ABILITY_BOOST_LEVELS,
  SKILL_INCREASE_LEVELS,
  DEFAULT_GOOD_SAVE_SCHEDULE,
  DEFAULT_POOR_SAVE_SCHEDULE,
  DEFAULT_PERCEPTION_SCHEDULE
} = require("./classFormulas");

const DEFAULT_ANCESTRY_HP = 8; // see classFormulas.js's header -- this project doesn't model a separate ancestry system, so every homebrew class assumes a flat, documented medium-ancestry-typical baseline rather than 0.
const ABILITY_LABELS = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const SAVE_LABELS = { fortitude: "Fortitude", reflex: "Reflex", will: "Will" };
const ALL_SAVES = ["fortitude", "reflex", "will"];

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function fmtBonus(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

function saveScheduleFor(cls, saveKey) {
  return (cls.goodSaves || []).includes(saveKey) ? DEFAULT_GOOD_SAVE_SCHEDULE : DEFAULT_POOR_SAVE_SCHEDULE;
}

function levelFeatureNames(cls, level) {
  const names = [];
  const feature = (cls.features || []).find((f) => f.level === level);
  if (feature) names.push(feature.name);
  if (ABILITY_BOOST_LEVELS.includes(level)) names.push("Ability Boosts");
  if (SKILL_INCREASE_LEVELS.includes(level)) names.push("Skill Increase");
  return names.length ? names.join(", ") : "—";
}

function levelTable(cls) {
  const keyMod = abilityModifierFromScore(cls.keyAbilityScore != null ? cls.keyAbilityScore : 18);
  const rows = [];
  for (let level = 1; level <= 20; level++) {
    const classDc = computeClassDC(cls.classDcSchedule, cls.keyAbilityScore != null ? cls.keyAbilityScore : 18, level);
    const perception = proficiencyAtLevel(DEFAULT_PERCEPTION_SCHEDULE, level);
    const hp = computeHitPoints({ ancestryHp: DEFAULT_ANCESTRY_HP, hpTier: cls.hpTier, level, conScore: cls.conScore != null ? cls.conScore : 14 });
    const saveCells = ALL_SAVES.map((s) => {
      const { bonus } = proficiencyAtLevel(saveScheduleFor(cls, s), level);
      return `<td>${fmtBonus(bonus)}</td>`;
    }).join("");
    rows.push(`<tr><td>${level}</td><td>${classDc}</td><td>${fmtBonus(perception.bonus)}</td>${saveCells}<td>${hp}</td><td>${levelFeatureNames(cls, level)}</td></tr>`);
  }
  return `<table class="rel-table">
<tr><th>Level</th><th>Class DC</th><th>Perception</th><th>Fort</th><th>Ref</th><th>Will</th><th>HP</th><th>Features</th></tr>
${rows.join("\n")}
</table>`;
}

function buildClassBodyHtml(cls, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${cls.id}" data-category="classes" data-entry-id="${cls.id}" data-label="Class portrait" src="${imageUrl || `images/${cls.id}.png`}" alt="${escapeHtml(cls.name)}" onerror="handlePortraitError(this)">`;
  const poorSave = ALL_SAVES.find((s) => !(cls.goodSaves || []).includes(s));

  return `
${portraitBlock}
<div class="quote-block">${escapeHtml(cls.flavor || "")}</div>

<table class="rel-table">
<tr><th>Key Ability</th><td>${ABILITY_LABELS[cls.keyAbility] || escapeHtml(cls.keyAbility)}</td></tr>
<tr><th>Hit Points Tier</th><td>${escapeHtml(cls.hpTier)}</td></tr>
<tr><th>Good Saves</th><td>${(cls.goodSaves || []).map((s) => SAVE_LABELS[s] || s).join(", ")}</td></tr>
<tr><th>Poor Save</th><td>${SAVE_LABELS[poorSave] || poorSave || "—"}</td></tr>
</table>

<h2>Class Table (Levels 1–20)</h2>
${levelTable(cls)}

${cls.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(cls.designNotes)}</p>` : ""}
`;
}

function buildClassManifestEntry(cls) {
  return {
    id: cls.id,
    name: cls.name,
    subtitle: `${ABILITY_LABELS[cls.keyAbility] || cls.keyAbility} · ${cls.hpTier} HP tier`,
    tags: [`<span class="tag">PF2e Class</span>`, `<span class="tag">homebrew</span>`],
    faction: cls.faction || null,
    locked: false
  };
}

module.exports = { buildClassBodyHtml, buildClassManifestEntry, slugify, escapeHtml, DEFAULT_ANCESTRY_HP };
