// lib/rulesets/generic/classTemplate.js
//
// Renders a Generic-ruleset Class sheet -- deliberately NARRATIVE-FIRST
// with no numeric leveling table, unlike Echoes' 1-99 tree or 5e/pf2e's
// real level-by-level math. A Generic world has no leveling CONCEPT at
// all (world_config.generic_system_json only defines attributes and an
// optional derived-stat formula layer -- see
// lib/rulesets/generic/statFormulas.js's header), so inventing a fake
// leveling system here would be fabricating a mechanic no world asked
// for, the same reasoning that kept Bestiary's Homebrew tier from
// inventing budget tables no verified source backs. A class is instead
// a themed package: which of this world's own attributes it leans on,
// plus a list of narrative features/abilities -- no derived numbers at
// the class level, since those only make sense for an actual character
// (a Player Character entry, not the class template itself).
//
// Entry shape (`cls`, the parsed raw_json for a ruleset='generic' classes entry):
//   {
//     id, name, keyAttribute,  // one of this world's own attribute keys, or null
//     flavor, description,
//     features: [{ name, description }],
//     designNotes, faction, sourceMode: 'homebrew'
//   }

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function keyAttributeLabel(cls, genericSystem) {
  if (!cls.keyAttribute) return null;
  const defs = (genericSystem && genericSystem.attributes) || [];
  const match = defs.find((d) => d.key === cls.keyAttribute);
  return match ? match.label : cls.keyAttribute;
}

function buildClassBodyHtml(cls, genericSystem, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${cls.id}" data-category="classes" data-entry-id="${cls.id}" data-label="Class portrait" src="${imageUrl || `images/${cls.id}.png`}" alt="${escapeHtml(cls.name)}" onerror="handlePortraitError(this)">`;
  const keyAttrLabel = keyAttributeLabel(cls, genericSystem);

  return `
${portraitBlock}
<div class="quote-block">${escapeHtml(cls.flavor || "")}</div>

${keyAttrLabel ? `<table class="rel-table"><tr><th>Leans On</th><td>${escapeHtml(keyAttrLabel)}</td></tr></table>` : ""}

<h2>Description</h2>
<p>${escapeHtml(cls.description)}</p>

${cls.features && cls.features.length ? `<h2>Features</h2>${cls.features.map((f) => `<p><strong>${escapeHtml(f.name)}.</strong> ${escapeHtml(f.description)}</p>`).join("\n")}` : ""}

${cls.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(cls.designNotes)}</p>` : ""}
`;
}

function buildClassManifestEntry(cls) {
  return {
    id: cls.id,
    name: cls.name,
    subtitle: "Homebrew class",
    tags: [`<span class="tag">homebrew</span>`],
    faction: cls.faction || null,
    locked: false
  };
}

module.exports = { buildClassBodyHtml, buildClassManifestEntry, slugify, escapeHtml };
