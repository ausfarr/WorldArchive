// scripts/testEntryLinker.js
//
// Regression test for lib/entryLinker.js (see phase0_entry_linking_audit.md
// and session_addendum_entry_cross_linking_shipped.md) -- the deterministic
// forward/backward resolver that fills in cross-category references
// (spell.classes, npc.relationships, faction.relationships, etc.) after an
// entry is saved. Shipped across Phases 0-3 with no regression coverage of
// its own; this closes that gap using the same in-memory Supabase fake
// scripts/testPipeline.js/testEnemyPipeline.js already share
// (scripts/lib/fakeSupabase.js), so it runs offline with no real
// credentials, same as every other scripts/test*.js file.
//
// Deliberately avoids exercising a "classes" rebake: lib/rulesets/index.js's
// classes `repo` slot calls lib/fileWriter.js's getPortraitUrl(), which
// hits supabase.storage -- outside fakeSupabase's query-builder-only
// surface. Spells (getRebakeFn's other flagship example) have no portrait
// per lib/rulesets/5e/spellRepo.js's own comment, so the spell<->class
// scenarios below only ever rebake the spell side, never the class side --
// real coverage of getRebakeFn's dispatch without needing a storage fake.
//
// Run with: node scripts/testEntryLinker.js

const { install, db } = require("./lib/fakeSupabase");
install();

const {
  normalizeNameForMatch,
  resolveReferencesForEntry,
  backfillReferencesFromNewEntry,
  ensureGhostPlaceholder
} = require("../lib/entryLinker");

const WORLD = "world-linktest";

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail !== undefined ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function resetDb() {
  db.entries.length = 0;
  db.world_config.length = 0;
  db.world_config.push({ world_id: WORLD, ruleset: "5e", draft_json: {} });
}

// Seeds a real (non-ghost) entries row directly -- bypassing every
// save*Entry()/upsertEntry() call, matching exactly what a real row looks
// like on disk (raw_json wraps the content under `.raw`, per
// entryLinkRegistry.js's header comment) so entryLinker's own
// listEntries()-based roster lookups see it precisely as production would.
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

function findEntry(category, id) {
  return db.entries.find((r) => r.world_id === WORLD && r.category === category && r.entry_id === id);
}

async function testNormalize() {
  console.log("\nnormalizeNameForMatch:");
  check("lowercases and strips punctuation/whitespace", normalizeNameForMatch("Captain  Rook, the III") === "captainrooktheiii");
  check("null-safe", normalizeNameForMatch(null) === "");
  check("undefined-safe", normalizeNameForMatch(undefined) === "");
}

async function testForwardNameOnlyArray() {
  console.log("\nresolveReferencesForEntry -- 5e spell.classes (Category A, NAME_ONLY_ARRAY):");
  resetDb();
  seedEntry("classes", { id: "wizard", name: "Wizard", raw: { id: "wizard", name: "Wizard" } });

  const { raw, unresolvedGhosts } = await resolveReferencesForEntry(WORLD, "spells", {
    classes: ["Wizard", "Sorcerer"]
  });

  check("archived name resolves to {name,id}", raw.classes[0].name === "Wizard" && raw.classes[0].id === "wizard", JSON.stringify(raw.classes[0]));
  check("unarchived name stays id:null", raw.classes[1].name === "Sorcerer" && raw.classes[1].id === null, JSON.stringify(raw.classes[1]));
  check("unarchived name is reported for ghosting", unresolvedGhosts.length === 1 && unresolvedGhosts[0].name === "Sorcerer" && unresolvedGhosts[0].category === "classes");
}

async function testForwardIdempotent() {
  console.log("\nresolveReferencesForEntry -- already-resolved fields are left alone:");
  resetDb();
  seedEntry("classes", { id: "wizard", name: "Wizard", raw: { id: "wizard", name: "Wizard" } });

  const { raw, unresolvedGhosts } = await resolveReferencesForEntry(WORLD, "spells", {
    classes: [{ name: "Sorcerer", id: "already-set" }]
  });

  check("existing id is never overwritten or re-matched", raw.classes[0].id === "already-set");
  check("no ghost reported for an already-resolved item", unresolvedGhosts.length === 0);
}

async function testForwardIdPointerArrayDynamicTarget() {
  console.log("\nresolveReferencesForEntry -- npc.relationships (Category B, ID_POINTER_ARRAY, dynamic target):");
  resetDb();
  seedEntry("npcs", { id: "captain-rook", name: "Captain Rook", raw: { id: "captain-rook", name: "Captain Rook" } });

  const { raw } = await resolveReferencesForEntry(WORLD, "npcs", {
    relationships: [{ toLabel: "Captain Rook", toCategory: "npcs" }, { toLabel: "Nobody Real", toCategory: "npcs" }]
  });

  check("real target resolves toId", raw.relationships[0].toId === "captain-rook");
  check("label re-synced to the target's current name", raw.relationships[0].toLabel === "Captain Rook");
  check("no match leaves toId unset (never invents a link)", raw.relationships[1].toId === undefined, JSON.stringify(raw.relationships[1]));
}

