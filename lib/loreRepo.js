// lib/loreRepo.js
//
// Read/write access to lore_sections (the per-world, tagged breakdown of a
// world's lore doc) and the raw lore_doc_ref text on world_config.
//
// Saving lore always REPLACES the world's existing sections rather than
// appending -- re-running Step 3 (regenerate, or re-import) should give a
// clean new set, not an ever-growing pile of stale + fresh sections. This
// mirrors the "regenerate revises, doesn't append" philosophy used
// elsewhere in the project, just at the whole-step granularity since Lore
// doesn't have Wizard Steps' per-field autosave story yet.

const { supabase } = require("./supabaseClient");
const { getOrCreateWorldConfig } = require("./worldConfigRepo");

async function listLoreSections(worldId) {
  const { data, error } = await supabase
    .from("lore_sections")
    .select("*")
    .eq("world_id", worldId)
    .order("position", { ascending: true });
  if (error) throw new Error(`listLoreSections failed: ${error.message}`);
  return data || [];
}

// sections: array of { title, content, categoryTags, core, position }
// rawText: the full composed/imported document, stored on world_config.lore_doc_ref
// source: 'generated' | 'imported'
async function replaceLoreSections(worldId, sections, rawText, source) {
  const { error: deleteError } = await supabase
    .from("lore_sections")
    .delete()
    .eq("world_id", worldId);
  if (deleteError) throw new Error(`replaceLoreSections delete failed: ${deleteError.message}`);

  const rows = sections.map((s, i) => ({
    world_id: worldId,
    title: s.title,
    content: s.content,
    category_tags: s.categoryTags || [],
    faction_tags: [], // always empty at this stage -- see migrations/003_lore_sections.sql note
    core: !!s.core,
    position: s.position != null ? s.position : i,
    source
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("lore_sections").insert(rows);
    if (insertError) throw new Error(`replaceLoreSections insert failed: ${insertError.message}`);
  }

  // Ensure a world_config row exists, then store the raw full text.
  await getOrCreateWorldConfig(worldId);
  const { error: updateError } = await supabase
    .from("world_config")
    .update({ lore_doc_ref: rawText })
    .eq("world_id", worldId);
  if (updateError) throw new Error(`replaceLoreSections lore_doc_ref update failed: ${updateError.message}`);

  return listLoreSections(worldId);
}

// Backfill heuristic (see this session's chat + scope doc addendum): the
// world's lore doc is generic, not written per-faction the way Echoes'
// hand-authored World Bible sections are, so there's no real per-faction
// differentiation to derive. Simplest defensible backfill: once factions
// exist, mark every lore section that's either core:true or already
// tagged category "factions" as relevant to ALL of this world's
// factions. Sections unrelated to factions/politics keep empty
// faction_tags. This is a deliberately simple v1 -- true per-faction
// differentiated tagging (asking the model to judge which sections
// matter to which specific faction) is a stretch goal, not built here.
//
// NOTE: filters/updates happen in JS rather than via a Postgres
// `.contains()` query -- that operator doesn't reliably serialize a plain
// JS array against a jsonb column through PostgREST (hit a real "invalid
// input syntax for type json" error using it). Per-world section counts
// are small, so fetch-filter-update in JS is simpler and more robust than
// fighting the query operator.
async function backfillFactionTags(worldId, factionIds) {
  if (!factionIds || factionIds.length === 0) return;

  const sections = await listLoreSections(worldId);
  const toUpdate = sections.filter(
    (s) => s.core === true || (s.category_tags || []).includes("factions")
  );

  for (const section of toUpdate) {
    const { error } = await supabase
      .from("lore_sections")
      .update({ faction_tags: factionIds })
      .eq("id", section.id);
    if (error) throw new Error(`backfillFactionTags update failed for section ${section.id}: ${error.message}`);
  }
}

module.exports = { listLoreSections, replaceLoreSections, backfillFactionTags };
