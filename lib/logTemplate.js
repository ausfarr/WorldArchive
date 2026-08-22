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

const LOG_TYPE_LABEL = {
  Audio: "Audio Log",
  Journal: "Journal Entry",
  Terminal: "Terminal Text"
};

const FACTION_LABEL = {
  preservation: "The Preservation",
  ferro_kings: "The Ferro-Kings",
  the_board: "The Board",
  glitch_kin: "Glitch-Kin"
};

// calendarConfig is optional (Session Prep Companion, Phase 3) -- a log
// generated before Phase 2's calendar existed, or with no resolvedDate at
// all (the normal case for most logs), simply renders no date line.
function buildLogBodyHtml(log, calendarConfig) {
  const preBlock = `<pre style="background: var(--bg-panel-raised); border: 1px solid var(--border-line); padding: 20px; font-family: var(--font-mono); font-size: 0.85rem; line-height: 1.7; white-space: pre-wrap; color: var(--ink);">${escapeHtml(log.bodyText)}</pre>`;

  const contextBlock = `<p class="flavor">${escapeHtml(log.context)}</p>\n`;
  const locationBlock = log.locationId
    ? `<p><strong>Found at:</strong> <a href="dossier.html?category=locations&id=${escapeHtml(log.locationId)}">${escapeHtml(log.locationContext)}</a></p>\n`
    : `<p><strong>Found at:</strong> ${escapeHtml(log.locationContext)}</p>\n`;
  const dateBlock = log.resolvedDate
    ? `<p><strong>In-world date:</strong> ${escapeHtml(require("./calendar").formatWorldDate(log.resolvedDate, calendarConfig))}</p>\n`
    : "";

  // Session Prep Companion, Phase 7 -- a Chronicle's suggested updates
  // (surfaced via pending_entry_updates, never auto-applied), kept
  // visible on the Chronicle itself as a record of what was proposed
  // when it was confirmed.
  const impliedUpdatesBlock = (Array.isArray(log.impliedUpdates) && log.impliedUpdates.length)
    ? `<h2>Suggested Updates</h2>\n<ul>${log.impliedUpdates.map((u) => `<li><a href="dossier.html?category=${escapeHtml(u.category)}&id=${escapeHtml(u.entryId)}">${escapeHtml(u.entryId)}</a>: ${escapeHtml(u.deltaText)}</li>`).join("")}</ul>\n`
    : "";

  return `
${contextBlock}${locationBlock}${dateBlock}<h2>${escapeHtml(LOG_TYPE_LABEL[log.logType])}</h2>
${preBlock}
${impliedUpdatesBlock}<h2>Design Notes</h2>
<p>${escapeHtml(log.designNotes)}</p>
`;
}

function escapeForTemplateLiteral(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildLogEntryFileContent(log) {
  const bodyHtml = buildLogBodyHtml(log);
  const safeBodyHtml = escapeForTemplateLiteral(bodyHtml);
  const factionLabel = log.faction ? FACTION_LABEL[log.faction] : "Personal";

  const entryMeta = {
    category: "logs",
    id: log.id,
    name: log.name,
    eyebrow: `${LOG_TYPE_LABEL[log.logType]} — Found: ${log.locationContext}`,
    subtitle: `Character(s): ${log.characters}`,
    faction: log.faction || null,
    logType: log.logType,
    tags: log.hexTongue ? [`<span class="tag">Hex-Tongue Intercept</span>`] : [],
    raw: log,
    footer: [`Source: generated via Chronicled`]
  };

  const metaJson = JSON.stringify(entryMeta, null, 2);
  const withBodyHtml = metaJson.replace(
    /\n\}$/,
    `,\n  "bodyHtml": \`${safeBodyHtml}\`\n}`
  );

  return `window.ENTRY = ${withBodyHtml};\n`;
}

function buildLogManifestEntry(log, factionLabel) {
  return {
    id: log.id,
    name: log.name,
    subtitle: `${LOG_TYPE_LABEL[log.logType]} — ${factionLabel || "Personal"}`,
    tags: [],
    faction: log.faction || null,
    locked: false
  };
}

module.exports = {
  buildLogBodyHtml,
  buildLogEntryFileContent,
  buildLogManifestEntry,
  slugify,
  escapeForTemplateLiteral
};
