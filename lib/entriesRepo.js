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
const { withLock } = require("./asyncLock");

// `locked: false` lets a caller that only cares about actually-generated
// entries (e.g. lib/roster.js's context builders, which filter locked
// placeholders out client-side anyway) push that filter into the query
// instead of transferring every locked placeholder row over the wire
// just to discard it. Omit the option entirely for the original
// behavior (every row, locked or not) -- callers doing id lookups across
// both (e.g. routes/generate.js's fillExistingId flow) still need that.
async function listEntries(worldId, category, { locked } = {}) {
  let query = supabase
    .from("entries")
    .select("*")
    .eq("world_id", worldId)
    .eq("category", category);
  if (locked === false) query = query.eq("locked", false);
  const { data, error } = await query.order("created_at", { ascending: true });
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
// per-category save*Entry() functions. Writes locked: false by default —
// this mirrors the old buildManifestEntry() behavior, since these
// functions are only ever called for "new" or "fill" (never for a
// regenerate preview, which stays unsaved until /api/confirm-entry).
// `{ locked: true }` is the one exception: lib/entryLinker.js's
// ensureGhostPlaceholder() uses it to create a Category-A ghost stub
// row. Fixture-tested against production (Phase 0 audit) — a later real
// upsertEntry() call for the same (world_id, category, entry_id) slug
// cleanly overwrites the ghost in place via the entries_unique_slug
// unique index (same row id, locked flips back to false), no duplicate.
async function upsertEntry(worldId, category, entryMeta, { locked = false } = {}) {
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
    locked
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

// Merges `patch` into an existing entry's raw_json without touching any
// other field on the row (name/subtitle/faction/tags_json/body_html all
// stay exactly as they were). Used for edits that are conceptually
// separate from content regeneration -- e.g. a user picking a faction's
// accent color shouldn't require (or risk) regenerating its Deep Lore,
// and regenerating its Deep Lore shouldn't risk wiping the color. Throws
// if the entry doesn't exist yet, since patching implies it already does.
//
// Read+merge+write, wrapped in withLock() keyed per entry -- this is the
// one shared function every caller (dungeonMap's map-bake save, the
// dossier map-pin drag, faction banner/accent-color saves, the wizard's
// faction accent-color step, Suggested Updates' status flip) goes
// through, but none of THEM coordinate with each other or with each
// other's calls to this same entry. Without the lock, two patches to the
// same entry landing close together (e.g. baking a Location's battle map
// in one tab while dragging its map pin in another) each read the same
// pre-patch raw_json and each write back a merge that silently drops the
// other's change -- the second write just wins outright. Keyed to match
// lib/entryLinker.js's backfill rebake path, so a rebake can't land in
// the middle of a patch's own read+write here and corrupt it either.
// NOTE this does NOT protect a patched field (dungeonMap, accentColor,
// etc.) from a *later* rebake: rebake's writers (saveLocationEntry and
// friends) rebuild raw_json from scratch from the entry's own content
// object and know nothing about fields patchEntryMeta added outside it,
// so a rebake that lands after a patch still overwrites raw_json without
// that field, lock or no lock -- a separate, pre-existing gap in how the
// save*Entry() writers construct raw_json, not a check-then-act race.
async function patchEntryMeta(worldId, category, entryId, patch) {
  return withLock(`entry:${worldId}:${category}:${entryId}`, async () => {
    const { data: existing, error: getErr } = await supabase
      .from("entries")
      .select("*")
      .eq("world_id", worldId)
      .eq("category", category)
      .eq("entry_id", entryId)
      .maybeSingle();
    if (getErr) throw new Error(`patchEntryMeta(${category}/${entryId}) lookup failed: ${getErr.message}`);
    if (!existing) throw new Error(`patchEntryMeta(${category}/${entryId}): entry not found`);

    const mergedRaw = { ...(existing.raw_json || {}), ...patch };
    const { data, error } = await supabase
      .from("entries")
      .update({ raw_json: mergedRaw })
      .eq("world_id", worldId)
      .eq("category", category)
      .eq("entry_id", entryId)
      .select()
      .single();
    if (error) throw new Error(`patchEntryMeta(${category}/${entryId}) update failed: ${error.message}`);
    return rowToFullEntry(data);
  });
}

// Full-text (ILIKE, name/title only) search across every category for a
// world, used by the Archive-wide search bar (routes/search.js). Returns
// results grouped by category so the frontend can render them under
// category headers without doing its own grouping. Ordered by name for
// stable, predictable results within each group -- relevance ranking
// isn't needed at this scale (ILIKE substring match, not full tsvector
// search), matching the "start simple" scope decision for this feature.
//
// Capped so a broad query (a single common letter) against a large,
// uncapped-entries (subscribed) world can't pull back an unbounded
// result set -- a search dropdown showing the first 200 alphabetically
// is still useful; showing every entry in the archive at once isn't.
//
// Excludes locked rows, same reasoning as countEntries below and every
// buildXRosterContext in lib/roster.js -- lib/entryLinker.js's
// ensureGhostPlaceholder() auto-creates locked ghost stubs (real `name`,
// null bodyHtml/subtitle) whenever generated content references something
// that doesn't exist yet. Without this filter, typing a referenced-but-
// never-generated NPC's name surfaced it in the search dropdown; clicking
// through landed on a blank dossier page, since renderDossier() (render.js)
// has no locked-entry handling -- unlike category grid pages, which render
// a "Fill In" card for the same locked state.
const SEARCH_RESULT_LIMIT = 200;

async function searchEntries(worldId, query) {
  const trimmed = (query || "").trim();
  if (!trimmed) return [];
  const { data, error } = await supabase
    .from("entries")
    .select("category, entry_id, name, subtitle")
    .eq("world_id", worldId)
    .eq("locked", false)
    .ilike("name", `%${trimmed}%`)
    .order("name", { ascending: true })
    .limit(SEARCH_RESULT_LIMIT);
  if (error) throw new Error(`searchEntries failed: ${error.message}`);
  const grouped = {};
  (data || []).forEach((row) => {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push({ id: row.entry_id, name: row.name, subtitle: row.subtitle });
  });
  return Object.keys(grouped).map((category) => ({ category, entries: grouped[category] }));
}

// Live count of a world's real (non-placeholder) entries, all 8
// categories combined -- the basis for the entry cap (see
// middleware/enforceEntryCap.js and migrations/013_manual_entry_mode.sql)
// and the Settings-page usage display (routes/billing.js). Deliberately a
// plain COUNT against the real table rather than a maintained counter
// column, so a deleted entry immediately frees up cap room again.
//
// Excludes locked rows, same as listEntries's { locked: false } option
// and routes/adminWorlds.js's own count query -- lib/entryLinker.js's
// ensureGhostPlaceholder() auto-creates locked ghost stubs whenever
// generated content references something that doesn't exist yet (an NPC
// mentioned by name, a location an NPC is "notable" in, etc.), entirely
// automatically and outside the user's direct control. Without this
// filter those content-free stubs silently ate into a free world's
// 30-entry budget right alongside entries the user actually asked for.
async function countEntries(worldId) {
  const { count, error } = await supabase
    .from("entries")
    .select("*", { count: "exact", head: true })
    .eq("world_id", worldId)
    .eq("locked", false);
  if (error) throw new Error(`countEntries failed: ${error.message}`);
  return count || 0;
}

// Deletes every entry (all 7 categories) for a world in one call. Used
// by the "Delete World" flow (routes/deleteWorld.js) -- there's no
// per-category filter here on purpose, since the whole point is wiping
// everything a world has ever generated.
async function deleteAllEntries(worldId) {
  const { error } = await supabase
    .from("entries")
    .delete()
    .eq("world_id", worldId);
  if (error) throw new Error(`deleteAllEntries failed: ${error.message}`);
}

// Deletes one entry. Used by the dossier page's "Delete This Entry"
// button (routes/entries.js DELETE handler) -- distinct from
// deleteAllEntries, which is the "Delete World" bulk wipe.
async function deleteEntry(worldId, category, entryId) {
  const { error } = await supabase
    .from("entries")
    .delete()
    .eq("world_id", worldId)
    .eq("category", category)
    .eq("entry_id", entryId);
  if (error) throw new Error(`deleteEntry(${category}/${entryId}) failed: ${error.message}`);
}

module.exports = { listEntries, getEntry, upsertEntry, patchEntryMeta, deleteAllEntries, deleteEntry, searchEntries, countEntries };
