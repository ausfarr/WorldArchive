// scripts/testWizardFactionGraph.js
//
// Bug batch 1, Phase 1 regression test (session_addendum_bug_batch_1.md):
// factions produced by the World Setup Wizard's "Expand Factions" step
// (POST /api/wizard/upgrade-factions) must come out with a correct
// relationship graph IMMEDIATELY -- no edit + re-save through
// /confirm-entry required. Before the fix, routes/wizardReview.js saved
// each faction's Deep Lore straight through saveFactionEntry() and never
// resolved relationships[].toId, never synced reciprocals, never
// backfilled -- so lib/relationshipGraph.js#buildEntryGraph returned no
// faction edges at all until the DM re-saved every faction by hand.
//
// Drives the REAL routes end to end: POST /wizard/save-factions (bridges
// the Step 4 stubs into the entries table, same as the real wizard), then
// POST /wizard/upgrade-factions. Only the Anthropic call is stubbed
// (global.fetch) -- no real/paid AI call is ever made, even though other
// traffic passes straight through.
//
// Two modes:
//   node scripts/testWizardFactionGraph.js          -- in-memory fakeSupabase (default)
//   node scripts/testWizardFactionGraph.js --live   -- real Supabase (needs
//     SUPABASE_URL/SUPABASE_SECRET_KEY); creates a disposable throwaway
//     user + world and deletes both (and every row it wrote) in a finally
//     block, same pattern as scripts/testTenantIsolation.js. Never touches
//     any other user's rows.

const LIVE = process.argv.includes("--live");
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key-not-real";

// Deep Lore fixture per faction, picked by the "FACTION NAME:" line
// prompts/factionContentPrompt.js puts in the system prompt -- the three
// generations run concurrently, so the stub has to be stateless.
//   Iron Pact    -> names Veiled Choir AND Ashen Hand
//   Veiled Choir -> names Iron Pact back (reciprocal already present)
//   Ashen Hand   -> names nobody (must RECEIVE a reciprocal from Iron Pact)
const RELATIONSHIPS = {
  "The Iron Pact": [
    { faction: "The Veiled Choir", stance: "Rivals", why: "Both want the river toll." },
    { faction: "The Ashen Hand", stance: "Allies", why: "Old war debt." }
  ],
  "The Veiled Choir": [
    { faction: "The Iron Pact", stance: "Rivals", why: "The Pact taxes their pilgrims." }
  ],
  "The Ashen Hand": []
};

function deepLoreFor(name) {
  return {
    nickname: `${name} nickname`,
    overviewQuote: "A quote.",
    origin: "An origin.",
    corePhilosophy: "A philosophy.",
    structureHierarchy: "A hierarchy.",
    territory: "Some territory. More.",
    goalsNearTerm: "Near goals.",
    goalsLongTerm: "Long goals.",
    internalTensions: "Tensions.",
    iconography: "Icons.",
    relationships: RELATIONSHIPS[name],
    economyResources: "Economy.",
    joining: "Joining.",
    foundingDate: null
  };
}

const originalFetch = global.fetch;
let aiCalls = 0;
global.fetch = async (url, opts) => {
  if (String(url).includes("anthropic.com")) {
    aiCalls++;
    const body = JSON.parse(opts.body);
    const system = Array.isArray(body.system) ? body.system.map((b) => b.text).join("\n") : body.system;
    const match = /FACTION NAME: (.+)/.exec(system);
    const name = match && match[1].trim();
    if (!RELATIONSHIPS[name]) throw new Error(`Unexpected Anthropic call (faction '${name}')`);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify(deepLoreFor(name)) }],
        usage: { input_tokens: 1, output_tokens: 1 },
        stop_reason: "end_turn"
      })
    };
  }
  return originalFetch(url, opts);
};

if (!LIVE) require("./lib/fakeSupabase").install();

const express = require("express");
const { supabase } = require("../lib/supabaseClient");
const { getEntry, listEntries } = require("../lib/entriesRepo");
const { buildEntryGraph } = require("../lib/relationshipGraph");

