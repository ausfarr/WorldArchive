// lib/timelineRepo.js
//
// Session Prep Companion, Phase 6 -- CRUD against timeline_events
// (migrations/033). Plain create + list -- there's no update/delete flow
// yet (Timeline events are an append-only record of what happened,
// consistent with never auto-writing over something already confirmed).

const { supabase } = require("./supabaseClient");

function rowToEvent(row) {
  return {
    id: row.id,
    worldId: row.world_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceCategory: row.source_category,
    sessionNumber: row.session_number,
    worldDate: row.world_date,
    summary: row.summary,
    linkedEntryIds: row.linked_entry_ids || [],
    linkedFactionIds: row.linked_faction_ids || [],
    createdAt: row.created_at
  };
}

async function createTimelineEvent(worldId, { sourceType, sourceId, sourceCategory, sessionNumber, worldDate, summary, linkedEntryIds, linkedFactionIds }) {
  const row = {
    world_id: worldId,
    source_type: sourceType,
    source_id: sourceId,
    source_category: sourceCategory,
    session_number: sessionNumber != null ? sessionNumber : null,
    world_date: worldDate || null,
    summary,
    linked_entry_ids: linkedEntryIds || [],
    linked_faction_ids: linkedFactionIds || []
  };
  const { data, error } = await supabase.from("timeline_events").insert(row).select().single();
  if (error) throw new Error(`createTimelineEvent failed: ${error.message}`);
  return rowToEvent(data);
}

async function listTimelineEvents(worldId) {
  const { data, error } = await supabase
    .from("timeline_events")
    .select("*")
    .eq("world_id", worldId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listTimelineEvents failed: ${error.message}`);
  return (data || []).map(rowToEvent);
}

module.exports = { createTimelineEvent, listTimelineEvents };
