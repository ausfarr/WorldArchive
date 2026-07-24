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

function buildLogBodyHtml(log) {
  const preBlock = `<pre style="background: var(--bg-panel-raised); border: 1px solid var(--border-line); padding: 20px; font-family: var(--font-mono); font-size: 0.85rem; line-height: 1.7; white-space: pre-wrap; color: var(--ink);">${escapeHtml(log.bodyText)}</pre>`;

  const contextBlock = `<p class="flavor">${escapeHtml(log.context)}</p>\n`;

  return `
${contextBlock}<h2>${escapeHtml(LOG_TYPE_LABEL[log.logType])}</h2>
${preBlock}
<h2>Design Notes</h2>
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
    footer: [`Source: generated via World Forge pipeline`]
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