async function testForwardFactionSelfReferential() {
  console.log("\nresolveReferencesForEntry -- faction.relationships (self-referential, bare-name label field):");
  resetDb();
  seedEntry("factions", { id: "the-board", name: "The Board", raw: { id: "the-board", name: "The Board" } });

  const { raw } = await resolveReferencesForEntry(WORLD, "factions", {
    relationships: [{ faction: "The Board" }]
  });

  check("faction name resolves against the shared factions roster", raw.relationships[0].toId === "the-board");
}

async function testBackfillPatchesAndRebakes() {
  console.log("\nbackfillReferencesFromNewEntry -- unresolved spell.classes patched + re-baked on real class creation:");
  resetDb();
  seedEntry("spells", {
    id: "scrap-resonance",
    name: "Scrap Resonance",
    raw: { id: "scrap-resonance", name: "Scrap Resonance", level: 1, school: "Evocation", classes: [{ name: "Wizard", id: null }] }
  });

  const { patchedCount, ghostsCleaned } = await backfillReferencesFromNewEntry(WORLD, "classes", { id: "wizard", name: "Wizard" });

  check("exactly one entry patched", patchedCount === 1, patchedCount);
  check("no ghosts to clean (none existed)", ghostsCleaned === 0);

  const row = findEntry("spells", "scrap-resonance");
  check("spell row was re-baked with the resolved id", row.raw_json.raw.classes[0].id === "wizard", JSON.stringify(row.raw_json.raw.classes[0]));
  check("re-bake recomputed body_html (not left null/stale)", typeof row.body_html === "string" && row.body_html.length > 0);
}

async function testBackfillSkipsSelfAndAlreadyResolved() {
  console.log("\nbackfillReferencesFromNewEntry -- self-link and already-resolved rows are skipped:");
  resetDb();
  // Already resolved -- must not be touched or double-counted.
  seedEntry("spells", {
    id: "already-linked",
    name: "Already Linked",
    raw: { id: "already-linked", name: "Already Linked", classes: [{ name: "Wizard", id: "wizard" }] }
  });

  const { patchedCount } = await backfillReferencesFromNewEntry(WORLD, "classes", { id: "wizard", name: "Wizard" });
  check("nothing patched when every reference is already resolved", patchedCount === 0, patchedCount);
}

async function testBackfillCleansStaleGhost() {
  console.log("\nbackfillReferencesFromNewEntry -- stale ghost with a different slug is deleted once the real entry lands:");
  resetDb();
  // A ghost created under a slightly different slug than the real entry
  // will get -- entries_unique_slug only auto-collides on an EXACT slug
  // match, so this is the case that needs the explicit cleanup sweep.
  seedEntry("classes", { id: "wizard-ghost", name: "Wizard", raw: null, locked: true });

  const { ghostsCleaned } = await backfillReferencesFromNewEntry(WORLD, "classes", { id: "wizard", name: "Wizard" });

  check("stale ghost under a different slug is cleaned up", ghostsCleaned === 1, ghostsCleaned);
  check("the ghost row is actually gone", findEntry("classes", "wizard-ghost") === undefined);
}

async function testEnsureGhostPlaceholder() {
  console.log("\nensureGhostPlaceholder -- create-if-missing, idempotent:");
  resetDb();

  const created = await ensureGhostPlaceholder(WORLD, "classes", "Sorcerer");
  check("creates a locked stub with the slugified id", created && created.id === "sorcerer" && created.locked === true, JSON.stringify(created));
  check("exactly one row exists after the first call", db.entries.filter((r) => r.category === "classes").length === 1);

  const again = await ensureGhostPlaceholder(WORLD, "classes", "Sorcerer");
  check("second call returns the existing row rather than duplicating", again && again.id === "sorcerer");
  check("still exactly one row after the second call", db.entries.filter((r) => r.category === "classes").length === 1);
}

async function main() {
  await testNormalize();
  await testForwardNameOnlyArray();
  await testForwardIdempotent();
  await testForwardIdPointerArrayDynamicTarget();
  await testForwardFactionSelfReferential();
  await testBackfillPatchesAndRebakes();
  await testBackfillSkipsSelfAndAlreadyResolved();
  await testBackfillCleansStaleGhost();
  await testEnsureGhostPlaceholder();

  console.log(`\n${failures.length === 0 ? "All checks passed." : `${failures.length} check(s) FAILED:`}`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
