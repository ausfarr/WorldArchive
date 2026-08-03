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

async function createCampaignArc(worldId, { name, summary, questIds, createdVia }) {
  const row = {
    world_id: worldId,
    name,
    summary: summary || null,
    quest_ids: questIds || [],
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

// Appends a quest id to an arc's ordered list, if it isn't already
// present -- used when a DM creates a new Quest from an unmatched stage
// (see routes/campaignModule.js and archive/js/campaignModule.js's
// arcId handling) so the freshly-created Quest links itself back
// automatically, no separate manual step required.
async function appendQuestToArc(worldId, arcId, questId) {
  const arc = await getCampaignArc(worldId, arcId);
  if (!arc) throw new Error(`appendQuestToArc: arc '${arcId}' not found`);
  if (arc.questIds.includes(questId)) return arc;
  return updateCampaignArc(worldId, arcId, { questIds: [...arc.questIds, questId] });
}

module.exports = {
  listCampaignArcs,
  getCampaignArc,
  createCampaignArc,
  updateCampaignArc,
  deleteCampaignArc,
  appendQuestToArc
};
