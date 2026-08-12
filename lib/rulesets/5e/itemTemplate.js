// lib/rulesets/5e/itemTemplate.js
//
// Renders a real 5e item card -- rarity/attunement header, resolved
// mechanical stats (weapon damage dice / armor AC, pulled from the real
// lookup tables in itemFormulas.js plus any magic bonus, never
// model-invented), magical properties, and flavor. A different shape
// from Echoes' single Rarity+Damage-formula card
// (lib/itemTemplate.js/itemFormulas.js, untouched) -- this is mostly a
// lookup-table presentation, not a derived-formula one, per this
// project's scope doc.
//
// Entry shape (`item`, the parsed raw_json for a ruleset='5e' items entry):
//   {
//     id, name, itemType: 'weapon' | 'armor' | 'wondrous' | 'potion' | 'scroll' | 'ring' | 'rod' | 'staff' | 'wand' | 'other',
//     rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary' | 'Artifact' | null,  // null = mundane, non-magical
//     requiresAttunement, attunementRequirement,
//     baseItem,               // e.g. "longsword" / "leather" -- references itemFormulas.js's WEAPONS/ARMOR, or null
//     magicBonus,             // e.g. 1 for a +1 weapon/armor, or null
//     resolvedStats,          // CODE-COMPUTED from baseItem + magicBonus (see routes/generateItem.js) -- never model-set directly
//     description, magicalProperties: ["effect 1", "effect 2"],
//     valueGp, weightLb,
//     flavor, designNotes, faction, sourceMode: 'homebrew',
//     rarityValueWarning      // set by code if valueGp looks off for the stated rarity
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

function rarityLine(item) {
  if (!item.rarity) return "Mundane item";
  return `${escapeHtml(item.rarity)}${item.requiresAttunement ? ` (requires attunement${item.attunementRequirement ? `, ${escapeHtml(item.attunementRequirement)}` : ""})` : ""}`;
}

function resolvedStatsBlock(item) {
  const stats = item.resolvedStats;
  if (!stats) return "";
  if (item.itemType === "weapon") {
    return `<tr><th>Damage</th><td>${escapeHtml(stats.damageDice)}${item.magicBonus ? ` +${item.magicBonus}` : ""} ${escapeHtml(stats.damageType)}</td></tr>
<tr><th>Category</th><td>${escapeHtml(stats.category)}${stats.properties && stats.properties.length ? ` (${stats.properties.map(escapeHtml).join(", ")})` : ""}</td></tr>`;
  }
  if (item.itemType === "armor") {
    const dexNote = stats.dexBonus === "full" ? " + Dex modifier" : stats.dexBonus === "max2" ? " + Dex modifier (max 2)" : "";
    return `<tr><th>Armor Class</th><td>${stats.baseAc}${item.magicBonus ? ` +${item.magicBonus}` : ""}${dexNote}</td></tr>
<tr><th>Category</th><td>${escapeHtml(stats.category)}${stats.strengthMin ? `, requires Str ${stats.strengthMin}` : ""}${stats.stealthDisadvantage ? ", stealth disadvantage" : ""}</td></tr>`;
  }
  return "";
}

function buildItemBodyHtml(item, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${item.id}" data-category="items" data-entry-id="${item.id}" data-label="Item portrait" src="${imageUrl || `images/${item.id}.png`}" alt="${escapeHtml(item.name)}" onerror="handlePortraitError(this)">`;

  return `
${portraitBlock}
<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">${rarityLine(item)} — ${escapeHtml(item.itemType)}</p>
<div class="quote-block">${escapeHtml(item.flavor || "")}</div>

<table class="rel-table">
${resolvedStatsBlock(item)}
<tr><th>Value</th><td>${item.valueGp != null ? `${item.valueGp} gp` : "—"}</td></tr>
<tr><th>Weight</th><td>${item.weightLb != null ? `${item.weightLb} lb` : "—"}</td></tr>
</table>

<h2>Description</h2>
<p>${escapeHtml(item.description)}</p>

${item.magicalProperties && item.magicalProperties.length ? `<h2>Magical Properties</h2>${item.magicalProperties.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}` : ""}

${item.rarityValueWarning ? `<p class="flavor" style="color:var(--ink-faint);">⚠ ${escapeHtml(item.rarityValueWarning)}</p>` : ""}
${item.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(item.designNotes)}</p>` : ""}
`;
}

function buildItemManifestEntry(item) {
  return {
    id: item.id,
    name: item.name,
    subtitle: item.rarity ? `${item.rarity} ${item.itemType}` : `Mundane ${item.itemType}`,
    tags: [`<span class="tag">${escapeHtml(item.rarity || "Mundane")}</span>`, `<span class="tag">${escapeHtml(item.itemType)}</span>`],
    faction: item.faction || null,
    locked: false
  };
}

module.exports = { buildItemBodyHtml, buildItemManifestEntry, slugify, escapeHtml };
