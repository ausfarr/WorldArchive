// scripts/testSyncReciprocalRelationshipsFactionKey.js
//
// Regression test for the bug fixed in
// lib/factionDeepLore.js#syncReciprocalRelationships: it wrote
// `factionKey: target.id` onto the TARGET faction it was splicing a
// reciprocal relationship into, instead of `target.faction || target.id`
// -- the fallback every other faction-matching-key computation in this
// file (generateFactionDeepLore) and lib/worldFlavor.js#getFactionOptions
// already uses.
//
// A faction's archive `.id` (its dossier-URL slug) and its `.faction`
// matching key (what every OTHER entry's own `faction` field must equal
// to be counted toward that faction's Roundup) can legitimately differ --
// documented in worldFlavor.js as a real, live case for Austin's migrated
// Echoes world (`ferro_kings` matching key vs. `the-ferro-kings` slug).
// Regenerating/confirming ANY faction with a relationship pointing at
// such a faction silently overwrote its real matching key with its slug
// -- the save itself succeeds with no error, but every entry already
// tagged `faction: "ferro_kings"` instantly drops out of that faction's
// Roundup and out of faction-grounded generation context, with nothing
// in the UI or logs pointing at why.
//
// Standalone per repo convention (CLAUDE.md's scripts/ note) -- run
// directly with `node scripts/testSyncReciprocalRelationshipsFactionKey.js`.
// Uses the same in-memory fakeSupabase scripts/testPipeline.js shares, so
// no real Supabase/Anthropic credentials are needed.

const { install, db } = require("./lib/fakeSupabase");
install();

const { syncReciprocalRelationships } = require("../lib/factionDeepLore");

const WORLD_ID = "11111111-1111-1111-1111-111111111111";

function seedFaction({ id, name, factionKey, npcCount }) {
  const now = new Date().toISOString();
  // raw_json mirrors the real shape lib/fileWriter.js#saveFactionEntry
  // writes: entryMeta.raw holds the Deep Lore content object one level
  // down (see entriesRepo.js#upsertEntry storing the WHOLE entryMeta as
  // raw_json, and rowToFullEntry spreading it back so `.raw` survives as
  // a nested field on the reconstructed entry) -- readFactionEntry()'s
  // caller in syncReciprocalRelationships reads `targetEntry.raw.corePhilosophy`
  // for exactly this reason.
  const raw = {
    id,
    factionKey,
    name,
    nickname: name,
    territory: "Some territory.",
    corePhilosophy: "Some philosophy.",
    relationships: []
  };
  db.entries.push({
    world_id: WORLD_ID,
    category: "factions",
    entry_id: id,
    name,
    subtitle: `Epithet: "${name}"`,
    faction: factionKey,
    tags_json: [],
    body_html: "<p>Existing Deep Lore.</p>",
    raw_json: { id, name, faction: factionKey, factionKey, tags: [], raw },
    locked: false,
    created_at: now,
    updated_at: now
  });

  for (let i = 0; i < npcCount; i++) {
    db.entries.push({
      world_id: WORLD_ID,
      category: "npcs",
      entry_id: `${id}-npc-${i}`,
      name: `${name} Member ${i}`,
      subtitle: null,
      faction: factionKey, // tagged with the REAL matching key, not the slug
      tags_json: [],
      body_html: "<p>NPC body.</p>",
      raw_json: { id: `${id}-npc-${i}`, name: `${name} Member ${i}` },
      locked: false,
      created_at: now,
      updated_at: now
    });
  }
}

async function main() {
  let failures = 0;

  // Faction B: legacy-migrated world where the slug and matching key
  // diverge, same as Austin's Echoes world (ferro_kings vs the-ferro-kings).
  seedFaction({ id: "the-ferro-kings", name: "The Ferro-Kings", factionKey: "ferro_kings", npcCount: 2 });
  // Faction A: has a relationship naming Faction B, triggering the sync.
  seedFaction({ id: "the-board", name: "The Board", factionKey: "the-board", npcCount: 0 });

  const factionA = {
    id: "the-board",
    name: "The Board",
    relationships: [{ faction: "The Ferro-Kings", stance: "Rivals", why: "Resource dispute." }]
  };

  await syncReciprocalRelationships(WORLD_ID, factionA);

  const savedTarget = db.entries.find((e) => e.world_id === WORLD_ID && e.category === "factions" && e.entry_id === "the-ferro-kings");
  const preservedMatchingKey = savedTarget.faction === "ferro_kings";
  console.log(`Target faction's .faction matching key preserved as 'ferro_kings': ${preservedMatchingKey} (got '${savedTarget.faction}')`);
  if (!preservedMatchingKey) failures++;

  const npcsStillTagged = db.entries.filter((e) => e.category === "npcs" && e.faction === "ferro_kings").length;
  console.log(`Both Ferro-Kings NPCs still tagged with the preserved matching key: ${npcsStillTagged === 2}`);
  if (npcsStillTagged !== 2) failures++;

  const relationshipSpliced = ((savedTarget.raw_json.raw || {}).relationships || []).some((r) => r.faction === "The Board");
  console.log(`Reciprocal relationship to The Board was spliced in: ${relationshipSpliced}`);
  if (!relationshipSpliced) failures++;

  if (failures > 0) {
    console.error(`\nFAILED: ${failures} check(s) did not pass.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error("Test threw:", err);
  process.exit(1);
});
