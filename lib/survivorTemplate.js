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

function buildSurvivorBodyHtml(survivor) {
  const portraitBlock = `<img class="portrait-img" src="images/${survivor.id}.png" alt="${escapeHtml(survivor.name)}" onerror="this.outerHTML='&lt;div class=&quot;portrait-slot&quot;&gt;Character portrait — pending&lt;span class=&quot;sub&quot;&gt;art prompt not yet generated&lt;/span&gt;&lt;/div&gt;'">`;

  return `
${portraitBlock}
<p class="flavor">${escapeHtml(survivor.backstory)}</p>
<h2>Class Assignment</h2>
<p><strong>Class:</strong> The ${escapeHtml(survivor.className)}</p>
<h2>Quirk: ${escapeHtml(survivor.quirk.name)}</h2>
<p><strong>Effect:</strong> ${escapeHtml(survivor.quirk.effect)}</p>
<p class="flavor">${escapeHtml(survivor.quirk.flavorLine)}</p>
<h2>Design Notes</h2>
<p>${escapeHtml(survivor.designNotes)}</p>
`;
}

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
    eyebrow: "Survivor Record",
    subtitle: survivor.callsign
      ? `"${survivor.callsign}" — Class: The ${survivor.className}`
      : `Class: The ${survivor.className}`,
    faction: null,
    className: survivor.className,
    tags: [`<span class="tag">The ${escapeHtml(survivor.className)}</span>`],
    footer: [`Source: generated via World Forge pipeline`]
  };

  const metaJson = JSON.stringify(entryMeta, null, 2);
  const withBodyHtml = metaJson.replace(
    /\n\}$/,
    `,\n  "bodyHtml": \`${safeBodyHtml}\`\n}`
  );

  return `window.ENTRY = ${withBodyHtml};\n`;
}

function buildSurvivorManifestEntry(survivor) {
  return {
    id: survivor.id,
    name: survivor.name,
    subtitle: `Class: The ${survivor.className}`,
    tags: [],
    faction: null,
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
