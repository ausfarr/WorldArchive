// lib/worldConfigRepo.js
//
// Read/write access to the world_config table. Nothing in the codebase
// touched this table before the Phase 2 wizard work — each world's
// world_config row didn't necessarily exist yet, so this module handles
// get-or-create the same way middleware/resolveTenant.js does for worlds.
//
// draft_json holds ALL in-progress wizard state across every step, keyed
// by step number, e.g.:
//   { "1": { genre: "...", scale: "...", coreTension: "..." }, "2": {...} }
// Nothing here writes to the "official" columns (factions_json,
// stat_system_json, style_guide_json, lore_doc_ref, category_config_json)
// — that split only happens at Review & Confirm (Step 8), not yet built.

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

module.exports = { getOrCreateWorldConfig, getDraft, saveDraftStep };
