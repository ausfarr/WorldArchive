// lib/pendingEntryUpdatesRepo.js
//
// Session Prep Companion, Phase 3 -- minimal CRUD against the stub
// pending_entry_updates table (migrations/030_pending_entry_updates.sql).
// Deliberately small -- Phase 7 formalizes the real DM-facing suggestion
// queue (act/dismiss transitions, a real UI) on top of this same table;
// this phase only needs create + list so nothing found this early is
// thrown away. See lib/logDateSuggestions.js for the one current caller.

const { supabase } = require("./supabaseClient");

async function createPendingUpdate(worldId, { entryId, category, suggestionType, deltaText, source }) {
  const row = {
    world_id: worldId,
    entry_id: entryId,
    category,
    suggestion_type: suggestionType,
    delta_text: deltaText,
    source: source || null,
    status: "pending"
  };
  const { data, error } = await supabase.from("pending_entry_updates").insert(row).select().single();
  if (error) throw new Error(`createPendingUpdate failed: ${error.message}`);
  return data;
}

async function listPendingUpdates(worldId, { status } = {}) {
  let query = supabase.from("pending_entry_updates").select("*").eq("world_id", worldId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`listPendingUpdates failed: ${error.message}`);
  return data || [];
}

module.exports = { createPendingUpdate, listPendingUpdates };
