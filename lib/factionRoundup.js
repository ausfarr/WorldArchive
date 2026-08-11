const {
  readNpcManifest, readEnemyManifest, readLogManifest, readSurvivorManifest, readLocationManifest
} = require("./roster");

const TIER_ORDER = { Boss: 0, Elite: 1, Trash: 2 };

// Scans every category's live archive for entries tagged to this faction
// and builds { type, id, category, name, note } rows for the Roundup
// table. This is pure aggregation — never invented, per
// roundup_instructions.md. Now async + worldId-scoped (was sync +
// archiveRoot-scoped).
//
// { locked: false } pushes the "not a still-unfilled placeholder" filter
// into the query itself (see entriesRepo.js's listEntries) instead of
// transferring locked rows just to discard them client-side -- same
// pattern lib/roster.js's context builders use. The per-faction scan
// across the rest of the category still isn't capped the way
// lib/roster.js's prompt-context builders are (MAX_FULL_ROSTER_LINES) --
// deliberately left uncapped here, since unlike a prompt-context summary,
// this Roundup table is real, complete, user-visible archive content
// ("Everything Archived for This Faction"); silently truncating what it
// shows would be a product behavior change, not a transparent perf fix.
// Revisit if a world's per-faction entry count grows large enough for
// this to actually matter.
async function buildFactionRoundup(worldId, factionKey) {
  const rows = [];

  const npcs = (await readNpcManifest(worldId, { locked: false })).filter((m) => m.faction === factionKey);
  for (const m of npcs) {
    rows.push({ type: "NPC", category: "npcs", id: m.id, name: m.name, note: m.roleArchetype || "" });
  }

  const enemies = (await readEnemyManifest(worldId, { locked: false }))
    .filter((m) => m.faction === factionKey)
    .sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9));
  for (const m of enemies) {
    const tier = m.tier || (m.subtitle || "").split("—")[0].trim();
    rows.push({ type: `Enemy — ${tier}`, category: "enemies", id: m.id, name: m.name, note: "" });
  }

  // Items don't carry a faction field in the current schema (they're
  // faction-agnostic found loot) - skip unless that changes later.

  const logs = (await readLogManifest(worldId, { locked: false })).filter((m) => m.faction === factionKey);
  for (const m of logs) {
    rows.push({ type: "Log", category: "logs", id: m.id, name: m.name, note: "" });
  }

  const survivors = (await readSurvivorManifest(worldId, { locked: false })).filter((m) => m.faction === factionKey);
  for (const m of survivors) {
    const className = (m.subtitle || "").replace(/^The /, "").split("—")[0].trim();
    rows.push({ type: "Survivor", category: "survivors", id: m.id, name: m.name, note: className });
  }

  const locations = (await readLocationManifest(worldId, { locked: false })).filter((m) => m.faction === factionKey);
  for (const m of locations) {
    rows.push({ type: "Location", category: "locations", id: m.id, name: m.name, note: m.regionBiome || "" });
  }

  // Classes don't carry a faction field either (professions aren't
  // faction-exclusive) - skip.

  return rows;
}

function buildRoundupHtml(rows) {
  if (rows.length === 0) {
    return `<h2>Roundup — Everything Archived for This Faction</h2>
<p class="flavor">Nothing archived for this faction yet.</p>`;
  }
  const tableRows = rows
    .map((r) => `<tr><td>${r.type}</td><td><a href="dossier.html?category=${r.category}&id=${r.id}">${r.name}</a></td><td>${r.note || "—"}</td></tr>`)
    .join("\n");
  return `<h2>Roundup — Everything Archived for This Faction</h2>
<table class="rel-table">
<tr><th>Type</th><th>Entry</th><th>Note</th></tr>
${tableRows}
</table>`;
}

module.exports = { buildFactionRoundup, buildRoundupHtml };
