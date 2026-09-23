// scripts/testRelationshipGraph.js
//
// Regression test for lib/relationshipGraph.js (see its own header and
// session_addendum_relationship_graph_shipped.md) -- the one-hop
// relationship-graph builder behind GET /api/entries/:category/:id/graph.
// Runs offline against the same in-memory Supabase fake
// scripts/testPipeline.js/testEntryLinker.js already share
// (scripts/lib/fakeSupabase.js), no real credentials needed.
//
// Run with: node scripts/testRelationshipGraph.js

const { install, db } = require("./lib/fakeSupabase");
install();

const { buildEntryGraph } = require("../lib/relationshipGraph");

const WORLD = "world-graphtest";

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail !== undefined ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function resetDb(ruleset) {
  db.entries.length = 0;
  db.world_config.length = 0;
  db.world_config.push({ world_id: WORLD, ruleset, draft_json: {} });
}

// Matches testEntryLinker.js's seedEntry exactly -- raw_json wraps
// content under `.raw`, per entryLinkRegistry.js's header comment.
function seedEntry(category, { id, name, raw, locked = false }) {
  db.entries.push({
    world_id: WORLD,
    category,
    entry_id: id,
    name,
    subtitle: null,
    faction: null,
    tags_json: [],
    body_html: locked ? null : "<p>seed</p>",
    raw_json: { id, name, category, raw },
    locked
  });
}

function findEdge(graph, fromKey, toKey) {
  return graph.edges.find((e) => e.from === fromKey && e.to === toKey);
}

async function testMissingEntry() {
  console.log("\nbuildEntryGraph -- missing entry:");
  resetDb("5e");
  const graph = await buildEntryGraph(WORLD, "npcs", "nobody");
  check("returns null rather than throwing", graph === null);
}

async function testForwardIdPointerArrayDynamicTarget() {
  console.log("\nbuildEntryGraph -- npc.relationships forward edge (ID_POINTER_ARRAY, dynamic target, item.type as label):");
  resetDb("5e");
  seedEntry("factions", { id: "the-board", name: "The Board", raw: { id: "the-board", name: "The Board" } });
  seedEntry("npcs", {
    id: "captain-rook",
    name: "Captain Rook",
    raw: { id: "captain-rook", name: "Captain Rook", relationships: [{ toId: "the-board", toLabel: "The Board", toCategory: "factions", type: "Faction allegiance" }] }
  });

  const graph = await buildEntryGraph(WORLD, "npcs", "captain-rook");
  const centerKey = "npcs:captain-rook";
  const targetKey = "factions:the-board";

  check("center node present and marked", graph.nodes.find((n) => n.category === "npcs" && n.id === "captain-rook" && n.isCenter));
  check("target node resolved with its real name", graph.nodes.find((n) => n.category === "factions" && n.id === "the-board" && n.name === "The Board"));
  const edge = findEdge(graph, centerKey, targetKey);
  check("edge uses the relationship's own type as its label", edge && edge.label === "Faction allegiance", JSON.stringify(edge));
}

async function testForwardIdPointer() {
  console.log("\nbuildEntryGraph -- log.locationId forward edge (ID_POINTER, default label):");
  resetDb("5e");
  seedEntry("locations", { id: "east-platform", name: "East Platform", raw: { id: "east-platform", name: "East Platform" } });
  seedEntry("logs", { id: "log-1", name: "Recovered Transcript", raw: { id: "log-1", name: "Recovered Transcript", locationId: "east-platform", locationContext: "East Platform" } });

  const graph = await buildEntryGraph(WORLD, "logs", "log-1");
  const edge = findEdge(graph, "logs:log-1", "locations:east-platform");
  check("edge exists with the registered default label", edge && edge.label === "recorded at", JSON.stringify(edge));
}

async function testForwardSkipsDanglingId() {
  console.log("\nbuildEntryGraph -- a resolved id whose target no longer exists is skipped, not thrown:");
  resetDb("5e");
  seedEntry("npcs", {
    id: "captain-rook",
    name: "Captain Rook",
    raw: { id: "captain-rook", name: "Captain Rook", relationships: [{ toId: "deleted-faction", toLabel: "Gone", toCategory: "factions", type: "Faction allegiance" }] }
  });

  const graph = await buildEntryGraph(WORLD, "npcs", "captain-rook");
  check("no node created for the dangling target", !graph.nodes.find((n) => n.id === "deleted-faction"));
  check("no edge created for the dangling target", graph.edges.length === 0, JSON.stringify(graph.edges));
}

