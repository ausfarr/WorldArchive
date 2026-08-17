// scripts/testQuestSlotFillRuleset.js
//
// End-to-end verification for the Quest/Campaign Module slot-fill
// ruleset fix -- see
// session_addendum_quest_slot_fill_ruleset_and_background_equipment.md.
// Exercises lib/campaignEntryGenerators.js's createNewEnemy()/
// createNewItem() directly (the function routes/campaignModule.js's
// POST /campaign-modules/generate-slot-entry calls) across all three
// rulesets and, for 5e, all three source tiers -- confirming each branch
// saves through the correct ruleset-specific writer (not the Echoes
// writer unconditionally, which was the bug) and returns the
// {id, name, ...} shape archive/js/campaignModule.js's cmGenerateSlot()
// depends on.
//
// Same fake-Supabase approach as scripts/testEnemyPipeline.js /
// testPipeline.js -- see scripts/lib/fakeSupabase.js's header comment.
process.env.ANTHROPIC_API_KEY = "test-key";

const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (typeof url === "string" && url.includes("anthropic.com")) {
    const body = JSON.parse(opts.body);
    // lib/claude.js's buildCacheableSystemPrompt() returns an array of
    // {type, text, ...} content blocks, not a plain string -- flatten to
    // text before substring-matching which prompt this call came from.
    const sys = Array.isArray(body.system) ? body.system.map((b) => b.text || "").join("\n") : (body.system || "");
    // Homebrew 5e enemy -- unique to buildHomebrewEnemySystemPrompt.
    if (sys.includes("Challenge Rating")) {
      return jsonResponse({
        name: "Slot-Fill Test Wraith", hitPoints: 45, armorClass: 14,
        actions: [{ name: "Claw", toHit: 4, damageDice: "2d6" }],
        traits: [], flavor: "A test monster.", designNotes: "Test."
      });
    }
    // Echoes enemy prompt -- schema line unique to
    // prompts/enemyContentPrompt.js, includes the tier/attributes/
    // combatNotes fields lib/statFormulas.js's attributeBudgetWarning and
    // lib/enemyTemplate.js's buildEnemyBodyHtml both require.
    if (sys.includes(`"tier": "Trash | Elite | Boss"`)) {
      return jsonResponse({
        name: "Slot-Fill Test Result", flavor: "Test flavor.", designNotes: "Test design notes.",
        tier: "Trash", role: "Trash Mob", signatureQuote: null,
        attributes: { body: 5, reflex: 5, knowledge: 5, presence: 5, sanity: 5, fate: 5 },
        abilities: [], phaseChange: null, hexTongue: null,
        combatNotes: { positioning: "Front Row", applies: "", vulnerableTo: "", drops: "" }
      });
    }
    // Everything else -- 5e Reflavor/Homebrew Item, Generic Homebrew
    // Enemy/Item -- shares this plain shape (no tier/attributes, which
    // are Echoes-only fields a real model wouldn't return for these
    // ruleset-specific schemas either).
    return jsonResponse({
      name: "Slot-Fill Test Result",
      flavor: "Reflavored test description.",
      designNotes: "Test design notes.",
      description: "Test description.",
      hitPoints: 30, armorClass: 12, actions: [], traits: [],
      category: "Weapon", rarity: "Uncommon", itemType: "wondrous", valueGp: 100,
      boostsAttribute: null
    });
  }
  return originalFetch(url, opts);
};

function jsonResponse(obj) {
  return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(obj) }] }) };
}

const { install, db } = require("./lib/fakeSupabase");
install();

const { createNewEnemy, createNewItem } = require("../lib/campaignEntryGenerators");
const { getEntry } = require("../lib/entriesRepo");

