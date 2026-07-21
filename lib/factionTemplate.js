const { buildRoundupHtml } = require("./factionRoundup");

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildFactionBodyHtml(faction, roundupRows) {
  const relationshipRows = (faction.relationships || [])
    .map((r) => `<tr><td>${escapeHtml(r.faction)}</td><td>${escapeHtml(r.stance)}</td><td>${escapeHtml(r.why)}</td></tr>`)
    .join("\n");

  return `
<div class="quote-block">"${escapeHtml(faction.overviewQuote)}"</div>
<h2>Origin</h2>
<p>${escapeHtml(faction.origin)}</p>
<h2>Core Philosophy</h2>
<p><em>"${escapeHtml(faction.corePhilosophy)}"</em></p>
<h2>Structure &amp; Hierarchy</h2>
<p>${escapeHtml(faction.structureHierarchy)}</p>
<h2>Territory</h2>
<p>${escapeHtml(faction.territory)}</p>
<h2>Goals</h2>
<p><strong>Near-term:</strong> ${escapeHtml(faction.goalsNearTerm)}</p>
<p><strong>Long-term:</strong> ${escapeHtml(faction.goalsLongTerm)}</p>
<h2>Internal Tensions</h2>
<p>${escapeHtml(faction.internalTensions)}</p>
<h2>Iconography</h2>
<p>${escapeHtml(faction.iconography)}</p>
<h2>Relationships</h2>
<table class="rel-table">
<tr><th>Faction</th><th>Stance</th><th>Why</th></tr>
${relationshipRows}
</table>
<h2>Economy &amp; Resources</h2>
<p>${escapeHtml(faction.economyResources)}</p>
<h2>Joining / Absorption</h2>
<p>${escapeHtml(faction.joining)}</p>
${buildRoundupHtml(roundupRows)}
`;
}

function escapeForTemplateLiteral(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildFactionEntryFileContent(faction, roundupRows) {
  const bodyHtml = buildFactionBodyHtml(faction, roundupRows);
  const safeBodyHtml = escapeForTemplateLiteral(bodyHtml);

  const entryMeta = {
    category: "factions",
    id: faction.id,
    name: faction.name,
    eyebrow: `Faction Dossier — ${faction.territory ? faction.territory.split(".")[0] : ""}`,
    subtitle: `Epithet: "${faction.nickname}"`,
    faction: faction.factionKey,
    tags: [],
    footer: [`Source: generated via World Forge pipeline (Deep Lore) + live archive (Roundup)`]
  };

  const metaJson = JSON.stringify(entryMeta, null, 2);
  const withBodyHtml = metaJson.replace(
    /\n\}$/,
    `,\n  "bodyHtml": \`${safeBodyHtml}\`\n}`
  );

  return `window.ENTRY = ${withBodyHtml};\n`;
}

function buildFactionManifestEntry(faction) {
  return {
    id: faction.id,
    name: faction.name,
    subtitle: faction.nickname,
    tags: [],
    faction: faction.factionKey,
    locked: false
  };
}

module.exports = {
  buildFactionBodyHtml,
  buildFactionEntryFileContent,
  buildFactionManifestEntry,
  escapeForTemplateLiteral
};
