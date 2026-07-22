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

module.exports = { listLoreSections, replaceLoreSections };