// Seed one srd_library row for Import/Reflavor tests -- srdLibraryRepo.js
// reads from the "srd_library" table via the same query-builder fake, so
// give it a row shaped the way migrations/020 + ingestion scripts store
// real SRD monsters/items.
db.srd_library = [
  {
    id: "srd-goblin-1", ruleset: "5e", category: "monsters", srd_id: "goblin", name: "Goblin", cr: "1/4",
    source_edition: "5e SRD", license_note: "SRD 5.1 (CC-BY-4.0)",
    data_json: {
      name: "Goblin", size: "Small", type: "humanoid", alignment: "neutral evil",
      armor_class: "15 (leather armor, shield)", hit_points: "7 (2d6)", speed: "30 ft.",
      stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      challenge: "1/4",
      actions: [{ name: "Scimitar.", description: "Melee Weapon Attack: +4 to hit. Hit: 5 (1d6+2) slashing damage." }]
    }
  },
  {
    id: "srd-dagger-1", ruleset: "5e", category: "items", srd_id: "dagger", name: "Dagger",
    source_edition: "5e SRD", license_note: "SRD 5.1 (CC-BY-4.0)",
    data_json: { name: "Dagger", type: "Weapon (simple melee)", rarity: null, desc: ["A simple blade."] }
  }
];

