// lib/rulesets/5e/classTemplate.js
//
// Renders a real 5e class stat block -- hit die/saves/proficiencies
// header, a real level-by-level table (1-20: proficiency bonus, class
// features at that level, spell slots by spell level if this class
// casts), and a subclass section unlocking at the CORRECT level for
// this class (code-determined, not model-guessed -- see
// classFormulas.js's SUBCLASS_UNLOCK_LEVEL). A genuinely different
// shape from Echoes' 1-99 + Level 50 Evolution table
// (lib/classTemplate.js, untouched).
//
// Entry shape (`cls`, the parsed raw_json for a ruleset='5e' classes entry):
//   {
//     id, name, hitDie, primaryAbility, savingThrowProficiencies: ["str","con"],
//     casterType: 'full' | 'half' | 'third' | 'warlock' | 'none',
//     spellcastingAbility: 'int' | 'wis' | 'cha' | null,
//     features: [{ level, name, description }],   // class features the model proposed at meaningful milestone levels
//     subclassName,                                // this class's archetype-category label, e.g. "Draconic Bloodline"-style
//     subclassUnlockLevel,                          // CODE-SET from classFormulas.js, not model-proposed
//     subclasses: [{ name, flavor, features: [{ level, name, description }] }],
//     flavor, designNotes, faction, sourceMode: 'homebrew'
//   }

const { proficiencyBonusForLevel, spellSlotsForLevel, ABILITY_SCORE_IMPROVEMENT_LEVELS } = require("./classFormulas");

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

const ABILITY_LABELS = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

function levelFeatureNames(cls, level) {
  const names = [];
  const feature = (cls.features || []).find((f) => f.level === level);
  if (feature) names.push(feature.name);
  if (level === cls.subclassUnlockLevel) names.push(`${escapeHtml(cls.subclassName || "Subclass")} feature`);
  if (ABILITY_SCORE_IMPROVEMENT_LEVELS.includes(level)) names.push("Ability Score Improvement");
  return names.length ? names.join(", ") : "—";
}

function spellSlotsRow(cls, level) {
  if (!cls.casterType || cls.casterType === "none") return "";
  const slots = spellSlotsForLevel(cls.casterType, level);
  if (!slots) return "";
  if (cls.casterType === "warlock") {
    return slots.slots > 0 ? `${slots.slots} slots (${slots.slotLevel}${ordinalSuffix(slots.slotLevel)}-level)` : "—";
  }
  const nonZero = slots.map((count, i) => (count > 0 ? `${count}×${i + 1}${ordinalSuffix(i + 1)}` : null)).filter(Boolean);
  return nonZero.length ? nonZero.join(", ") : "—";
}

function ordinalSuffix(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function levelTable(cls) {
  const isCaster = cls.casterType && cls.casterType !== "none";
  const rows = [];
  for (let level = 1; level <= 20; level++) {
    rows.push(`<tr><td>${level}</td><td>${proficiencyBonusForLevel(level) >= 0 ? "+" : ""}${proficiencyBonusForLevel(level)}</td><td>${levelFeatureNames(cls, level)}</td>${isCaster ? `<td>${spellSlotsRow(cls, level)}</td>` : ""}</tr>`);
  }
  return `<table class="rel-table">
<tr><th>Level</th><th>Prof. Bonus</th><th>Features</th>${isCaster ? "<th>Spell Slots</th>" : ""}</tr>
${rows.join("\n")}
</table>`;
}

function subclassBlock(cls) {
  if (!cls.subclasses || !cls.subclasses.length) return "";
  return cls.subclasses
    .map(
      (sc) => `<h3>${escapeHtml(sc.name)}</h3>
<p class="flavor">${escapeHtml(sc.flavor || "")}</p>
${(sc.features || []).map((f) => `<p><strong>${escapeHtml(f.name)}</strong> (level ${f.level}): ${escapeHtml(f.description)}</p>`).join("\n")}`
    )
    .join("\n");
}

function buildClassBodyHtml(cls, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${cls.id}" data-category="classes" data-entry-id="${cls.id}" data-label="Class portrait" src="${imageUrl || `images/${cls.id}.png`}" alt="${escapeHtml(cls.name)}" onerror="handlePortraitError(this)">`;

  return `
${portraitBlock}
<div class="quote-block">${escapeHtml(cls.flavor || "")}</div>

<table class="rel-table">
<tr><th>Hit Die</th><td>${escapeHtml(cls.hitDie)}</td></tr>
<tr><th>Primary Ability</th><td>${ABILITY_LABELS[cls.primaryAbility] || escapeHtml(cls.primaryAbility)}</td></tr>
<tr><th>Saving Throw Proficiencies</th><td>${(cls.savingThrowProficiencies || []).map((a) => ABILITY_LABELS[a] || a).join(", ")}</td></tr>
${cls.casterType && cls.casterType !== "none" ? `<tr><th>Spellcasting Ability</th><td>${ABILITY_LABELS[cls.spellcastingAbility] || escapeHtml(cls.spellcastingAbility)}</td></tr>` : ""}
<tr><th>Subclass Choice</th><td>${escapeHtml(cls.subclassName || "Subclass")}, chosen at level ${cls.subclassUnlockLevel}</td></tr>
</table>

<h2>Class Table (Levels 1–20)</h2>
${levelTable(cls)}

${cls.subclasses && cls.subclasses.length ? `<h2>${escapeHtml(cls.subclassName || "Subclasses")}</h2>${subclassBlock(cls)}` : ""}

${cls.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(cls.designNotes)}</p>` : ""}
`;
}

function buildClassManifestEntry(cls) {
  return {
    id: cls.id,
    name: cls.name,
    subtitle: `${cls.hitDie || ""} · ${cls.casterType && cls.casterType !== "none" ? "Spellcaster" : "Martial"}`,
    tags: [`<span class="tag">5e Class</span>`, `<span class="tag">homebrew</span>`],
    faction: cls.faction || null,
    locked: false
  };
}

module.exports = { buildClassBodyHtml, buildClassManifestEntry, slugify, escapeHtml };
