const { computeArmorDR } = require("./itemFormulas");

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const CATEGORY_LABEL = {
  Weapon: "Weapon",
  Armor: "Armor/Gear",
  Consumable: "Consumable",
  QuestItem: "Quest Item"
};

function buildItemBodyHtml(item, imageUrl) {
  const portraitBlock = `<img class="portrait-img" src="${imageUrl || `images/${item.id}.png`}" alt="${escapeHtml(item.name)}" onerror="this.outerHTML='&lt;div class=&quot;portrait-slot&quot;&gt;Item render — pending&lt;span class=&quot;sub&quot;&gt;art prompt not yet generated&lt;/span&gt;&lt;/div&gt;'">`;

  let statsBlock = "";
  if (item.category === "Weapon") {
    statsBlock = `<h2>Stats</h2>
<table class="derived-table">
<tr><th>Stat</th><th>Value</th><th>Formula</th></tr>
<tr><td>Damage Range</td><td>${item.damageMin}\u2013${item.damageMax}</td><td class="formula">Base weapon damage, before wielder investment</td></tr>
<tr><td>Scales With</td><td>${item.relevantStat ? escapeHtml(item.relevantStat) : "\u2014"}</td><td class="formula">Wielder's attribute investment — higher raises real damage above this base range</td></tr>
<tr><td>Applies</td><td>${item.appliesStatus ? escapeHtml(item.appliesStatus) : "—"}</td><td class="formula">${item.appliesStatus ? "" : "No inherent status"}</td></tr>
</table>
${item.rarityEffect ? `<p><strong>Rarity Effect:</strong> ${escapeHtml(item.rarityEffect)}</p>\n` : ""}`;
  } else if (item.category === "Armor") {
    const dr = computeArmorDR(item.effectorTier);
    statsBlock = `<h2>Stats</h2>
<table class="derived-table">
<tr><th>Stat</th><th>Value</th><th>Formula</th></tr>
<tr><td>Damage Reduction</td><td>${dr.value}%</td><td class="formula">${escapeHtml(dr.formulaText)}</td></tr>
</table>
${item.rarityEffect ? `<p><strong>Rarity Effect:</strong> ${escapeHtml(item.rarityEffect)}</p>\n` : ""}`;
  } else if (item.category === "Consumable") {
    statsBlock = `<h2>Effect</h2>
<p><strong>AP Cost:</strong> ${escapeHtml(item.apCost)}</p>
<p><strong>Effect:</strong> ${escapeHtml(item.effect)}</p>
`;
  } else if (item.category === "QuestItem") {
    statsBlock = `<h2>Where It's Found / Why It Matters</h2>
<p>${escapeHtml(item.whereFoundWhyMatters)}</p>
`;
  }

  return `
${portraitBlock}
<p class="flavor">${escapeHtml(item.flavor)}</p>
${statsBlock}<h2>Design Notes</h2>
<p>${escapeHtml(item.designNotes)}</p>
`;
}

function escapeForTemplateLiteral(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildItemSubtitle(item) {
  if (item.category === "Weapon") {
    return `Weapon Skill: ${item.weaponSkill} — Weapon Type: ${item.weaponType}`;
  }
  if (item.category === "Armor") {
    return `${item.rarity || ""} Body Armor`.trim();
  }
  if (item.category === "Consumable") {
    return `Consumable — ${item.rarity || "Common"}`;
  }
  return "Quest Item / Relic";
}

function buildItemEntryFileContent(item) {
  const bodyHtml = buildItemBodyHtml(item);
  const safeBodyHtml = escapeForTemplateLiteral(bodyHtml);

  const entryMeta = {
    category: "items",
    id: item.id,
    name: item.name,
    eyebrow: `Item Sheet — ${item.rarity ? item.rarity + " " : ""}${CATEGORY_LABEL[item.category]}`,
    subtitle: buildItemSubtitle(item),
    faction: null,
    itemCategory: item.category,
    rarity: item.rarity || null,
    tags: item.rarity ? [`<span class="tag">${escapeHtml(item.rarity)}</span>`] : [],
    raw: item,
    footer: [`Source: generated via World Forge pipeline`]
  };

  const metaJson = JSON.stringify(entryMeta, null, 2);
  const withBodyHtml = metaJson.replace(
    /\n\}$/,
    `,\n  "bodyHtml": \`${safeBodyHtml}\`\n}`
  );

  return `window.ENTRY = ${withBodyHtml};\n`;
}

function buildItemManifestEntry(item) {
  return {
    id: item.id,
    name: item.name,
    subtitle: `${item.rarity ? item.rarity + " " : ""}${CATEGORY_LABEL[item.category]}`,
    tags: [],
    faction: null,
    locked: false
  };
}

module.exports = {
  buildItemBodyHtml,
  buildItemEntryFileContent,
  buildItemManifestEntry,
  slugify,
  escapeForTemplateLiteral
};
