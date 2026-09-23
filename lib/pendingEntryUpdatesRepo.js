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
const { withLock } = require("./asyncLock");

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

// Refreshes an existing PENDING suggestion's content in place -- the
// counterpart to findExistingUpdate's dedup: that check only ever looked
// at (source, entry, category, suggestionType), never at whether the
// proposed content itself changed, so a regenerate-confirm that revised
// the underlying facts (not just wording) silently kept showing the
// stale first-draft deltaText/payload forever. Callers only reach this
// once they've already confirmed the existing row's status is 'pending'
// (an applied/dismissed row is left alone -- the DM already acted on
// whatever it said at the time, same as findExistingUpdate's own
// reasoning for matching ANY status). The `.eq("status", "pending")`
// filter here is a second, defensive guard against the same status
// changing between that check and this write, same pattern as
// setPendingUpdateStatus's fromStatus filter -- a loser just no-ops
// (returns null) instead of overwriting an update the DM already acted
// on in between.
async function updatePendingUpdate(worldId, id, { deltaText, payload }) {
  const { data, error } = await supabase
    .from("pending_entry_updates")
    .update({ delta_text: deltaText, payload: payload || null })
    .eq("world_id", worldId)
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) throw new Error(`updatePendingUpdate failed: ${error.message}`);
  return data ? rowToUpdate(data) : null;
}

// Wraps findExistingUpdate + createPendingUpdate in the same in-process
// lock pattern as lib/asyncLock.js's other check-then-act fixes (entry
// metadata patches, Campaign Arc/Quest cleanup, generate-once resources).
// Both call sites (lib/logDateSuggestions.js, lib/sessionChronicleSuggestions.js)
// used to call findExistingUpdate() then createPendingUpdate() as two
// separate, unguarded steps -- two confirms of the same Log/Chronicle
// landing close together (a double-click on Confirm, or the same dossier
// open in two tabs) could each run findExistingUpdate() before either
// insert landed, both see "no existing row," and both insert, leaving two
// near-identical pending_entry_updates rows for the same (source, entry,
// field) fact that the DM then has to dismiss/apply separately. Locking on
// the same key findExistingUpdate() dedupes against means the second
// caller's own existence check (re-run inside the lock, after the first
// caller's insert has landed) sees the row the first caller just created
// and skips the insert instead of racing it. No DB unique constraint for
// this today -- see lib/asyncLock.js's own note on why an in-process lock
// is judged sufficient at current single-instance scale; a real DB-level
// lock would be needed if this app ever runs multiple instances.
//
// Returns the newly created row, the refreshed row (existing pending
// suggestion whose content changed), or null when nothing was written.
async function findOrCreatePendingUpdate(worldId, { entryId, category, suggestionType, deltaText, source, payload }) {
  const key = `pendingUpdate:${worldId}:${source}:${entryId}:${category}:${suggestionType}`;
  return withLock(key, async () => {
    const existing = await findExistingUpdate(worldId, { source, entryId, category, suggestionType });
    if (existing) {
      // A regenerate-confirm can revise the underlying facts, not just the
      // wording (corrected recap notes flip an NPC from "wounded" to
      // "dead", or push a Log's resolved date to a different day) -- if the
      // still-PENDING row's content actually changed, refresh it in place
      // instead of keeping the stale first-draft suggestion forever. An
      // applied/dismissed row is left alone (the DM already acted on
      // whatever it said at the time). Done *inside* the lock, not by the
      // caller after this returns: the refresh branch (awesome-mayer-yze9tz)
      // and this lock (awesome-mayer-rbyc26) were built in parallel against
      // the same unlocked find-then-create, so each would have silently
      // undone the other if merged as written -- keeping the whole
      // find -> refresh-or-create decision under one lock is what makes
      // both fixes hold at once.
      const contentChanged = existing.deltaText !== deltaText ||
        JSON.stringify(existing.payload || null) !== JSON.stringify(payload || null);
      if (existing.status === "pending" && contentChanged) {
        return updatePendingUpdate(worldId, existing.id, { deltaText, payload });
      }
      return null;
    }
    return createPendingUpdate(worldId, { entryId, category, suggestionType, deltaText, source, payload });
  });
}

// "Delete World" (routes/deleteWorld.js) keeps the same `worlds` row, so
// pending_entry_updates' `world_id ... on delete cascade` FK
// (migrations/031) never fires -- same gap the route's own header comment
// already documents for campaign_modules/campaign_arcs, just never
// extended to this table when Phase 7 formalized it. Without this, a
// fresh world (same world_id) kept showing stale Suggested Updates
// pointing at entries that no longer exist.
async function deleteAllPendingUpdates(worldId) {
  const { error } = await supabase.from("pending_entry_updates").delete().eq("world_id", worldId);
  if (error) throw new Error(`deleteAllPendingUpdates failed: ${error.message}`);
}

module.exports = { createPendingUpdate, listPendingUpdates, getPendingUpdate, setPendingUpdateStatus, findExistingUpdate, updatePendingUpdate, findOrCreatePendingUpdate, deleteAllPendingUpdates };
