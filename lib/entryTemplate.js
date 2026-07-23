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

const FACTION_CATEGORY_ID = {
  preservation: "the-preservation",
  ferro_kings: "the-ferro-kings",
  the_board: "the-board",
  glitch_kin: "glitch-kin",
  unaligned: null
};

const FACTION_LABEL = {
  preservation: "The Preservation",
  ferro_kings: "The Ferro-Kings",
  the_board: "The Board",
  glitch_kin: "Glitch-Kin",
  unaligned: "Unaligned"
};

// Builds bodyHtml from structured NpcContent JSON, matching the exact
// classes/structure used in adaeze-okonkwo.js. This is the single source
// of truth for archive HTML — the model never generates raw HTML.
function buildBodyHtml(npc, imageUrl) {
  const name = escapeHtml(npc.name);
  const factionId = FACTION_CATEGORY_ID[npc.faction];

  const portraitBlock = `<img class="portrait-img" src="${imageUrl || `images/${npc.id}.png`}" alt="${name}" onerror="this.outerHTML='&lt;div class=&quot;portrait-slot&quot;&gt;Character portrait — pending&lt;span class=&quot;sub&quot;&gt;art prompt not yet generated&lt;/span&gt;&lt;/div&gt;'">`;

  const relationshipRows = (npc.relationships || [])
    .map((r) => {
      const toHref = r.toCategory && r.toId
        ? `<a href="dossier.html?category=${escapeHtml(r.toCategory)}&id=${escapeHtml(r.toId)}">${escapeHtml(r.toLabel)}</a>`
        : escapeHtml(r.toLabel || "");
      return `<tr><td>${escapeHtml(r.type)}</td><td>${toHref}</td><td>${escapeHtml(r.why)}</td></tr>`;
    })
    .join("\n");

  const dialogueBlocks = [];
  if (npc.dialogue && npc.dialogue.openingLine) {
    dialogueBlocks.push(
      `<div class="dialogue-block">\n<span class="speaker">${name}:</span> "${escapeHtml(npc.dialogue.openingLine)}"\n</div>`
    );
    (npc.dialogue.branches || []).forEach((b) => {
      dialogueBlocks.push(`<span class="branch-label">${escapeHtml(b.toneLabel)}</span>`);
      dialogueBlocks.push(
        `<div class="dialogue-block">\n<span class="speaker">${name}:</span> "${escapeHtml(b.reply)}"\n</div>`
      );
    });
  }

  const questHookBlock = npc.questHook
    ? `<h2>Quest Hook</h2>\n<p>${escapeHtml(npc.questHook)}</p>\n`
    : "";

  return `
${portraitBlock}
<div class="quote-block">"${escapeHtml(npc.signatureQuote)}"</div>
<p class="flavor">${escapeHtml(npc.physicalDescription)}</p>
<p><strong>Age:</strong> ${escapeHtml(npc.age)}</p>
<h2>Personality</h2>
<p><strong>Traits:</strong> ${escapeHtml((npc.traits || []).join(", "))}</p>
<p><strong>The Contradiction:</strong> ${escapeHtml(npc.contradiction)}</p>
<h2>Motivation</h2>
<p><strong>Wants:</strong> ${escapeHtml(npc.wants)}</p>
<p><strong>Actually needs:</strong> ${escapeHtml(npc.actuallyNeeds)}</p>
<h2>Speech Pattern</h2>
<p><strong>Register:</strong> ${escapeHtml(npc.speech.register)}</p>
<p><strong>Rhythm:</strong> ${escapeHtml(npc.speech.rhythm)}</p>
<p><strong>Tic:</strong> ${escapeHtml(npc.speech.tic)}</p>
<p><strong>Would never say:</strong> ${escapeHtml(npc.speech.neverSay)}</p>
<h2>Relationships</h2>
<table class="rel-table">
<tr><th>Connection</th><th>To</th><th>Why</th></tr>
${relationshipRows}
</table>
<h2>Sample Dialogue</h2>
${dialogueBlocks.join("\n")}
${questHookBlock}<h2>Design Notes</h2>
<p>${escapeHtml(npc.designNotes)}</p>
`;
}

// Escapes characters that would break out of a JS template literal.
function escapeForTemplateLiteral(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildEntryFileContent(npc) {
  const bodyHtml = buildBodyHtml(npc);
  const safeBodyHtml = escapeForTemplateLiteral(bodyHtml);
  const factionId = FACTION_CATEGORY_ID[npc.faction];
  const factionLink = factionId
    ? `<a href="dossier.html?category=factions&id=${factionId}">${FACTION_LABEL[npc.faction]}</a>`
    : FACTION_LABEL[npc.faction] || "Unaligned";

  const entryMeta = {
    category: "npcs",
    id: npc.id,
    name: npc.name,
    eyebrow: `NPC Dossier — ${npc.roleArchetype}`,
    subtitle: npc.callsign ? `"${npc.callsign}"` : "",
    faction: npc.faction,
    roleArchetype: npc.roleArchetype,
    age: npc.age,
    contradiction: npc.contradiction,
    speechTic: npc.speech ? npc.speech.tic : undefined,
    tags: [`<span class="tag">${escapeHtml(npc.roleArchetype)}</span>`],
    raw: npc,
    footer: [
      `Faction: ${factionLink}`,
      `Source: generated via World Forge pipeline`
    ]
  };

  // Everything except bodyHtml is safe to JSON.stringify. bodyHtml is
  // spliced in separately as a template literal.
  const metaJson = JSON.stringify(entryMeta, null, 2);
  // Insert bodyHtml as a backtick template literal field before the closing brace.
  const withBodyHtml = metaJson.replace(
    /\n\}$/,
    `,\n  "bodyHtml": \`${safeBodyHtml}\`\n}`
  );

  return `window.ENTRY = ${withBodyHtml};\n`;
}

function buildManifestEntry(npc, factionLabel) {
  return {
    id: npc.id,
    name: npc.name,
    subtitle: `${npc.roleArchetype} — ${factionLabel || "Unaligned"}`,
    tags: [],
    faction: npc.faction,
    roleArchetype: npc.roleArchetype,
    locked: false
  };
}

module.exports = { buildBodyHtml, buildEntryFileContent, buildManifestEntry, slugify, escapeForTemplateLiteral };
