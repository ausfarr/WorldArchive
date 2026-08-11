// lib/campaignModuleRepo.js
//
// CRUD against the new `campaign_modules` table (migrations/009). Same
// shape of module as lib/entriesRepo.js, just for this one new table
// instead of the shared `entries` table -- kept separate rather than
// bolted onto entriesRepo.js since campaign_modules isn't a category
// (no `category`/`entry_id` columns, no locked/fill-in state, no
// tags/body_html) and forcing it through the same functions would mean
// a lot of "this column doesn't apply here" branching.

const { supabase } = require("./supabaseClient");

function rowToModule(row) {
  return {
    id: row.id,
    worldId: row.world_id,
    name: row.name,
    summary: row.summary,
    status: row.status,
    entries: row.entries_json || [],
    createdVia: row.created_via,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listCampaignModules(worldId) {
  const { data, error } = await supabase
    .from("campaign_modules")
    .select("*")
    .eq("world_id", worldId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listCampaignModules failed: ${error.message}`);
  return (data || []).map(rowToModule);
}

async function getCampaignModule(worldId, id) {
  const { data, error } = await supabase
    .from("campaign_modules")
    .select("*")
    .eq("world_id", worldId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCampaignModule(${id}) failed: ${error.message}`);
  if (!data) return null;
  return rowToModule(data);
}

// Used both for a manual "New Campaign Module" (entries starts empty,
// createdVia "manual") and for confirming an AI preview (entries already
// populated, createdVia "ai") -- the preview step (routes/campaignModule.js's
// /generate) never writes to this table itself, only this function does,
// which is what makes "preview first" actually mean something.
async function createCampaignModule(worldId, { name, summary, status, entries, createdVia }) {
  const row = {
    world_id: worldId,
    name,
    summary: summary || null,
    status: status || "planned",
    entries_json: entries || [],
    created_via: createdVia || "manual"
  };
  const { data, error } = await supabase
    .from("campaign_modules")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`createCampaignModule failed: ${error.message}`);
  return rowToModule(data);
}

// Partial update -- only touches the fields actually passed in `patch`,
// same "don't clobber what wasn't sent" principle as entriesRepo.js's
// patchEntryMeta, but a plain column update here rather than a JSON
// merge since campaign_modules' fields are real columns, not raw_json.
async function updateCampaignModule(worldId, id, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.entries !== undefined) row.entries_json = patch.entries;
  row.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("campaign_modules")
    .update(row)
    .eq("world_id", worldId)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`updateCampaignModule(${id}) failed: ${error.message}`);
  if (!data) throw new Error(`updateCampaignModule(${id}): module not found`);
  return rowToModule(data);
}

async function deleteCampaignModule(worldId, id) {
  const { error } = await supabase
    .from("campaign_modules")
    .delete()
    .eq("world_id", worldId)
    .eq("id", id);
  if (error) throw new Error(`deleteCampaignModule(${id}) failed: ${error.message}`);
}

// Wipes every Quest for a world in one call. Used by "Delete World"
// (routes/deleteWorld.js) -- campaign_modules.world_id has an ON DELETE
// CASCADE foreign key, but that only fires if the `worlds` row itself is
// deleted, which "Delete World" deliberately never does (same world_id,
// same account -- see that route's own comment). So this needs the same
// explicit bulk delete entriesRepo.deleteAllEntries already gets.
async function deleteAllCampaignModules(worldId) {
  const { error } = await supabase
    .from("campaign_modules")
    .delete()
    .eq("world_id", worldId);
  if (error) throw new Error(`deleteAllCampaignModules failed: ${error.message}`);
}

// Called from routes/entries.js's DELETE handler when an entry referenced
// by one or more Quests gets deleted elsewhere. Without this, entries_json
// kept the dead {category, entryId} reference forever -- the frontend
// tolerates it (re-checks at read time and renders "(missing)"), but the
// stale id never actually went away and every load paid for that extra
// re-check. Best-effort per module (see call site) -- this is cleanup,
// not something that should turn a successful entry delete into a
// failure if a module happens to update strangely.
async function removeEntryFromAllCampaignModules(worldId, category, entryId) {
  const modules = await listCampaignModules(worldId);
  for (const mod of modules) {
    const filtered = mod.entries.filter((e) => !(e.category === category && e.entryId === entryId));
    if (filtered.length !== mod.entries.length) {
      await updateCampaignModule(worldId, mod.id, { entries: filtered });
    }
  }
}

module.exports = { listCampaignModules, getCampaignModule, createCampaignModule, updateCampaignModule, deleteCampaignModule, deleteAllCampaignModules, removeEntryFromAllCampaignModules };
