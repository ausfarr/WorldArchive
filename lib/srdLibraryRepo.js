// lib/srdLibraryRepo.js
//
// Read access to srd_library (the shared canonical-content table, see
// migrations/020_ruleset_foundation.sql) plus world_srd_imports
// tracking. Mirrors entriesRepo.js's role for the `entries` table --
// nothing outside this file should query srd_library or
// world_srd_imports directly.
//
// srd_library is NOT tenant-scoped (no world_id column) -- every world
// on a given ruleset reads the same shared rows. world_srd_imports IS
// tenant-scoped and records which of those shared rows a specific world
// has pulled into its own `entries` table, and under which entry_id.

const { supabase } = require("./supabaseClient");

// Default comfortably above every real ingested category's row count
// (monsters: 201 per scripts/ingestSrd5e.js's header; spells: 349,
// items: ~158, classes: 12, feats: 17, magic-items: 260 per
// scripts/ingestSrd5eFull.js) -- 200 silently truncated both Monsters
// (barely) and Spells (badly, dropping ~150 real spells alphabetically
// after the 200th) from every Import/Reflavor picker built against this
// function.
async function listSrdEntries(ruleset, category, { limit = 500 } = {}) {
  const { data, error } = await supabase
    .from("srd_library")
    .select("id, srd_id, name, cr, level, class_name, rarity, source_edition")
    .eq("ruleset", ruleset)
    .eq("category", category)
    .order("name", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listSrdEntries(${ruleset}/${category}) failed: ${error.message}`);
  return data || [];
}

async function getSrdEntry(srdLibraryId) {
  const { data, error } = await supabase
    .from("srd_library")
    .select("*")
    .eq("id", srdLibraryId)
    .maybeSingle();
  if (error) throw new Error(`getSrdEntry(${srdLibraryId}) failed: ${error.message}`);
  return data;
}

// Recovers a srd_library row's UUID from its (ruleset, category, srd_id)
// -- safe because that triple is UNIQUE (migrations/020's own constraint).
// Every saved import/reflavor entry stores srdSourceId (the human slug,
// e.g. "goblin") on its raw_json for display, but NOT the srd_library
// UUID getSrdEntry() needs -- fine for the original generate call (the
// frontend has the real srdLibraryId on hand at that moment), but the
// generic card "Regenerate" button (archive/js/render.js's
// regenerateEntry()) only ever posts { fillExistingId }, with no way to
// resupply srdLibraryId. This lets every category's Import/Reflavor
// handler recover it server-side from what's already saved, so
// Regenerate works on an imported/reflavored entry the same as it does
// on a Homebrew one, instead of erroring "Import mode requires
// srdLibraryId" the moment a user clicks the one regenerate button every
// other entry already has.
async function getSrdEntryBySlug(ruleset, category, srdId) {
  const { data, error } = await supabase
    .from("srd_library")
    .select("*")
    .eq("ruleset", ruleset)
    .eq("category", category)
    .eq("srd_id", srdId)
    .maybeSingle();
  if (error) throw new Error(`getSrdEntryBySlug(${ruleset}/${category}/${srdId}) failed: ${error.message}`);
  return data;
}

// "same-CR reference monsters" for the Homebrew prompt -- picks up to
// `limit` monsters at or near the target CR, closest-CR-first, so the
// model has real structural stat blocks to ground against without
// dumping the whole library into the prompt. See
// prompts/rulesets/5e/enemyContentPrompt.js's buildHomebrewEnemySystemPrompt.
async function findNearestCrMonsters(ruleset, targetCr, { limit = 2 } = {}) {
  const { data, error } = await supabase
    .from("srd_library")
    .select("srd_id, name, cr, data_json")
    .eq("ruleset", ruleset)
    .eq("category", "monsters")
    .not("cr", "is", null)
    .order("cr", { ascending: true });
  if (error) throw new Error(`findNearestCrMonsters failed: ${error.message}`);
  if (!data || !data.length) return [];
  if (targetCr == null) return data.slice(0, limit);
  const sorted = [...data].sort((a, b) => Math.abs(a.cr - targetCr) - Math.abs(b.cr - targetCr));
  return sorted.slice(0, limit);
}

// Records that `worldId` imported `srdLibraryId` into `entryId` --
// idempotent via the unique(world_id, srd_library_id) constraint (a
// re-import attempt just upserts the same row rather than erroring).
async function recordImport(worldId, srdLibraryId, entryId) {
  const { error } = await supabase
    .from("world_srd_imports")
    .upsert({ world_id: worldId, srd_library_id: srdLibraryId, entry_id: entryId }, { onConflict: "world_id,srd_library_id" });
  if (error) throw new Error(`recordImport failed: ${error.message}`);
}

async function isAlreadyImported(worldId, srdLibraryId) {
  const { data, error } = await supabase
    .from("world_srd_imports")
    .select("entry_id")
    .eq("world_id", worldId)
    .eq("srd_library_id", srdLibraryId)
    .maybeSingle();
  if (error) throw new Error(`isAlreadyImported failed: ${error.message}`);
  return data ? data.entry_id : null;
}

// Every entry_id a world has ever imported (any category) -- used to
// exclude imports from the entry cap (Phase 12) without re-parsing every
// entries row's raw_json to look for a sourceMode field.
async function listImportedEntryIds(worldId) {
  const { data, error } = await supabase
    .from("world_srd_imports")
    .select("entry_id")
    .eq("world_id", worldId);
  if (error) throw new Error(`listImportedEntryIds failed: ${error.message}`);
  return (data || []).map((row) => row.entry_id);
}

module.exports = { listSrdEntries, getSrdEntry, getSrdEntryBySlug, findNearestCrMonsters, recordImport, isAlreadyImported, listImportedEntryIds };
