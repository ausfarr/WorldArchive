// scripts/testFactionOptionsLockedFilter.js
//
// Regression test for the bug fixed in lib/worldFlavor.js#getFactionOptions:
// it called lib/roster.js#readFactionManifest(worldId) with no options,
// which (unlike every OTHER readXManifest in that file) had no `locked`
// filter to even pass -- so it always returned locked ghost-placeholder
// faction stubs alongside real ones. lib/entryLinker.js#ensureGhostPlaceholder()
// auto-creates one of these (real name, null bodyHtml/faction) any time
// some OTHER generated entry name-references a faction that doesn't exist
// yet in this world -- a routine occurrence, not an edge case. Since
// getFactionOptions() feeds the "pick one of these faction ids" enum into
// nearly every content-generation prompt in the app (NPCs, enemies, items,
// locations, classes, survivors, logs, spells, procedural faction-picking),
// the model could assign a brand-new entry to a faction that's still just
// an empty stub -- directly contradicting getFactionOptions()'s own header
// comment: "a generation call should only ever offer factions a reader
// could actually click through to." Same ghost-leak bug class already
// fixed for PDF export (see scripts/testPdfExportLockedFilter.js) and
// every other lib/roster.js roster-context builder; this was the one
// place it was still missing, since readFactionManifest() never took a
// `locked` option at all before this fix.
//
// Also verifies the fix didn't break the callers that legitimately NEED
// ghosts visible on the faction manifest (filling an existing ghost via
// lib/factionDeepLore.js#generateFactionDeepLore, and id-dedup) -- those
// call readFactionManifest(worldId) with no opts, which still defaults to
// unfiltered.
//
// Standalone per repo convention (CLAUDE.md's scripts/ note) -- run
// directly with `node scripts/testFactionOptionsLockedFilter.js`. Uses the
// same in-memory fakeSupabase scripts/testPipeline.js shares, so no real
// Supabase/Anthropic credentials are needed.

const { install, db } = require("./lib/fakeSupabase");
install();

const { getFactionOptions } = require("../lib/worldFlavor");
const { readFactionManifest } = require("../lib/roster");

const WORLD_ID = "11111111-1111-1111-1111-111111111111";

function seedFaction({ id, name, locked }) {
  const now = new Date().toISOString();
  db.entries.push({
    world_id: WORLD_ID,
    category: "factions",
    entry_id: id,
    name,
    subtitle: null,
    faction: locked ? null : id,
    tags_json: [],
    body_html: locked ? null : "<p>Full faction writeup.</p>",
    raw_json: locked ? null : { id, category: "factions", name },
    locked: !!locked,
    created_at: now,
    updated_at: now
  });
}

async function main() {
  let failures = 0;

  seedFaction({ id: "the-ashwood-cartel", name: "The Ashwood Cartel", locked: false });
  seedFaction({ id: "the-verdant-choir", name: "The Verdant Choir", locked: true }); // ghost, referenced but never generated

  // Test 1: getFactionOptions() -- the generation-facing enum -- excludes the ghost.
  const options = await getFactionOptions(WORLD_ID);
  const hasReal = options.some((f) => f.name === "The Ashwood Cartel");
  const hasGhost = options.some((f) => f.name === "The Verdant Choir");
  console.log(`getFactionOptions includes real faction: ${hasReal}`);
  console.log(`getFactionOptions excludes locked ghost faction: ${!hasGhost}`);
  if (!hasReal || hasGhost) failures++;

  // Test 2: readFactionManifest(worldId) with no opts stays unfiltered --
  // callers that need to find/fill a ghost (factionDeepLore.js) or dedupe
  // ids against it (proceduralGenerators.js#uniqueId) must still see it.
  const fullManifest = await readFactionManifest(WORLD_ID);
  const unfilteredHasGhost = fullManifest.some((m) => m.name === "The Verdant Choir");
  console.log(`readFactionManifest(worldId) with no opts still includes the ghost: ${unfilteredHasGhost}`);
  if (!unfilteredHasGhost) failures++;

  // Test 3: readFactionManifest(worldId, { locked: false }) explicitly excludes it.
  const filteredManifest = await readFactionManifest(WORLD_ID, { locked: false });
  const filteredHasGhost = filteredManifest.some((m) => m.name === "The Verdant Choir");
  console.log(`readFactionManifest(worldId, { locked: false }) excludes the ghost: ${!filteredHasGhost}`);
  if (filteredHasGhost) failures++;

  if (failures > 0) {
    console.error(`\nFAILED: ${failures} check(s) did not pass.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error("Test threw:", err);
  process.exit(1);
});
