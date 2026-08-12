// lib/rulesets/generic/itemTemplate.js
//
// Renders a Generic-ruleset item card -- narrative-first, same reasoning
// as lib/rulesets/generic/classTemplate.js: no rarity/pricing system
// exists for a made-up world (unlike 5e's DMG rarity tiers or pf2e's
// item-level guidance, neither of which apply here), so an item is
// flavor + description plus an OPTIONAL single attribute bonus tied
// directly to one of this world's own attributes -- nothing fabricated
// beyond what the world itself defined.
//
// Entry shape (`item`, the parsed raw_json for a ruleset='generic' items entry):
//   {
//     id, name, flavor, description,
//     boostsAttribute,  // one of this world's own attribute keys, or null
//     boostAmount,      // integer, or null if boostsAttribute is null
//     designNotes, faction, sourceMode: 'homebrew'
//   }

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function boostLine(item, genericSystem) {
  if (!item.boostsAttribute) return "";
  const defs = (genericSystem && genericSystem.attributes) || [];
  const match = defs.find((d) => d.key === item.boostsAttribute);
  const label = match ? match.label : item.boostsAttribute;
  const amount = item.boostAmount != null ? item.boostAmount : 0;
  return `<tr><th>Bonus</th><td>${amount >= 0 ? "+" : ""}${amount} ${escapeHtml(label)}</td></tr>`;
}

function buildItemBodyHtml(item, genericSystem, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${item.id}" data-category="items" data-entry-id="${item.id}" data-label="Item portrait" src="${imageUrl || `images/${item.id}.png`}" alt="${escapeHtml(item.name)}" onerror="handlePortraitError(this)">`;
  const boost = boostLine(item, genericSystem);

  return `
${portraitBlock}
<div class="quote-block">${escapeHtml(item.flavor || "")}</div>

${boost ? `<table class="rel-table">${boost}</table>` : ""}

<h2>Description</h2>
<p>${escapeHtml(item.description)}</p>

${item.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(item.designNotes)}</p>` : ""}
`;
}

function buildItemManifestEntry(item) {
  return {
    id: item.id,
    name: item.name,
    subtitle: "Homebrew item",
    tags: [`<span class="tag">homebrew</span>`],
    faction: item.faction || null,
    locked: false
  };
}

module.exports = { buildItemBodyHtml, buildItemManifestEntry, slugify, escapeHtml };
