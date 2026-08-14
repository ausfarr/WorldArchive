// scripts/backfillEntryLinks.js
//
// Phase 4 of entry cross-linking (see phase0_entry_linking_audit.md and
// CHANGELOG.md's entry for this feature): a one-off, zero-AI-call sweep
// that runs lib/entryLinker.js's resolveReferencesForEntry() forward
// across every existing entry in every existing world, exactly once.
// Fixes the gap the whole feature exists to close -- entries saved
// BEFORE the resolver existed never got a chance to pick up a reference
// that's resolvable NOW, and never will unless something revisits them.
// This is that one-time revisit. Same "run once against real data"
// ingestion-script pattern as scripts/ingestSrd5e.js /
// scripts/ingestSrd5eFull.js.
//
// Deliberately forward-only: it does NOT run backfillReferencesFromNewEntry
// (backward resolution) for each entry, because that would mean an
// O(entries^2) sweep re-scanning the whole world for every single row
// visited -- pointless here, since backward resolution's entire job is
// "did some entry that already exists now match ME" and every entry in
// the world is already being visited by this same forward sweep anyway.
// A single forward pass over every entry converges to the same fixed
// point backward resolution would have reached, for a fraction of the
// writes. ensureGhostPlaceholder() still runs per unresolved Category A
// name, same as every other caller.
//
// Idempotent and safe to re-run: an entry only gets re-saved (re-baked)
// if resolveReferencesForEntry() actually changed something (deep-equal
// check against the original raw); ensureGhostPlaceholder() is itself
// idempotent (create-if-missing, confirmed in Phase 0/1).
//
// Usage:
//   node scripts/backfillEntryLinks.js            # apply for real
//   node scripts/backfillEntryLinks.js --dry-run   # report only, no writes
//
// Requires SUPABASE_URL / SUPABASE_SECRET_KEY env vars, same as the server.

const { supabase } = require("../lib/supabaseClient");
const { listEntries } = require("../lib/entriesRepo");
const { getRuleset } = require("../lib/worldConfigRepo");
const { resolveReferencesForEntry, ensureGhostPlaceholder, getRebakeFn, ALL_CATEGORIES } = require("../lib/entryLinker");

async function listAllWorldIds() {
  const { data, error } = await supabase.from("worlds").select("id");
  if (error) throw new Error(`listAllWorldIds failed: ${error.message}`);
  return (data || []).map((r) => r.id);
}

// Runs the forward sweep for one world. Returns a stats object; never
// throws for a single bad entry (logs and keeps going -- one malformed
// row from before this feature existed shouldn't abort the whole run).
async function backfillWorld(worldId, { dryRun = false, log = console.log } = {}) {
  const ruleset = await getRuleset(worldId);
  const stats = { worldId, ruleset, entriesChecked: 0, entriesPatched: 0, ghostsCreated: 0, ghostsAlreadyExisted: 0, errors: 0 };

  for (const category of ALL_CATEGORIES) {
    let rows;
    try {
      rows = await listEntries(worldId, category, { locked: false });
    } catch (err) {
      log(`  [${worldId}/${category}] listEntries failed, skipping category: ${err.message}`);
      stats.errors++;
      continue;
    }

    for (const row of rows) {
      stats.entriesChecked++;
      if (!row.raw) continue; // pre-DB-migration entry with no raw content to resolve against

      try {
        const before = JSON.stringify(row.raw);
        const { raw: resolved, unresolvedGhosts } = await resolveReferencesForEntry(worldId, category, row.raw);
        const changed = JSON.stringify(resolved) !== before;

        if (changed) {
          if (dryRun) {
            log(`  [DRY RUN] would patch ${category}/${row.id} ("${row.name}")`);
          } else {
            const rebake = getRebakeFn(ruleset, category);
            if (rebake) {
              await rebake(worldId, resolved);
              stats.entriesPatched++;
            } else {
              log(`  [${worldId}/${category}/${row.id}] resolved but no rebake function for ruleset '${ruleset}' -- skipped`);
            }
          }
        }

        for (const ghost of unresolvedGhosts) {
          if (dryRun) {
            log(`  [DRY RUN] would ensure ghost: ${ghost.category}/"${ghost.name}"`);
            continue;
          }
          const before = await getGhostExists(worldId, ghost.category, ghost.name);
          await ensureGhostPlaceholder(worldId, ghost.category, ghost.name);
          if (before) stats.ghostsAlreadyExisted++;
          else stats.ghostsCreated++;
        }
      } catch (err) {
        log(`  [${worldId}/${category}/${row.id}] resolve/patch failed, skipping this entry: ${err.message}`);
        stats.errors++;
      }
    }
  }

  return stats;
}

// Slugify matches lib/entryLinker.js's own local copy exactly (every
// *Template.js already duplicates this same function -- see that file's
// header comment) -- used here only to check ghost-existence BEFORE
// calling ensureGhostPlaceholder, purely for the created-vs-already-
// existed count in the summary below. Not load-bearing: ensureGhostPlaceholder
// is idempotent on its own regardless of whether this check runs.
function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}
async function getGhostExists(worldId, category, name) {
  const { getEntry } = require("../lib/entriesRepo");
  const existing = await getEntry(worldId, category, slugify(name));
  return !!existing;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Entry-linking backfill starting${dryRun ? " (DRY RUN -- no writes)" : ""}...`);

  const worldIds = await listAllWorldIds();
  console.log(`Found ${worldIds.length} world(s).`);

  const totals = { entriesChecked: 0, entriesPatched: 0, ghostsCreated: 0, ghostsAlreadyExisted: 0, errors: 0 };
  for (const worldId of worldIds) {
    console.log(`\nWorld ${worldId}:`);
    const stats = await backfillWorld(worldId, { dryRun });
    console.log(`  ruleset=${stats.ruleset} checked=${stats.entriesChecked} patched=${stats.entriesPatched} ghostsCreated=${stats.ghostsCreated} ghostsAlreadyExisted=${stats.ghostsAlreadyExisted} errors=${stats.errors}`);
    for (const key of Object.keys(totals)) totals[key] += stats[key] || 0;
  }

  console.log("\n=== Summary ===");
  console.log(totals);
  console.log(dryRun ? "\nDry run complete -- no data was written." : "\nBackfill complete.");
}

module.exports = { backfillWorld, listAllWorldIds };

if (require.main === module) {
  main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
}
