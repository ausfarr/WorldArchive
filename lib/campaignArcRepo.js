// lib/campaignArcRepo.js
//
// CRUD against campaign_arcs. Mirrors lib/campaignModuleRepo.js's shape
// exactly (same reasoning: a distinct table with its own simple field
// set, not worth forcing through the shared entries-table pattern).

const { supabase } = require("./supabaseClient");

function rowToArc(row) {
  return {
    id: row.id,
    worldId: row.world_id,
    name: row.name,
    summary: row.summary,
    questIds: row.quest_ids || [],
    pendingStages: row.pending_stages_json || [],
    createdVia: row.created_via,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listCampaignArcs(worldId) {
  const { data, error } = await supabase
    .from("campaign_arcs")
    .select("*")
    .eq("world_id", worldId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listCampaignArcs failed: ${error.message}`);
  return (data || []).map(rowToArc);
}

async function getCampaignArc(worldId, id) {
  const { data, error } = await supabase
    .from("campaign_arcs")
    .select("*")
    .eq("world_id", worldId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCampaignArc(${id}) failed: ${error.message}`);
  if (!data) return null;
  return rowToArc(data);
}

async function createCampaignArc(worldId, { name, summary, questIds, pendingStages, createdVia }) {
  const row = {
    world_id: worldId,
    name,
    summary: summary || null,
    quest_ids: questIds || [],
    pending_stages_json: pendingStages || [],
    created_via: createdVia || "manual"
  };
  const { data, error } = await supabase
    .from("campaign_arcs")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`createCampaignArc failed: ${error.message}`);
  return rowToArc(data);
}

async function updateCampaignArc(worldId, id, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.questIds !== undefined) row.quest_ids = patch.questIds;
  if (patch.pendingStages !== undefined) row.pending_stages_json = patch.pendingStages;
  row.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("campaign_arcs")
    .update(row)
    .eq("world_id", worldId)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`updateCampaignArc(${id}) failed: ${error.message}`);
  if (!data) throw new Error(`updateCampaignArc(${id}): arc not found`);
  return rowToArc(data);
}

async function deleteCampaignArc(worldId, id) {
  const { error } = await supabase
    .from("campaign_arcs")
    .delete()
    .eq("world_id", worldId)
    .eq("id", id);
  if (error) throw new Error(`deleteCampaignArc(${id}) failed: ${error.message}`);
}

// Wipes every Campaign for a world in one call. Same reasoning as
// campaignModuleRepo.js's deleteAllCampaignModules -- the ON DELETE
// CASCADE on campaign_arcs.world_id never fires during "Delete World"
// since that flow keeps the `worlds` row intact.
async function deleteAllCampaignArcs(worldId) {
  const { error } = await supabase
    .from("campaign_arcs")
    .delete()
    .eq("world_id", worldId);
  if (error) throw new Error(`deleteAllCampaignArcs failed: ${error.message}`);
}

// Appends a quest id to an arc's ordered list, if it isn't already
// present -- used when a DM creates a new Quest from an unmatched stage
// (see routes/campaignModule.js and archive/js/campaignModule.js's
// arcId handling) so the freshly-created Quest links itself back
// automatically, no separate manual step required. If stageId is given,
// also removes that entry from pendingStages -- this is what makes a
// fulfilled "still needs a Quest" stage disappear from that list once
// its Quest actually exists.
async function appendQuestToArc(worldId, arcId, questId, stageId) {
  const arc = await getCampaignArc(worldId, arcId);
  if (!arc) throw new Error(`appendQuestToArc: arc '${arcId}' not found`);
  const patch = {};
  if (!arc.questIds.includes(questId)) {
    patch.questIds = [...arc.questIds, questId];
  }
  if (stageId) {
    patch.pendingStages = arc.pendingStages.filter((s) => s.id !== stageId);
  }
  if (Object.keys(patch).length === 0) return arc;
  return updateCampaignArc(worldId, arcId, patch);
}

module.exports = {
  listCampaignArcs,
  getCampaignArc,
  createCampaignArc,
  updateCampaignArc,
  deleteCampaignArc,
  deleteAllCampaignArcs,
  appendQuestToArc
};