const failures = [];
function check(label, condition) {
  console.log(`  ${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) failures.push(label);
}

async function setupWorld() {
  if (!LIVE) return { userId: "test-user-wizard-graph", worldId: "22222222-2222-2222-2222-222222222222" };
  const { getOrCreateWorldId } = require("../middleware/resolveTenant");
  const email = `wizard-graph-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@worldforge.test`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password: "throwaway-test-password-1", email_confirm: true });
  if (error) throw new Error(`Failed to create test user: ${error.message}`);
  const userId = data.user.id;
  const worldId = await getOrCreateWorldId(userId);
  return { userId, worldId };
}

async function cleanup(userId, worldId) {
  if (!LIVE) return;
  // Only ever this test's own disposable user/world, by exact id.
  if (worldId) {
    await supabase.from("entries").delete().eq("world_id", worldId);
    await supabase.from("lore_sections").delete().eq("world_id", worldId);
    await supabase.from("world_config").delete().eq("world_id", worldId);
    await supabase.from("worlds").delete().eq("id", worldId);
  }
  if (userId) {
    await supabase.from("user_settings").delete().eq("user_id", userId);
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) console.warn(`  Warning: failed to delete test user ${userId}: ${error.message}`);
  }
}

async function post(port, path, body) {
  const res = await originalFetch(`http://127.0.0.1:${port}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log(`== Wizard faction graph test (${LIVE ? "LIVE Supabase" : "fakeSupabase"}) ==\n`);
  let userId, worldId, server;
  try {
    ({ userId, worldId } = await setupWorld());

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.userId = userId; req.worldId = worldId; next(); });
    app.use("/api", require("../routes/wizardFactions"));
    app.use("/api", require("../routes/wizardReview"));
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const port = server.address().port;

    const saved = await post(port, "/wizard/save-factions", {
      factions: Object.keys(RELATIONSHIPS).map((name) => ({ name, concept: `${name} concept` }))
    });
    check("save-factions bridged the 3 Step 4 stubs", saved.status === 200 && (await listEntries(worldId, "factions")).length === 3);

    const upgraded = await post(port, "/wizard/upgrade-factions");
    check("upgrade-factions upgraded all 3 with no generation or linking failures",
      upgraded.status === 200 && upgraded.body.upgraded.length === 3 && upgraded.body.failed.length === 0 && (upgraded.body.linkFailed || []).length === 0);
    check("exactly one (stubbed) AI call per faction", aiCalls === 3);

    const ids = { pact: "the-iron-pact", choir: "the-veiled-choir", hand: "the-ashen-hand" };
    const rows = {};
    for (const [k, id] of Object.entries(ids)) rows[k] = await getEntry(worldId, "factions", id);

    // Every relationship row on every faction resolved to a real id.
    const allRels = Object.values(rows).flatMap((r) => (r.raw.relationships || []));
    check("every relationships[] item has a resolved toId", allRels.length > 0 && allRels.every((rel) => !!rel.toId));

    // Reciprocal added where missing, never duplicated where present.
    const handRels = rows.hand.raw.relationships || [];
    const choirRels = rows.choir.raw.relationships || [];
    check("Ashen Hand received a reciprocal relationship to Iron Pact", handRels.filter((r) => r.faction === "The Iron Pact").length === 1);
    check("that reciprocal points at Iron Pact's real id", (handRels.find((r) => r.faction === "The Iron Pact") || {}).toId === ids.pact);
    check("Veiled Choir's existing Iron Pact relationship was not duplicated", choirRels.filter((r) => r.faction === "The Iron Pact").length === 1);
    check("Iron Pact's own relationships were not duplicated", (rows.pact.raw.relationships || []).length === 2);

    // The graph -- what the dossier actually renders.
    const pactGraph = await buildEntryGraph(worldId, "factions", ids.pact);
    const pactKey = `factions:${ids.pact}`;
    const outTo = (graph, fromKey) => new Set(graph.edges.filter((e) => e.from === fromKey).map((e) => e.to));
    const pactOut = outTo(pactGraph, pactKey);
    check("Iron Pact graph has an edge to Veiled Choir", pactOut.has(`factions:${ids.choir}`));
    check("Iron Pact graph has an edge to Ashen Hand", pactOut.has(`factions:${ids.hand}`));

    const handGraph = await buildEntryGraph(worldId, "factions", ids.hand);
    check("Ashen Hand graph has its reciprocal edge to Iron Pact", outTo(handGraph, `factions:${ids.hand}`).has(pactKey));

    const choirGraph = await buildEntryGraph(worldId, "factions", ids.choir);
    const choirToPact = choirGraph.edges.filter((e) => e.from === `factions:${ids.choir}` && e.to === pactKey);
    check("Veiled Choir graph has exactly one outgoing edge to Iron Pact", choirToPact.length === 1);

    // Linking must not have corrupted the Roundup matching key.
    check("faction matching keys preserved", Object.entries(ids).every(([k, id]) => rows[k].faction === id));
    console.log("");
  } finally {
    if (server) server.close();
    await cleanup(userId, worldId);
  }

  if (failures.length) {
    console.log(`RESULT: ${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("RESULT: all checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test threw:", err);
  process.exit(1);
});
