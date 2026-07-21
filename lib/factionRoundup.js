const {
  readNpcManifest, readEnemyManifest, readItemManifest,
  readLogManifest, readClassManifest, readClassEntry
} = require("./roster");

const TIER_ORDER = { Boss: 0, Elite: 1, Trash: 2 };

// Scans every category's live manifest for entries tagged to this faction
// and builds { type, id, category, name, note } rows for the Roundup table.
// This is pure aggregation - never invented, per roundup_instructions.md.
function buildFactionRoundup(archiveRoot, factionKey) {
  const rows = [];

  const npcs = readNpcManifest(archiveRoot).filter((m) => !m.locked && m.faction === factionKey);
  for (const m of npcs) {
    rows.push({ type: "NPC", category: "npcs", id: m.id, name: m.name, note: m.roleArchetype || "" });
  }

  const enemies = readEnemyManifest(archiveRoot)
    .filter((m) => !m.locked && m.faction === factionKey)
    .sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9));
  for (const m of enemies) {
    const tier = m.tier || (m.subtitle || "").split("—")[0].trim();
    rows.push({ type: `Enemy — ${tier}`, category: "enemies", id: m.id, name: m.name, note: "" });
  }

  // Items don't carry a faction field in the current schema (they're
  // faction-agnostic found loot) - skip unless that changes later.

  const logs = readLogManifest(archiveRoot).filter((m) => !m.locked && m.faction === factionKey);
  for (const m of logs) {
    rows.push({ type: "Log", category: "logs", id: m.id, name: m.name, note: "" });
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
