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

// Bug batch 1, Phase 4: thrown when timeline_events' source_type check
// constraint rejects the row -- i.e. the migration that allows that
// source_type hasn't been run (found live: production was missing 036, so
// every entry_date insert failed and /confirm-entry returned 500 after
// the entry itself had already saved). Callers catch this specifically
// and degrade (skip the Timeline write, report it) instead of failing the
// save. migrations/039 re-creates the constraint with every current type,
// so running 039 alone also covers 036.
class TimelineSourceTypeNotAllowedError extends Error {
  constructor(sourceType) {
    super(`timeline_events doesn't accept source_type '${sourceType}' yet -- run migrations/039_timeline_lore_date_source_type.sql (it also covers 036's 'entry_date').`);
    this.code = "timeline_source_type_migration_required";
    this.sourceType = sourceType;
  }
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
  if (error) {
    if (error.code === "23514" || /timeline_events_source_type_check/.test(error.message || "")) {
      throw new TimelineSourceTypeNotAllowedError(sourceType);
    }
    throw new Error(`createTimelineEvent failed: ${error.message}`);
  }
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

// Bug batch 1, Phase 4: just the auto-created entry_date events, for
// lib/timelineEvents.js's dedupe check and backfill. Optionally narrowed
// to one entry (category + id) -- the per-save check -- or the whole
// world (backfill).
async function listEntryDateEvents(worldId, { category, entryId } = {}) {
  let query = supabase
    .from("timeline_events")
    .select("*")
    .eq("world_id", worldId)
    .eq("source_type", "entry_date");
  if (category) query = query.eq("source_category", category);
  if (entryId) query = query.eq("source_id", entryId);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw new Error(`listEntryDateEvents failed: ${error.message}`);
  return (data || []).map(rowToEvent);
}

// "Delete World" (routes/deleteWorld.js) keeps the same `worlds` row, so
// timeline_events' `world_id ... on delete cascade` FK (migrations/033)
// never fires -- same gap the route's own header comment already
// documents for campaign_modules/campaign_arcs, just never extended to
// this table when Phase 6 added it. Without this, a fresh world (same
// world_id) kept showing Timeline events pointing at entries that no
// longer exist.
async function deleteAllTimelineEvents(worldId) {
  const { error } = await supabase.from("timeline_events").delete().eq("world_id", worldId);
  if (error) throw new Error(`deleteAllTimelineEvents failed: ${error.message}`);
}

module.exports = { createTimelineEvent, listTimelineEvents, listEntryDateEvents, deleteAllTimelineEvents, TimelineSourceTypeNotAllowedError };