async function run() {
  const results = [];

  function check(label, cond, extra) {
    results.push({ label, pass: !!cond, extra });
  }

  // ---- Echoes world (default ruleset -- world_config row doesn't exist
  // yet, getRuleset() defaults to "echoes") -- confirm ZERO behavior
  // change: still saves via the Echoes writer with the Echoes shape.
  {
    const worldId = "world-echoes";
    const enemy = await createNewEnemy(worldId, { name: "", faction: "preservation", tier: "Trash" });
    const saved = await getEntry(worldId, "enemies", enemy.id);
    check("Echoes enemy has tier (Echoes shape)", saved && saved.raw && saved.raw.tier, saved && saved.raw);
    check("Echoes enemy has NO challengeRating (not 5e shape)", saved && saved.raw && saved.raw.challengeRating === undefined);

    const item = await createNewItem(worldId, { name: "", category: "Weapon" });
    const savedItem = await getEntry(worldId, "items", item.id);
    check("Echoes item has NO srdSourceId field (not 5e shape)", savedItem && savedItem.raw && savedItem.raw.srdSourceId === undefined);
  }

  // ---- 5e world, Homebrew tier ----
  {
    const worldId = "world-5e";
    db.world_config.push({ world_id: worldId, draft_json: {}, ruleset: "5e" });

    const enemy = await createNewEnemy(worldId, { name: "Test Wraith", faction: null, mode: "homebrew" });
    const saved = await getEntry(worldId, "enemies", enemy.id);
    check("5e Homebrew enemy saved with challengeRating (5e shape)", saved && saved.raw && saved.raw.challengeRating && typeof saved.raw.challengeRating.cr !== "undefined", saved && saved.raw);
    check("5e Homebrew enemy has NO tier field (not Echoes shape)", saved && saved.raw && saved.raw.tier === undefined);
    check("5e Homebrew enemy sourceMode is homebrew", saved && saved.raw && saved.raw.sourceMode === "homebrew");

    const item = await createNewItem(worldId, { name: "Test Blade", mode: "homebrew" });
    const savedItem = await getEntry(worldId, "items", item.id);
    check("5e Homebrew item saved with sourceMode homebrew", savedItem && savedItem.raw && savedItem.raw.sourceMode === "homebrew", savedItem && savedItem.raw);

    // ---- 5e world, Import tier (zero AI cost) ----
    const importedEnemy = await createNewEnemy(worldId, { mode: "import", srdLibraryId: "srd-goblin-1" });
    const savedImported = await getEntry(worldId, "enemies", importedEnemy.id);
    check("5e Import enemy sourceMode is import", savedImported && savedImported.raw && savedImported.raw.sourceMode === "import", savedImported && savedImported.raw);
    check("5e Import enemy name matches SRD row", savedImported && savedImported.raw && savedImported.raw.name === "Goblin");

    const importedItem = await createNewItem(worldId, { mode: "import", srdLibraryId: "srd-dagger-1" });
    const savedImportedItem = await getEntry(worldId, "items", importedItem.id);
    check("5e Import item sourceMode is import", savedImportedItem && savedImportedItem.raw && savedImportedItem.raw.sourceMode === "import", savedImportedItem && savedImportedItem.raw);

    // Duplicate import of the same SRD row should be rejected.
    let duplicateRejected = false;
    try {
      await createNewEnemy(worldId, { mode: "import", srdLibraryId: "srd-goblin-1" });
    } catch (err) {
      duplicateRejected = /already imported/.test(err.message);
    }
    check("5e duplicate Import of same SRD monster is rejected", duplicateRejected);

    // ---- 5e world, Reflavor tier ----
    const reflavoredEnemy = await createNewEnemy(worldId, { mode: "reflavor", srdLibraryId: "srd-goblin-1" });
    const savedReflavored = await getEntry(worldId, "enemies", reflavoredEnemy.id);
    check("5e Reflavor enemy sourceMode is reflavor", savedReflavored && savedReflavored.raw && savedReflavored.raw.sourceMode === "reflavor", savedReflavored && savedReflavored.raw);

    const reflavoredItem = await createNewItem(worldId, { mode: "reflavor", srdLibraryId: "srd-dagger-1" });
    const savedReflavoredItem = await getEntry(worldId, "items", reflavoredItem.id);
    check("5e Reflavor item sourceMode is reflavor", savedReflavoredItem && savedReflavoredItem.raw && savedReflavoredItem.raw.sourceMode === "reflavor", savedReflavoredItem && savedReflavoredItem.raw);

    // Missing srdLibraryId should throw a clear error, not silently fall
    // through to Homebrew.
    let missingSrdRejected = false;
    try {
      await createNewEnemy(worldId, { mode: "import" });
    } catch (err) {
      missingSrdRejected = /requires srdLibraryId/.test(err.message);
    }
    check("5e Import with no srdLibraryId is rejected", missingSrdRejected);
  }

  // ---- Generic world ----
  {
    const worldId = "world-generic";
    db.world_config.push({
      world_id: worldId, draft_json: {}, ruleset: "generic",
      generic_system_json: { attributes: [{ key: "might", label: "Might" }], useFormula: false }
    });

    const enemy = await createNewEnemy(worldId, { name: "Test Beast" });
    const saved = await getEntry(worldId, "enemies", enemy.id);
    check("Generic enemy saved with sourceMode homebrew", saved && saved.raw && saved.raw.sourceMode === "homebrew", saved && saved.raw);
    check("Generic enemy has NO tier/challengeRating (not Echoes/5e shape)", saved && saved.raw && saved.raw.tier === undefined && saved.raw.challengeRating === undefined);

    const item = await createNewItem(worldId, { name: "Test Trinket" });
    const savedItem = await getEntry(worldId, "items", item.id);
    check("Generic item saved with sourceMode homebrew", savedItem && savedItem.raw && savedItem.raw.sourceMode === "homebrew", savedItem && savedItem.raw);
  }

  // ---- Generic world with no attribute system configured -- should
  // reject with a clear error rather than crash or silently generate
  // against an empty schema.
  {
    const worldId = "world-generic-unconfigured";
    db.world_config.push({ world_id: worldId, draft_json: {}, ruleset: "generic", generic_system_json: null });
    let rejected = false;
    try {
      await createNewEnemy(worldId, { name: "X" });
    } catch (err) {
      rejected = /hasn't configured its homebrew attribute system/.test(err.message);
    }
    check("Generic enemy with no attribute system is rejected", rejected);
  }

  console.log("\n=== Quest Slot-Fill Ruleset Dispatch — Results ===");
  let allPass = true;
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} — ${r.label}`);
    if (!r.pass) {
      allPass = false;
      if (r.extra !== undefined) console.log("  extra:", JSON.stringify(r.extra));
    }
  }
  console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");
  process.exit(allPass ? 0 : 1);
}

run().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
