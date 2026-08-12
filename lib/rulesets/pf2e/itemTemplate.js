// lib/rulesets/pf2e/itemTemplate.js
//
// Renders a real PF2e item card -- level/Bulk/price-guidance header,
// resolved rune bonuses (pulled from the real tier tables in
// itemFormulas.js, never model-invented), and flavor. A different shape
// from both Echoes' (lib/itemTemplate.js) and 5e's
// (lib/rulesets/5e/itemTemplate.js) cards -- PF2e prices by ITEM LEVEL
// rather than a fixed rarity-tier value range, and uses a rune-slot
// system instead of a flat "+N" magic bonus.
//
// Entry shape (`item`, the parsed raw_json for a ruleset='pf2e' items entry):
//   {
//     id, name, itemType: 'weapon' | 'armor' | 'other',
//     level,                       // 0-20, drives price guidance
//     priceCategory: 'primary' | 'secondary' | 'tertiary',
//     bulk: 'negligible' | 'light' | '1' | '2' | ...,
//     potencyTier: 1 | 2 | 3 | null,     // weapon: attack bonus: armor: AC bonus
//     strikingTier: 1 | 2 | 3 | null,    // weapon only -- extra damage dice
//     resilientTier: 1 | 2 | 3 | null,   // armor only -- save bonus
//     propertyRuneNames: ["Flaming", ...],  // flavor names, count checked against potencyTier's rune slots
//     description, flavor, designNotes, faction, sourceMode: 'homebrew',
//     priceGuidance                // CODE-COMPUTED, see itemFormulas.js's priceGuidance()
//   }

const { priceGuidance, potencyTier, strikingTier, resilientTier, bulkValue } = require("./itemFormulas");

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function runeBlock(item) {
  const lines = [];
  if (item.itemType === "weapon" && item.potencyTier) {
    const p = potencyTier(item.potencyTier);
    lines.push(`<tr><th>Weapon Potency</th><td>+${p.attackOrAcBonus} to attack rolls (${p.runeSlots} property rune slot${p.runeSlots === 1 ? "" : "s"})</td></tr>`);
  }
  if (item.itemType === "weapon" && item.strikingTier) {
    const s = strikingTier(item.strikingTier);
    lines.push(`<tr><th>${escapeHtml(s.label)}</th><td>+${s.extraDice} weapon damage die/dice</td></tr>`);
  }
  if (item.itemType === "armor" && item.potencyTier) {
    const p = potencyTier(item.potencyTier);
    lines.push(`<tr><th>Armor Potency</th><td>+${p.attackOrAcBonus} item bonus to AC (${p.runeSlots} property rune slot${p.runeSlots === 1 ? "" : "s"})</td></tr>`);
  }
  if (item.itemType === "armor" && item.resilientTier) {
    const r = resilientTier(item.resilientTier);
    lines.push(`<tr><th>${escapeHtml(r.label)}</th><td>+${r.saveBonus} item bonus to saving throws</td></tr>`);
  }
  return lines.join("\n");
}

function buildItemBodyHtml(item, imageUrl) {
  const portraitBlock = `<img class="portrait-img" id="portrait-img-${item.id}" data-category="items" data-entry-id="${item.id}" data-label="Item portrait" src="${imageUrl || `images/${item.id}.png`}" alt="${escapeHtml(item.name)}" onerror="handlePortraitError(this)">`;
  const price = item.priceGuidance || priceGuidance(item.level || 0, item.priceCategory || "secondary");
  const bulk = bulkValue(item.bulk || "negligible");

  return `
${portraitBlock}
<p class="flavor" style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">Level ${item.level != null ? item.level : "0"} — ${escapeHtml(item.itemType)}</p>
<div class="quote-block">${escapeHtml(item.flavor || "")}</div>

<table class="rel-table">
${runeBlock(item)}
<tr><th>Bulk</th><td>${bulk === 0 ? "Negligible" : bulk < 1 ? "Light" : bulk}</td></tr>
<tr><th>Price</th><td>${price.suggestedGp} gp <span style="color:var(--ink-faint); font-size:0.8rem;">(estimated guidance, ${price.minGp}–${price.maxGp} gp range for this level)</span></td></tr>
${item.propertyRuneNames && item.propertyRuneNames.length ? `<tr><th>Property Runes</th><td>${item.propertyRuneNames.map(escapeHtml).join(", ")}</td></tr>` : ""}
</table>

<h2>Description</h2>
<p>${escapeHtml(item.description)}</p>

${item.designNotes ? `<h2>Design Notes</h2><p>${escapeHtml(item.designNotes)}</p>` : ""}
`;
}

function buildItemManifestEntry(item) {
  return {
    id: item.id,
    name: item.name,
    subtitle: `Level ${item.level != null ? item.level : "0"} ${item.itemType}`,
    tags: [`<span class="tag">Level ${item.level != null ? item.level : "0"}</span>`, `<span class="tag">${escapeHtml(item.itemType)}</span>`],
    faction: item.faction || null,
    locked: false
  };
}

module.exports = { buildItemBodyHtml, buildItemManifestEntry, slugify, escapeHtml };
