// scripts/backfillWorldFlavorLabels.js
//
// One-off backfill for two related bugs fixed this session, both the
// same shape: a display field derived from the world's own custom
// labels (Wizard Step 5's stat/skill-system naming) only ever got
// computed once, at AI-generation time, and then just passed through
// unchanged on every later save. Fixing the underlying template/save
// function only changes what gets written on the NEXT save -- every
// entry saved before the fix still has the stale value baked into its
// stored bodyHtml/tags, since those are built once at save time, not
// recomputed per view. This script re-saves every affected entry across
// every world so existing data picks up both fixes without anyone
// having to manually re-edit each one.
//
//   1. Survivors (PCs) -- lib/survivorTemplate.js's buildSurvivorBodyHtml
//      hardcoded "Body"/"Reflex"/etc. instead of this world's own stat
//      labels (lib/enemyTemplate.js's buildEnemyBodyHtml already did
//      this correctly -- Survivors were the one category that didn't).
//   2. Items -- weaponSkillLabel was only ever set by
//      routes/generateItem.js at AI-generation time. A manually-created
//      Weapon item (v0.9 Manual Mode) never had it set at all, and
//      editing an AI-generated item's Weapon Skill to a DIFFERENT skill
//      left the OLD label stale and now mismatched with the new
//      weaponSkill value. lib/fileWriter.js's saveItemEntry now
//      recomputes it fresh on every save.
//
// Re-saving is safe and non-destructive: both save functions rebuild
// their derived display fields from the entry's own already-stored
// `raw` content plus (for Survivors) the current portrait URL
// (reconstructed deterministically via getPortraitUrl -- doesn't matter
// whether a portrait actually exists yet, same as every other save
// path), then upsert on the same id, same as a normal edit-form save
// would. Nothing about entry content, relationships, or entry cap usage
// changes -- this is a re-render, not a re-generation.
//
// Usage:
//   node scripts/backfillWorldFlavorLabels.js            # every world
//   node scripts/backfillWorldFlavorLabels.js <worldId>  # just one world
//
// Requires SUPABASE_URL / SUPABASE_SECRET_KEY env vars, same as the server.

const { supabase } = require("../lib/supabaseClient");
const { listEntries } = require("../lib/entriesRepo");
const { saveSurvivorEntry, saveItemEntry, getPortraitUrl } = require("../lib/fileWriter");

async function getAllWorldIds() {
  const { data, error } = await supabase.from("worlds").select("id");
  if (error) throw new Error(`Listing worlds failed: ${error.message}`);
  return (data || []).map((w) => w.id);
}

async function backfillSurvivors(worldId) {
  const survivors = await listEntries(worldId, "survivors");
  let updated = 0;
  let failed = 0;
  for (const manifestEntry of survivors) {
    try {
      const survivor = manifestEntry.raw || manifestEntry;
      const imageUrl = getPortraitUrl(worldId, survivor.id);
      await saveSurvivorEntry(worldId, survivor, imageUrl);
      updated++;
    } catch (err) {
      failed++;
      console.error(`  World ${worldId}, survivor ${manifestEntry.id}: FAILED -- ${err.message}`);
    }
  }
  return { updated, failed, total: survivors.length };
}

async function backfillItems(worldId) {
  const items = await listEntries(worldId, "items");
  const weapons = items.filter((manifestEntry) => {
    const item = manifestEntry.raw || manifestEntry;
    return item.category === "Weapon" && item.weaponSkill;
  });
  let updated = 0;
  let failed = 0;
  for (const manifestEntry of weapons) {
    try {
      const item = manifestEntry.raw || manifestEntry;
      const imageUrl = getPortraitUrl(worldId, item.id);
      await saveItemEntry(worldId, item, imageUrl);
      updated++;
    } catch (err) {
      failed++;
      console.error(`  World ${worldId}, item ${manifestEntry.id}: FAILED -- ${err.message}`);
    }
  }
  return { updated, failed, total: weapons.length };
}

async function main() {
  const argWorldId = process.argv[2];
  const worldIds = argWorldId ? [argWorldId] : await getAllWorldIds();

  console.log(`Backfilling ${worldIds.length} world(s)...`);
  let totals = { survivorsUpdated: 0, survivorsFailed: 0, itemsUpdated: 0, itemsFailed: 0 };

  for (const worldId of worldIds) {
    const survivorResult = await backfillSurvivors(worldId);
    const itemResult = await backfillItems(worldId);
    console.log(`  World ${worldId}: ${survivorResult.updated}/${survivorResult.total} survivors, ${itemResult.updated}/${itemResult.total} weapon items updated.`);
    totals.survivorsUpdated += survivorResult.updated;
    totals.survivorsFailed += survivorResult.failed;
    totals.itemsUpdated += itemResult.updated;
    totals.itemsFailed += itemResult.failed;
  }

  console.log(`\nDone. Survivors: ${totals.survivorsUpdated} updated, ${totals.survivorsFailed} failed. Weapon items: ${totals.itemsUpdated} updated, ${totals.itemsFailed} failed. (${worldIds.length} world(s) total.)`);
  process.exit((totals.survivorsFailed + totals.itemsFailed) > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Backfill script crashed:", err);
  process.exit(1);
});
