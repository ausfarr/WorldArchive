// lib/worldConfigRepo.js
//
// Read/write access to the world_config table. Nothing in the codebase
// touched this table before the Phase 2 wizard work — each world's
// world_config row didn't necessarily exist yet, so this module handles
// get-or-create the same way middleware/resolveTenant.js does for worlds.
//
// draft_json holds in-progress, not-yet-saved field values within a step
// still being filled out (e.g. Step 1's fields autosave here). Once a
// step's own Save action is used, that step commits directly to its real
// destination (lore_sections/lore_doc_ref for Lore, factions_json below
// for Factions, etc.) rather than staying in draft_json until Step 8 --
// see this session's addendum to multi_tenant_pivot_scope.md for the full
// reasoning on why the wizard moved to this progressive-commit pattern.

const { supabase } = require("./supabaseClient");

// Race-safe get-or-create, same pattern as resolveTenant.js's
// getOrCreateWorldId — relies on a unique index on world_config.world_id
// rather than a DB trigger.
async function getOrCreateWorldConfig(worldId) {
  const { data: existing, error: selectError } = await supabase
    .from("world_config")
    .select("*")
    .eq("world_id", worldId)
    .maybeSingle();

  if (selectError) throw new Error(`getOrCreateWorldConfig select failed: ${selectError.message}`);
  if (existing) return existing;

  const { data: inserted, error: insertError } = await supabase
    .from("world_config")
    .insert({ world_id: worldId, draft_json: {} })
    .select("*")
    .single();

  if (insertError && insertError.code !== "23505") {
    throw new Error(`getOrCreateWorldConfig insert failed: ${insertError.message}`);
  }
  if (inserted) return inserted;

  // Lost the race to a near-simultaneous request — re-select.
  const { data: afterRace, error: raceError } = await supabase
    .from("world_config")
    .select("*")
    .eq("world_id", worldId)
    .single();
  if (raceError) throw new Error(`getOrCreateWorldConfig re-select failed: ${raceError.message}`);
  return afterRace;
}

// Returns just this world's draft_json (always an object, never null).
async function getDraft(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.draft_json || {};
}

// Shallow-merges `fields` into draft_json[String(step)] and persists.
// Field-level merge (not a full draft replace) so autosaving one field
// can't clobber others saved moments earlier from the same step.
async function saveDraftStep(worldId, step, fields) {
  const config = await getOrCreateWorldConfig(worldId);
  const draft = config.draft_json || {};
  const stepKey = String(step);
  draft[stepKey] = Object.assign({}, draft[stepKey] || {}, fields);

  const { data, error } = await supabase
    .from("world_config")
    .update({ draft_json: draft })
    .eq("world_id", worldId)
    .select("*")
    .single();

  if (error) throw new Error(`saveDraftStep(${step}) failed: ${error.message}`);
  return data.draft_json;
}

// Progressive-commit storage for Factions (Wizard Step 4). Writes
// directly to world_config.factions_json rather than draft_json -- see
// this session's addendum to multi_tenant_pivot_scope.md for why the
// wizard moved to a progressive-commit pattern starting with Lore/Step 3.
async function getFactions(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.factions_json || [];
}

async function saveFactions(worldId, factions) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase
    .from("world_config")
    .update({ factions_json: factions })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`saveFactions failed: ${error.message}`);
  return data.factions_json;
}

// Wipes a world's draft_json, factions_json, and lore_doc_ref back to
// empty -- used by the wizard's session-based auto-reset and the
// explicit "Start Over" action. Does NOT touch lore_sections (a separate
// table) -- see loreRepo.clearLoreSections, called alongside this by the
// /api/wizard/reset route.
async function resetWorldConfig(worldId) {
  await getOrCreateWorldConfig(worldId);
  const { error } = await supabase
    .from("world_config")
    .update({ draft_json: {}, factions_json: [], lore_doc_ref: null })
    .eq("world_id", worldId);
  if (error) throw new Error(`resetWorldConfig failed: ${error.message}`);
}

module.exports = { getOrCreateWorldConfig, getDraft, saveDraftStep, getFactions, saveFactions, resetWorldConfig };
