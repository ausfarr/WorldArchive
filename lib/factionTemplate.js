const { buildRoundupHtml } = require("./factionRoundup");
const { formatWorldDate } = require("./calendar");

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Buckets a free-text stance (the model writes whatever fits, e.g. "Open
// war", "Uneasy alliance", "Trade partner" -- see the schema comment in
// prompts/factionContentPrompt.js, there's no fixed enum) into one of four
// edge colors for the graph below. Keyword-matched rather than exact, since
// the model's actual wording varies call to call; falls through to a
// neutral color for anything that doesn't match a bucket rather than
// guessing. Order matters: "hostile" is checked before "rival" so e.g.
// "hostile rivalry" reads as the more severe bucket.
function stanceGraphColor(stance) {
  const s = String(stance || "").toLowerCase();
  if (/war|hostil|enem|invas|conflict|threat/.test(s)) return "var(--neon-primary)";
  // Checked before the ally bucket below on purpose: "uneasy alliance" and
  // similar hedged phrasing contain an ally keyword (allian...) but read as
  // the more strained relationship, not a clean partnership.
  if (/rival|tension|uneasy|distrust|wary|suspicio|strain/.test(s)) return "#e0a83c";
  if (/ally|allian|partner|friend|trade|cooperat|support/.test(s)) return "var(--neon-cyan)";
  return "var(--ink-faint)";
}

// SVG text has no wrapping -- long faction names would run off the node or
// overlap their neighbors in a radial layout. Truncated labels still carry
// the full name via the <title> tooltip and the unabridged rel-table right
// below the graph, so nothing is actually lost, just not shown twice.
function truncateGraphLabel(name, max = 16) {
  const s = String(name || "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Renders this faction's relationships as a small radial diagram --
// this faction at the center, every related faction placed around it,
// edges colored by stance (see stanceGraphColor). Pure presentation over
// data that already exists (faction.relationships, faction.name,
// faction.factionKey for the accent color) -- no new generation, no new
// fields, no migration. Competitor scan (claude_marketing/COMPETITOR_WATCH.md,
// 2026-08-19/08-30 entries) flagged a visual entity-relationship graph as a
// pattern shared by CharGen, Reality Forge, and Grimoire -- this is the
// smallest real slice of that: factions are the one category whose
// relationships are already structured (toId/stance/why) rather than prose,
// per lib/entryLinkRegistry.js's SHARED_FIELDS.factions entry.
//
// Capped at 12 satellites (a world's actual faction count is small --
// CLAUDE.md's wizard-driven faction step -- so this is a safety margin
// against radial crowding, not a real-world limit); the rel-table below
// still lists every relationship regardless of the cap.
const MAX_GRAPH_NODES = 12;

function buildRelationshipGraphSvg(faction) {
  const rels = (faction.relationships || []).filter((r) => r && (r.faction || r.toLabel));
  if (!rels.length) return "";
  const shown = rels.slice(0, MAX_GRAPH_NODES);
  const overflow = rels.length - shown.length;

  const size = 480;
  const center = size / 2;
  const radius = 165;
  const centerR = 34;
  const nodeR = 26;

  const centerColor = "var(--fac-color, var(--neon-primary))";
  const centerLabel = escapeHtml(truncateGraphLabel(faction.name));

  const edges = [];
  const nodes = [];
  shown.forEach((r, i) => {
    const angle = (2 * Math.PI * i) / shown.length - Math.PI / 2;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    const color = stanceGraphColor(r.stance);
    const label = escapeHtml(r.faction || r.toLabel);
    const title = escapeHtml([r.stance, r.why].filter(Boolean).join(" — "));

    edges.push(`<line x1="${center}" y1="${center}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="2" opacity="0.75" />`);

    const nodeInner = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${nodeR}" fill="var(--bg-panel-raised)" stroke="${color}" stroke-width="2" /><text x="${x.toFixed(1)}" y="${(y + nodeR + 16).toFixed(1)}" text-anchor="middle" class="rel-graph-label">${escapeHtml(truncateGraphLabel(r.faction || r.toLabel))}</text><title>${label}${title ? ` — ${title}` : ""}</title>`;
    nodes.push(r.toId
      ? `<a href="dossier.html?category=factions&id=${escapeHtml(r.toId)}">${nodeInner}</a>`
      : nodeInner);
  });

  const overflowNote = overflow > 0
    ? `<p class="flavor">+ ${overflow} more relationship${overflow === 1 ? "" : "s"} below, not pictured</p>`
    : "";

  return `
<div class="rel-graph" role="img" aria-label="Relationship diagram for ${escapeHtml(faction.name)}">
<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
${edges.join("\n")}
${nodes.join("\n")}
<circle cx="${center}" cy="${center}" r="${centerR}" fill="${centerColor}" />
<text x="${center}" y="${(center + centerR + 18).toFixed(1)}" text-anchor="middle" class="rel-graph-label rel-graph-label-center">${centerLabel}</text>
<title>${escapeHtml(faction.name)}</title>
</svg>
</div>
${overflowNote}`;
}

// calendarConfig is optional (Session Prep Companion, Phase 3) -- a
// faction generated before Phase 2's calendar existed, or in a world
// that never set one up, simply has no foundingDate to render; passing
// null/undefined here just skips the line rather than erroring.
function buildFactionBodyHtml(faction, roundupRows, calendarConfig) {
  // Session Prep Companion, Phase 3/7 -- founding date + status share one line.
  const foundingParts = [];
  if (faction.status) foundingParts.push(`Status: ${escapeHtml(faction.status)}`);
  if (faction.foundingDate) foundingParts.push(`Founded: ${escapeHtml(formatWorldDate(faction.foundingDate, calendarConfig))}`);
  const foundingLine = foundingParts.length ? `<p class="flavor">${foundingParts.join(" &nbsp;|&nbsp; ")}</p>` : "";
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
${buildRelationshipGraphSvg(faction)}
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
  buildRelationshipGraphSvg,
  escapeForTemplateLiteral
};
