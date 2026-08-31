// scripts/testPdfExportLockedFilter.js
//
// Regression test for the bug fixed in lib/pdfExport.js: buildExportHtml()'s
// "category" and "world" scope branches called listEntries(worldId, category)
// with no options, which returns EVERY row including locked ghost-placeholder
// stubs (lib/entryLinker.js's ensureGhostPlaceholder() auto-creates these --
// real name, null bodyHtml/subtitle -- for any name reference to an entry
// that hasn't been generated yet). Every other reader of the entries table
// (lib/roster.js's context builders, lib/factionRoundup.js, the category grid
// page's client-side filter) excludes locked rows; the PDF export was the one
// place that didn't, producing a near-blank sheet for content the user never
// actually generated.
//
// Standalone per repo convention (CLAUDE.md's scripts/ note) -- run directly
// with `node scripts/testPdfExportLockedFilter.js`. Uses the same in-memory
// fakeSupabase scripts/testPipeline.js and scripts/testEnemyPipeline.js share,
// so no real Supabase/Anthropic credentials are needed. includeImages: false
// keeps this from touching Storage (faction banner lookups), which the fake
// doesn't model -- irrelevant to the bug under test.

const { install, db } = require("./lib/fakeSupabase");
install();

const { buildExportHtml } = require("../lib/pdfExport");

const WORLD_ID = "11111111-1111-1111-1111-111111111111";

function seedEntry({ id, name, subtitle, bodyHtml, locked }) {
  const now = new Date().toISOString();
  db.entries.push({
    world_id: WORLD_ID,
    category: "items",
    entry_id: id,
    name,
    subtitle: subtitle || null,
    faction: null,
    tags_json: [],
    body_html: bodyHtml || null,
    raw_json: { id, category: "items", name, subtitle, bodyHtml, footer: [] },
    locked: !!locked,
    created_at: now,
    updated_at: now
  });
}

async function main() {
  let failures = 0;

  seedEntry({
    id: "real-item",
    name: "Real Item",
    subtitle: "An actually-generated item",
    bodyHtml: "<p>Full stat block here.</p>",
    locked: false
  });
  seedEntry({
    id: "ghost-item",
    name: "Referenced-But-Ungenerated Item",
    subtitle: null,
    bodyHtml: null,
    locked: true
  });

  // Test 1: category-scope export excludes the locked ghost placeholder.
  const categoryResult = await buildExportHtml(WORLD_ID, "category", { category: "items" }, false);
  const categoryHasReal = categoryResult.html.includes("Real Item");
  const categoryHasGhost = categoryResult.html.includes("Referenced-But-Ungenerated Item");
  console.log(`Category export includes real entry: ${categoryHasReal}`);
  console.log(`Category export excludes locked ghost entry: ${!categoryHasGhost}`);
  if (!categoryHasReal || categoryHasGhost) failures++;

  // Test 2: world-scope export (loops every category) also excludes it.
  const worldResult = await buildExportHtml(WORLD_ID, "world", {}, false);
  const worldHasReal = worldResult.html.includes("Real Item");
  const worldHasGhost = worldResult.html.includes("Referenced-But-Ungenerated Item");
  console.log(`World export includes real entry: ${worldHasReal}`);
  console.log(`World export excludes locked ghost entry: ${!worldHasGhost}`);
  if (!worldHasReal || worldHasGhost) failures++;

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