async function testBackwardIdPointer() {
  console.log("\nbuildEntryGraph -- backward edge: another entry's own link field resolves to this one:");
  resetDb("5e");
  seedEntry("locations", { id: "east-platform", name: "East Platform", raw: { id: "east-platform", name: "East Platform" } });
  seedEntry("logs", { id: "log-1", name: "Recovered Transcript", raw: { id: "log-1", name: "Recovered Transcript", locationId: "east-platform", locationContext: "East Platform" } });

  const graph = await buildEntryGraph(WORLD, "locations", "east-platform");
  const edge = findEdge(graph, "logs:log-1", "locations:east-platform");
  check("log's forward link surfaces as a backward edge on the location's graph", edge && edge.label === "recorded at", JSON.stringify(graph.edges));
}

async function testBackwardExcludesLocked() {
  console.log("\nbuildEntryGraph -- a locked ghost referencing this entry is excluded from the backward scan:");
  resetDb("5e");
  seedEntry("locations", { id: "east-platform", name: "East Platform", raw: { id: "east-platform", name: "East Platform" } });
  seedEntry("logs", {
    id: "ghost-log",
    name: "Ghost Log",
    raw: { id: "ghost-log", name: "Ghost Log", locationId: "east-platform", locationContext: "East Platform" },
    locked: true
  });

  const graph = await buildEntryGraph(WORLD, "locations", "east-platform");
  check("no edge from a locked/ghost row", !findEdge(graph, "logs:ghost-log", "locations:east-platform"), JSON.stringify(graph.edges));
}

async function testFactionSelfReferential() {
  console.log("\nbuildEntryGraph -- faction.relationships (self-referential, stance as label):");
  resetDb("5e");
  seedEntry("factions", { id: "the-board", name: "The Board", raw: { id: "the-board", name: "The Board" } });
  seedEntry("factions", {
    id: "ferro-kings",
    name: "The Ferro-Kings",
    raw: { id: "ferro-kings", name: "The Ferro-Kings", relationships: [{ toId: "the-board", faction: "The Board", stance: "Open war" }] }
  });

  const graph = await buildEntryGraph(WORLD, "factions", "ferro-kings");
  const edge = findEdge(graph, "factions:ferro-kings", "factions:the-board");
  check("stance is used as the edge label", edge && edge.label === "Open war", JSON.stringify(edge));

  // Reverse direction: The Board itself declares no relationships, but
  // Ferro-Kings' own entry still shows up as a backward edge.
  const reverseGraph = await buildEntryGraph(WORLD, "factions", "the-board");
  const reverseEdge = findEdge(reverseGraph, "factions:ferro-kings", "factions:the-board");
  check("the other faction's own relationships[] surfaces as a backward edge", reverseEdge && reverseEdge.label === "Open war", JSON.stringify(reverseGraph.edges));
}

async function testBackwardNoBackfillFieldStillShown() {
  console.log("\nbuildEntryGraph -- generic survivor.classId (noBackfill field) still appears as a backward edge on the class's graph:");
  resetDb("generic");
  seedEntry("classes", { id: "wizard", name: "Wizard", raw: { id: "wizard", name: "Wizard" } });
  seedEntry("survivors", {
    id: "gale",
    name: "Gale",
    raw: { id: "gale", name: "Gale", classId: "wizard", className: "Wizard" }
  });

  const graph = await buildEntryGraph(WORLD, "classes", "wizard");
  const edge = findEdge(graph, "survivors:gale", "classes:wizard");
  check("noBackfill only disables name-matching, not the graph's id-based backward scan", edge && edge.label === "class", JSON.stringify(graph.edges));
}

async function testDeduplicatesRepeatedEdges() {
  console.log("\nbuildEntryGraph -- two array items pointing at the same target with the same label collapse to one edge:");
  resetDb("5e");
  seedEntry("factions", { id: "the-board", name: "The Board", raw: { id: "the-board", name: "The Board" } });
  seedEntry("npcs", {
    id: "captain-rook",
    name: "Captain Rook",
    raw: {
      id: "captain-rook",
      name: "Captain Rook",
      relationships: [
        { toId: "the-board", toLabel: "The Board", toCategory: "factions", type: "Faction allegiance" },
        { toId: "the-board", toLabel: "The Board", toCategory: "factions", type: "Faction allegiance" }
      ]
    }
  });

  const graph = await buildEntryGraph(WORLD, "npcs", "captain-rook");
  const matches = graph.edges.filter((e) => e.from === "npcs:captain-rook" && e.to === "factions:the-board");
  check("exactly one edge, not two", matches.length === 1, matches.length);
}

async function main() {
  await testMissingEntry();
  await testForwardIdPointerArrayDynamicTarget();
  await testForwardIdPointer();
  await testForwardSkipsDanglingId();
  await testBackwardIdPointer();
  await testBackwardExcludesLocked();
  await testFactionSelfReferential();
  await testBackwardNoBackfillFieldStillShown();
  await testDeduplicatesRepeatedEdges();

  console.log(`\n${failures.length === 0 ? "All checks passed." : `${failures.length} check(s) FAILED:`}`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
