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

// Attribute display order + labels -- plain canonical English, same
// convention showEnemyEditForm() uses in archive/js/render.js (the edit
// form doesn't world-flavor these either; keeping the dossier's read
// view consistent with that rather than introducing a third label
// source). World-flavored labels are still used in generation prompts
// via lib/worldFlavor.js's statLabelsText -- this is just the fixed
// display table on the dossier page itself.
const ATTRIBUTE_DISPLAY = [
  ["body", "Body"],
  ["reflex", "Reflex"],
  ["knowledge", "Knowledge"],
  ["presence", "Presence"],
  ["sanity", "Sanity"],
  ["fate", "Fate"]
];

function buildSurvivorBodyHtml(survivor, imageUrl, factionLabel) {
  const attrs = survivor.attributes || {};
  const personality = survivor.personality || {};
  const bond = survivor.bond || {};

  const portraitBlock = `<img class="portrait-img" id="portrait-img-${survivor.id}" data-category="survivors" data-entry-id="${survivor.id}" data-label="Character portrait" src="${imageUrl || `images/${survivor.id}.png`}" alt="${escapeHtml(survivor.name)}" onerror="handlePortraitError(this)">`;

  const attributeRows = ATTRIBUTE_DISPLAY
    .map(([key, label]) => `<tr><td>${label}</td><td>${escapeHtml(attrs[key] != null ? attrs[key] : "—")}</td></tr>`)
    .join("\n");

  const relationshipRows = (survivor.relationships || [])
    .map((r) => {
      const toHref = r.toCategory && r.toId
        ? `<a href="dossier.html?category=${escapeHtml(r.toCategory)}&id=${escapeHtml(r.toId)}">${escapeHtml(r.toLabel)}</a>`
        : escapeHtml(r.toLabel || "");
      return `<tr><td>${escapeHtml(r.type)}</td><td>${toHref}</td><td>${escapeHtml(r.why)}</td></tr>`;
    })
    .join("\n");
  const relationshipsBlock = relationshipRows
    ? `<h2>Relationships</h2>\n<table class="rel-table">\n<tr><th>Connection</th><th>To</th><th>Why</th></tr>\n${relationshipRows}\n</table>\n`
    : "";

  const playerLine = survivor.playerName
    ? `<p><strong>Played by:</strong> ${escapeHtml(survivor.playerName)}</p>\n`
    : "";

  return `
${portraitBlock}
<p><strong>Class:</strong> The ${escapeHtml(survivor.className)}</p>
<p><strong>Faction:</strong> ${escapeHtml(factionLabel || "Unaligned")}</p>
${playerLine}<p class="flavor">${escapeHtml(survivor.backstory)}</p>
<h2>Attributes</h2>
<table class="rel-table">
<tr><th>Attribute</th><th>Value</th></tr>
${attributeRows}
</table>
<h2>Personality</h2>
<p><strong>Trait:</strong> ${escapeHtml(personality.trait)}</p>
<p><strong>The Contradiction:</strong> ${escapeHtml(personality.contradiction)}</p>
<p><strong>Wants:</strong> ${escapeHtml(personality.wants)}</p>
<p><strong>Actually needs:</strong> ${escapeHtml(personality.actuallyNeeds)}</p>
<h2>Bond: ${escapeHtml(bond.name)}</h2>
<p><strong>Effect:</strong> ${escapeHtml(bond.effect)}</p>
<p class="flavor">${escapeHtml(bond.flavorLine)}</p>
${relationshipsBlock}<h2>Design Notes</h2>
<p>${escapeHtml(survivor.designNotes)}</p>
`;
}

// Escapes characters that would break out of a JS template literal.
// Kept for parity with the other *Template.js files even though the
// live save path (lib/fileWriter.js -> Supabase upsertEntry) doesn't use
// buildSurvivorEntryFileContent below -- that helper predates the
// Supabase migration and is currently unused/dead, left alone per
// "clean up dead code at session end, not piecemeal during feature
// work."
function escapeForTemplateLiteral(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildSurvivorEntryFileContent(survivor) {
  const bodyHtml = buildSurvivorBodyHtml(survivor);
  const safeBodyHtml = escapeForTemplateLiteral(bodyHtml);

  const entryMeta = {
    category: "survivors",
    id: survivor.id,
    name: survivor.name,
    eyebrow: "Player Character",
    subtitle: survivor.callsign
      ? `"${survivor.callsign}" — Class: The ${survivor.className}`
      : `Class: The ${survivor.className}`,
    faction: survivor.faction || null,
    className: survivor.className,
    tags: [`<span class="tag">The ${escapeHtml(survivor.className)}</span>`],
    raw: survivor,
    footer: [`Source: generated via World Forge pipeline`]
  };

  const metaJson = JSON.stringify(entryMeta, null, 2);
  const withBodyHtml = metaJson.replace(
    /\n\}$/,
    `,\n  "bodyHtml": \`${safeBodyHtml}\`\n}`
  );

  return `window.ENTRY = ${withBodyHtml};\n`;
}

function buildSurvivorManifestEntry(survivor, factionLabel) {
  return {
    id: survivor.id,
    name: survivor.name,
    subtitle: `The ${survivor.className} — ${factionLabel || "Unaligned"}`,
    tags: [],
    faction: survivor.faction || null,
    locked: false
  };
}

module.exports = {
  buildSurvivorBodyHtml,
  buildSurvivorEntryFileContent,
  buildSurvivorManifestEntry,
  slugify,
  escapeForTemplateLiteral
};
