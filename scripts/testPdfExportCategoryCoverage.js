// scripts/testPdfExportCategoryCoverage.js
//
// Regression test for two related gaps in the PDF export pipeline, both
// the same root cause: a category gets added to routes/entries.js's
// VALID_CATEGORIES set (the read-path source of truth for what
// categories exist), but the export pipeline -- which duplicates that
// list rather than importing it (see routes/entries.js's own comment on
// why) -- never gets the matching update.
//
//   1. routes/export.js's own VALID_CATEGORIES set was missing
//      "session-packets" entirely. Every dossier page wires its
//      "Download PDF" button generically off entry.category (see
//      archive/js/render.js's wireEntryExportButton/
//      wireCategoryExportButton) -- so a Session Packet's dossier page,
//      or the Session Packets tab's own export button, 400'd with
//      "Unknown category 'session-packets'" on every click since the
//      Session Prep Companion shipped it as a real browsable category.
//   2. lib/pdfExport.js's CATEGORY_ORDER (what the "Download Whole
//      World" export actually iterates) never got "spells" or
//      "session-packets" added when those categories were introduced --
//      silently dropping both from the whole-world export even though
//      buildExportHtml()'s actual entry-rendering is fully generic per
//      category (only factions/locations get category-specific extra
//      image handling, gated by an `if`, not a fixed list).
//
// Uses the shared fakeSupabase (no real Supabase project needed) and
// stubs lib/pdfExport.js's renderPdfBuffer (real Chromium/Puppeteer
// launch, not needed to prove the routing/category-coverage fix) the
// same way scripts/testPipeline.js stubs global.fetch for the Anthropic
// call -- patching the shared module.exports object before
// routes/export.js requires (and destructures) it.
//
// Run with: node scripts/testPdfExportCategoryCoverage.js

require("./lib/fakeSupabase").install();

const pdfExportLib = require("../lib/pdfExport");
// Real render would launch headless Chromium -- irrelevant to what this
// test checks (category routing + whole-world coverage), so it's
// replaced with a cheap stand-in. Patching the exported property (not
// reassigning the whole module) is what lets routes/export.js's
// destructured `renderPdfBuffer` reference pick up the stub, since it's
// required afterward but reads off the same module.exports object.
pdfExportLib.renderPdfBuffer = async (html) => Buffer.from(`FAKE-PDF(${html.length} bytes of source html)`);

const express = require("express");
const { upsertEntry } = require("../lib/entriesRepo");
const exportRoute = require("../routes/export");

const WORLD_ID = "test-world";
const PORT = 4517;
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== PDF export category coverage test ==\n");

  await upsertEntry(WORLD_ID, "session-packets", {
    id: "packet-1", name: "The Mill Job Packet", subtitle: null, faction: null,
    tags: [], bodyHtml: "<p>Prep notes for the Mill Job.</p>", raw: {}
  });
  await upsertEntry(WORLD_ID, "spells", {
    id: "fireball", name: "Fireball", subtitle: null, faction: null,
    tags: [], bodyHtml: "<p>A bright streak flashes...</p>", raw: {}
  });
  await upsertEntry(WORLD_ID, "npcs", {
    id: "vess-okoro", name: "Vess Okoro", subtitle: null, faction: null,
    tags: [], bodyHtml: "<p>An informant.</p>", raw: {}
  });

  const app = express();
  app.use((req, res, next) => { req.worldId = WORLD_ID; next(); });
  app.use("/api", exportRoute);
  const server = app.listen(PORT);

  try {
    console.log("-- Test 1: per-entry export for session-packets (dossier 'Download PDF' button) --");
    const entryRes = await fetch(`http://localhost:${PORT}/api/export/entry/session-packets/packet-1`);
    check("does not 400 with 'Unknown category'", entryRes.status !== 400);
    check("succeeds (200)", entryRes.status === 200);

    console.log("\n-- Test 2: per-category export for session-packets (category tab 'Download PDF' button) --");
    const categoryRes = await fetch(`http://localhost:${PORT}/api/export/category/session-packets`);
    check("does not 400 with 'Unknown category'", categoryRes.status !== 400);
    check("succeeds (200)", categoryRes.status === 200);

    console.log("\n-- Test 3: whole-world export includes both previously-dropped categories --");
    const built = await pdfExportLib.buildExportHtml(WORLD_ID, "world", {}, true);
    check("CATEGORY_ORDER includes session-packets", pdfExportLib.CATEGORY_ORDER.includes("session-packets"));
    check("CATEGORY_ORDER includes spells", pdfExportLib.CATEGORY_ORDER.includes("spells"));
    check("world export HTML includes the Session Packet entry", built.html.includes("The Mill Job Packet"));
    check("world export HTML includes a real 'Session Packets' heading, not the raw category key", built.html.includes(">Session Packets<") && !built.html.includes(">session-packets<"));
    check("world export HTML includes the Spell entry", built.html.includes("Fireball"));
    check("world export HTML includes a real 'Spells' heading", built.html.includes(">Spells<"));
    check("world export HTML still includes an untouched pre-existing category (NPCs)", built.html.includes("Vess Okoro"));
  } finally {
    server.close();
  }

  console.log("");
  if (failures.length === 0) {
    console.log("ALL PASS");
  } else {
    console.log(`${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exitCode = 1;
});
