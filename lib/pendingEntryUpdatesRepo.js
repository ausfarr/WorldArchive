// lib/pendingEntryUpdatesRepo.js
//
// Session Prep Companion, Phase 3 stub, formalized in Phase 7 -- CRUD
// against pending_entry_updates (migrations/031, +034 for `payload`).
// This is the real DM-facing suggestion queue now: created by
// lib/logDateSuggestions.js (Phase 3's date-resolution trigger) and
// lib/sessionChronicleSuggestions.js (Phase 7's Chronicle-implied-update
// trigger), acted on or dismissed via routes/pendingUpdates.js. Rows are
// never deleted, only transitioned pending -> applied|dismissed, so
// there's always a record of what was surfaced.

const { supabase } = require("./supabaseClient");

function rowToUpdate(row) {
  return {
    id: row.id,
    worldId: row.world_id,
    entryId: row.entry_id,
    category: row.category,
    suggestionType: row.suggestion_type,
    deltaText: row.delta_text,
    payload: row.payload || null,
    source: row.source,
    status: row.status,
    createdAt: row.created_at
  };
}

async function createPendingUpdate(worldId, { entryId, category, suggestionType, deltaText, source, payload }) {
  const row = {
    world_id: worldId,
    entry_id: entryId,
    category,
    suggestion_type: suggestionType,
    delta_text: deltaText,
    source: source || null,
    payload: payload || null,
    status: "pending"
  };
  const { data, error } = await supabase.from("pending_entry_updates").insert(row).select().single();
  if (error) throw new Error(`createPendingUpdate failed: ${error.message}`);
  return rowToUpdate(data);
}

async function listPendingUpdates(worldId, { status } = {}) {
  let query = supabase.from("pending_entry_updates").select("*").eq("world_id", worldId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`listPendingUpdates failed: ${error.message}`);
  return (data || []).map(rowToUpdate);
}

async function getPendingUpdate(worldId, id) {
  const { data, error } = await supabase.from("pending_entry_updates").select("*").eq("world_id", worldId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getPendingUpdate failed: ${error.message}`);
  return data ? rowToUpdate(data) : null;
}

// Transitions a suggestion to 'applied' or 'dismissed' -- never deletes,
// per the scope doc's "acted/dismissed rows update status, never
// deleted" so there's always a record of what was surfaced.
async function setPendingUpdateStatus(worldId, id, status) {
  const { data, error } = await supabase
    .from("pending_entry_updates")
    .update({ status })
    .eq("world_id", worldId)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`setPendingUpdateStatus failed: ${error.message}`);
  if (!data) throw new Error(`setPendingUpdateStatus: suggestion '${id}' not found`);
  return rowToUpdate(data);
}

module.exports = { createPendingUpdate, listPendingUpdates, getPendingUpdate, setPendingUpdateStatus };
