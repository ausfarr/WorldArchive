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

// Dedup check for the two creation triggers (lib/sessionChronicleSuggestions.js,
// lib/logDateSuggestions.js) -- both fire again on every regenerate-confirm
// of the same source Log/Chronicle, not just its first confirm, since
// nothing about a confirm-time trigger distinguishes "first time this was
// saved" from "saved again unchanged." Without this check, regenerating a
// Chronicle's prose N times (revising wording, not the underlying facts)
// inserted N near-identical rows for the same (source, entry, field)
// triple, each needing its own separate dismiss/apply. Matches on `source`
// (the exact "chronicle:<logId>" / "log:<logId>" pointer already stored --
// see each row's own comment) plus entryId/category/suggestionType so a
// single Chronicle proposing updates to two different NPCs still gets two
// rows, just never more than one per NPC. Deliberately ANY status, not just
// 'pending' -- an already-applied or already-dismissed suggestion for the
// same fact shouldn't be resurrected either; the DM already acted on it.
async function findExistingUpdate(worldId, { source, entryId, category, suggestionType }) {
  if (!source) return null;
  const { data, error } = await supabase
    .from("pending_entry_updates")
    .select("*")
    .eq("world_id", worldId)
    .eq("source", source)
    .eq("entry_id", entryId)
    .eq("category", category)
    .eq("suggestion_type", suggestionType)
    .maybeSingle();
  if (error) throw new Error(`findExistingUpdate failed: ${error.message}`);
  return data ? rowToUpdate(data) : null;
}

// Transitions a suggestion to 'applied' or 'dismissed' -- never deletes,
// per the scope doc's "acted/dismissed rows update status, never
// deleted" so there's always a record of what was surfaced.
//
// The `.eq("status", fromStatus)` filter makes this a single atomic
// UPDATE ... WHERE status = 'pending' instead of the check-then-act
// pattern routes/pendingUpdates.js used to rely on (read status, branch
// in JS, then write). That read-then-write had a race: two concurrent
// requests for the same suggestion (double-click, two open tabs) could
// both pass the "is it still pending?" check before either write landed,
// letting an already-applied row get silently overwritten to dismissed
// (or vice versa) -- the exact status-overwrite bug this queue's audit
// trail exists to prevent. Filtering in the query means only the first
// of two racing requests can ever match a row; the loser gets back
// `null` and the route reports a conflict instead of clobbering it.
async function setPendingUpdateStatus(worldId, id, status, fromStatus) {
  let query = supabase.from("pending_entry_updates").update({ status }).eq("world_id", worldId).eq("id", id);
  if (fromStatus) query = query.eq("status", fromStatus);
  const { data, error } = await query.select().maybeSingle();
  if (error) throw new Error(`setPendingUpdateStatus failed: ${error.message}`);
  return data ? rowToUpdate(data) : null;
}

module.exports = { createPendingUpdate, listPendingUpdates, getPendingUpdate, setPendingUpdateStatus, findExistingUpdate };
