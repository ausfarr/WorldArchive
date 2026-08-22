const { buildRoundupHtml } = require("./factionRoundup");
const { formatWorldDate } = require("./calendar");

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// calendarConfig is optional (Session Prep Companion, Phase 3) -- a
// faction generated before Phase 2's calendar existed, or in a world
// that never set one up, simply has no foundingDate to render; passing
// null/undefined here just skips the line rather than erroring.
function buildFactionBodyHtml(faction, roundupRows, calendarConfig) {
  const foundingLine = faction.foundingDate
    ? `<p class="flavor">Founded: ${escapeHtml(formatWorldDate(faction.foundingDate, calendarConfig))}</p>`
    : "";
  // Entry cross-linking, Phase 1/3: relationships[].toId/toLabel are new
  // (see lib/entryLinkRegistry.js) -- this faction's own established
  // `faction` name field stays the source of truth for what displays,
  // toId only ever adds a link on top of it once lib/entryLinker.js
  // resolves the referenced faction, same "link when present else plain
  // text" convention every other Category B field already uses
  // (lib/entryTemplate.js's NPC relationships, lib/locationTemplate.js's
  // notableNpcs, lib/logTemplate.js's locationId).
  const relationshipRows = (faction.relationships || [])
    .map((r) => {
      const toHref = r.toId
        ? `<a href="dossier.html?category=factions&id=${escapeHtml(r.toId)}">${escapeHtml(r.toLabel || r.faction)}</a>`
        : escapeHtml(r.faction || r.toLabel || "");
      return `<tr><td>${toHref}</td><td>${escapeHtml(r.stance)}</td><td>${escapeHtml(r.why)}</td></tr>`;
    })
    .join("\n");

  return `
<div class="quote-block">"${escapeHtml(faction.overviewQuote)}"</div>
${foundingLine}
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
    raw: faction,
    footer: [`Source: generated via Chronicled (Deep Lore) + live archive (Roundup)`]
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
