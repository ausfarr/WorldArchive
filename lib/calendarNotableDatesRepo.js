// lib/calendarNotableDatesRepo.js
//
// Session Prep Companion, Phase 8 -- CRUD against calendar_notable_dates
// (migrations/035). DM-added recurring dates (holidays, festivals) for
// the Full Calendar Page -- see that migration's header comment for why
// this is its own table rather than a field on world_config.calendar_config.

const { supabase } = require("./supabaseClient");

function rowToNotableDate(row) {
  return {
    id: row.id,
    worldId: row.world_id,
    name: row.name,
    monthIndex: row.month_index,
    day: row.day,
    note: row.note || null,
    createdAt: row.created_at
  };
}

async function listNotableDates(worldId) {
  const { data, error } = await supabase
    .from("calendar_notable_dates")
    .select("*")
    .eq("world_id", worldId)
    .order("month_index", { ascending: true })
    .order("day", { ascending: true });
  if (error) throw new Error(`listNotableDates failed: ${error.message}`);
  return (data || []).map(rowToNotableDate);
}

async function createNotableDate(worldId, { name, monthIndex, day, note }) {
  const row = {
    world_id: worldId,
    name,
    month_index: monthIndex,
    day,
    note: note || null
  };
  const { data, error } = await supabase.from("calendar_notable_dates").insert(row).select().single();
  if (error) throw new Error(`createNotableDate failed: ${error.message}`);
  return rowToNotableDate(data);
}

async function deleteNotableDate(worldId, id) {
  const { data, error } = await supabase
    .from("calendar_notable_dates")
    .delete()
    .eq("world_id", worldId)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`deleteNotableDate failed: ${error.message}`);
  return data ? rowToNotableDate(data) : null;
}

// "Delete World" (routes/deleteWorld.js) keeps the same `worlds` row, so
// calendar_notable_dates' `world_id ... on delete cascade` FK
// (migrations/035) never fires -- same gap the route's own header comment
// already documents for campaign_modules/campaign_arcs, just never
// extended to this table when Phase 8 added it. Without this, a fresh
// world (same world_id) kept showing the old world's recurring
// holidays/festivals on the Calendar page.
async function deleteAllNotableDates(worldId) {
  const { error } = await supabase.from("calendar_notable_dates").delete().eq("world_id", worldId);
  if (error) throw new Error(`deleteAllNotableDates failed: ${error.message}`);
}

module.exports = { listNotableDates, createNotableDate, deleteNotableDate, deleteAllNotableDates };
