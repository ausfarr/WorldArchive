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

// Multi-ruleset genericization, Phase 7: NPCs stay ruleset-agnostic
// narrative content for every world (see world_forge_scope.md's
// registry section) EXCEPT this one optional field -- npc.combatProfile
// is undefined for every Echoes NPC and every 5e NPC created before this
// phase shipped, so combatProfileBlock() below returns "" for all of
// them and buildBodyHtml()'s output is byte-for-byte unchanged. Only
// present when the world's ruleset is 5e (attached at creation time by
// lib/campaignEntryGenerators.js's createNewNpc / routes/generate.js --
// a lightweight default so an un-stat'd NPC is never a hard dead-end in
// combat -- or replaced by a real generated stat block via the
// "Combatant" upgrade, routes/npcCombatant.js, which reuses the exact
// same Homebrew pipeline Bestiary uses rather than forking it).
// Generic NPCs tag their combatProfile with `ruleset: 'generic'` (see
// lib/rulesets/generic/npcCombatDefaults.js) so this can pick the right
// embedded renderer -- every 5e combatProfile predates that field (both
// the original default template and every Combatant-upgraded profile
// generated before this dispatch existed), so the absence of a
// `ruleset` field defaults to 5e's renderer rather than requiring a
// migration to backfill it onto already-saved NPCs.
const COMBAT_PROFILE_RENDERERS = {
  generic: "./rulesets/generic/enemyTemplate"
  // No "5e" entry -- it's the fallback default below, since every
  // profile saved before the `ruleset` field existed is 5e-shaped.
};
function combatProfileBlock(npc) {
  if (!npc.combatProfile) return "";
  const label = npc.combatProfile.isDefaultProfile ? "Combat Profile (default -- not yet a bespoke Combatant)" : "Combat Profile";
  const modulePath = COMBAT_PROFILE_RENDERERS[npc.combatProfile.ruleset] || "./rulesets/5e/enemyTemplate";
  const { buildEmbeddedCombatProfileHtml } = require(modulePath);
  return `<h2>${label}</h2>${buildEmbeddedCombatProfileHtml(npc.combatProfile)}`;
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

// Session Prep Companion, Phase 3 -- optional birth/appointed/death dates.
// calendarConfig is optional (an NPC generated before Phase 2's calendar
// existed just renders no line here); only present fields render at all,
// so an ordinary living NPC with none of these set shows nothing extra.
function lifeDatesBlock(npc, calendarConfig) {
  const { formatWorldDate } = require("./calendar");
  const lines = [];
  if (npc.birthDate) lines.push(`<strong>Born:</strong> ${escapeHtml(formatWorldDate(npc.birthDate, calendarConfig))}`);
  if (npc.appointedDate) lines.push(`<strong>Appointed:</strong> ${escapeHtml(formatWorldDate(npc.appointedDate, calendarConfig))}`);
  if (npc.deathDate) lines.push(`<strong>Died:</strong> ${escapeHtml(formatWorldDate(npc.deathDate, calendarConfig))}`);
  return lines.length ? `<p class="flavor">${lines.join(" &nbsp;|&nbsp; ")}</p>\n` : "";
}

// Builds bodyHtml from structured NpcContent JSON, matching the exact
// classes/structure used in adaeze-okonkwo.js. This is the single source
// of truth for archive HTML — the model never generates raw HTML.
// calendarConfig is optional (Session Prep Companion, Phase 3) -- see
// lifeDatesBlock() above.
function buildBodyHtml(npc, imageUrl, calendarConfig) {
  const name = escapeHtml(npc.name);
  const factionId = FACTION_CATEGORY_ID[npc.faction];

  const portraitBlock = `<img class="portrait-img" id="portrait-img-${npc.id}" data-category="npcs" data-entry-id="${npc.id}" data-label="Character portrait" src="${imageUrl || `images/${npc.id}.png`}" alt="${name}" onerror="handlePortraitError(this)">`;

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
${lifeDatesBlock(npc, calendarConfig)}<h2>Personality</h2>
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
${questHookBlock}${combatProfileBlock(npc)}<h2>Design Notes</h2>
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
      `Source: generated via Chronicled`
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
