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

async function listSrdEntries(ruleset, category, { limit = 200 } = {}) {
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

module.exports = { listSrdEntries, getSrdEntry, findNearestCrMonsters, recordImport, isAlreadyImported, listImportedEntryIds };
