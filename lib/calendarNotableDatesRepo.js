// lib/calendarNotableDatesRepo.js
//
// Session Prep Companion, Phase 8 -- CRUD against calendar_notable_dates
// (migrations/034). DM-added recurring dates (holidays, festivals) for
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

module.exports = { listNotableDates, createNotableDate, deleteNotableDate };
