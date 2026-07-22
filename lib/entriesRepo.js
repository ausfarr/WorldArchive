// Generic CRUD against the `entries` table, shared by every category.
//
// This is what replaces the old manifest.js + data/<id>.js two-file
// pattern: one Postgres row per entry now IS both the manifest listing
// and the full dossier data. Category-specific functions in roster.js
// and fileWriter.js are thin, category-named wrappers around the three
// functions here.
//
// Row shape (see the `entries` table):
//   world_id, category, entry_id, name, subtitle, faction,
//   tags_json, body_html, raw_json, locked, created_at, updated_at
//
// `raw_json` stores the full old-style window.ENTRY object (category,
// id, name, eyebrow, subtitle, faction, tags, bodyHtml, footer, raw,
// plus whatever category-specific extra fields existed — tier,
// roleArchetype, etc.) so nothing that used to live in the .js data
// files is lost. name/subtitle/faction/tags_json/body_html/locked are
// ALSO mirrored onto their own columns for querying/filtering without
// unpacking JSON every time.

const { supabase } = require("./supabaseClient");

async function listEntries(worldId, category) {
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("world_id", worldId)
    .eq("category", category)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listEntries(${category}) failed: ${error.message}`);
  return (data || []).map(rowToManifestEntry);
}

async function getEntry(worldId, category, entryId) {
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("world_id", worldId)
    .eq("category", category)
    .eq("entry_id", entryId)
    .maybeSingle();
  if (error) throw new Error(`getEntry(${category}/${entryId}) failed: ${error.message}`);
  if (!data) return null;
  return rowToFullEntry(data);
}

// entryMeta is the old window.ENTRY-shaped object built by fileWriter.js's
// per-category save*Entry() functions. Always writes locked: false — this
// mirrors the old buildManifestEntry() behavior, since these functions are
// only ever called for "new" or "fill" (never for a regenerate preview,
// which stays unsaved until /api/confirm-entry).
async function upsertEntry(worldId, category, entryMeta) {
  const row = {
    world_id: worldId,
    category,
    entry_id: entryMeta.id,
    name: entryMeta.name,
    subtitle: entryMeta.subtitle || null,
    faction: entryMeta.faction || null,
    tags_json: entryMeta.tags || [],
    body_html: entryMeta.bodyHtml || null,
    raw_json: entryMeta,
    locked: false
  };
  const { data, error } = await supabase
    .from("entries")
    .upsert(row, { onConflict: "world_id,category,entry_id" })
    .select()
    .single();
  if (error) throw new Error(`upsertEntry(${category}/${entryMeta.id}) failed: ${error.message}`);
  return rowToFullEntry(data);
}

// Reconstructs an old-style manifest-array entry: {id, name, subtitle,
// tags, faction, locked, ...category-specific extras like roleArchetype
// or tier}. Spreading raw_json first means any extra field a category
// stored there (roleArchetype, tier, role, age, contradiction, etc.) is
// preserved automatically — no per-category special-casing needed here.
function rowToManifestEntry(row) {
  const extra = row.raw_json || {};
  return {
    ...extra,
    id: row.entry_id,
    name: row.name,
    subtitle: row.subtitle,
    tags: row.tags_json || [],
    faction: row.faction,
    locked: row.locked
  };
}

// Reconstructs the old window.ENTRY-shaped full entry (what readXEntry()
// used to return after parsing a data/<id>.js file via vm).
function rowToFullEntry(row) {
  return {
    ...(row.raw_json || {}),
    id: row.entry_id,
    category: row.category,
    name: row.name,
    subtitle: row.subtitle,
    faction: row.faction,
    tags: row.tags_json || [],
    bodyHtml: row.body_html,
    locked: row.locked
  };
}

module.exports = { listEntries, getEntry, upsertEntry };
