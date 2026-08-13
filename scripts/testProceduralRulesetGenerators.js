// scripts/testProceduralRulesetGenerators.js
//
// Standalone test script (repo convention: run directly with `node
// scripts/testProceduralRulesetGenerators.js`, no test runner) for the
// Ruleset Recovery R3 procedural generators
// (lib/proceduralGenerators/5e.js, lib/proceduralGenerators/generic.js).
//
// Same situation every prior session in this sandbox has hit (see
// session_addendum_procedural_generation_shipped.md's "Testing note"):
// no real Supabase project is reachable here, so this script injects a
// small in-memory fake for @supabase/supabase-js's query-builder surface
// (from/select/eq/order/maybeSingle/single/insert/update/upsert -- the
// exact subset lib/entriesRepo.js and lib/worldConfigRepo.js actually
// call) into require.cache BEFORE requiring any real app module, so the
// entire real code path (generator -> formula modules -> ruleset-
// specific save*Entry writer -> buildXBodyHtml) runs completely
// unmodified against fake data. This is a genuine end-to-end run of the
// real write path, not a hand-rolled shape check -- exactly what
// "confirm the write succeeds end to end" requires, adapted to this
// environment's lack of live credentials.
//
// Covers every new ruleset+category combination this session added:
// 5e enemies/classes/items/spells/survivors, generic enemies/classes/
// items/survivors -- 9 generator runs total, each asserting a real
// entries-table row was written with the fields its own *Template.js
// requires present.

const path = require("path");
const Module = require("module");

// ---------- Minimal in-memory Postgrest-like fake ----------

const db = { entries: [], world_config: [] };

function matches(row, filters) {
  return filters.every(([col, val]) => row[col] === val);
}

class FakeQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.op = { type: "select" };
  }
  select() { return this; }
  eq(col, val) { this.filters.push([col, val]); return this; }
  order() { return this; }
  insert(row) { this.op = { type: "insert", row }; return this; }
  update(patch) { this.op = { type: "update", patch }; return this; }
  upsert(row, opts) { this.op = { type: "upsert", row, onConflict: (opts && opts.onConflict) || "" }; return this; }
  maybeSingle() { this._single = "maybe"; return this; }
  single() { this._single = "required"; return this; }

  _run() {
    const rows = db[this.table];
    if (this.op.type === "insert") {
      const row = { ...this.op.row, id: rows.length + 1 };
      rows.push(row);
      return { data: this._single ? row : [row], error: null };
    }
    if (this.op.type === "update") {
      const targets = rows.filter((r) => matches(r, this.filters));
      targets.forEach((r) => Object.assign(r, this.op.patch));
      return { data: this._single ? targets[0] : targets, error: null };
    }
    if (this.op.type === "upsert") {
      const onConflictCols = this.op.onConflict.split(",").map((s) => s.trim()).filter(Boolean);
      const existing = onConflictCols.length
        ? rows.find((r) => onConflictCols.every((c) => r[c] === this.op.row[c]))
        : null;
      let row;
      if (existing) {
        Object.assign(existing, this.op.row);
        row = existing;
      } else {
        row = { ...this.op.row };
        rows.push(row);
      }
      return { data: this._single ? row : [row], error: null };
    }
    // select
    const filtered = rows.filter((r) => matches(r, this.filters));
    if (this._single === "maybe") return { data: filtered[0] || null, error: null };
    if (this._single === "required") return { data: filtered[0], error: filtered[0] ? null : { message: "not found" } };
    return { data: filtered, error: null };
  }

  then(resolve, reject) {
    try {
      resolve(this._run());
    } catch (err) {
      reject(err);
    }
  }
}

const fakeSupabase = {
  from(table) {
    if (!db[table]) db[table] = [];
    return new FakeQuery(table);
  }
};

// Inject the fake in place of the real lib/supabaseClient.js module.
const supabaseClientPath = require.resolve("../lib/supabaseClient");
require.cache[supabaseClientPath] = {
  id: supabaseClientPath,
  filename: supabaseClientPath,
  loaded: true,
  exports: { supabase: fakeSupabase }
};

// ---------- Now safe to require the real app modules ----------

const { upsertWorldConfigRow } = (() => {
  // Seed a world_config row directly (bypassing getOrCreateWorldConfig's
  // insert-if-missing dance) so each fake world starts with a known
  // ruleset/generic_system_json without an extra round trip.
  function upsertWorldConfigRow(worldId, fields) {
    let row = db.world_config.find((r) => r.world_id === worldId);
    if (!row) {
      row = { world_id: worldId };
      db.world_config.push(row);
    }
    Object.assign(row, fields);
    return row;
  }
  return { upsertWorldConfigRow };
})();

function seedFaction(worldId, id, name) {
  db.entries.push({
    world_id: worldId,
    category: "factions",
    entry_id: id,
    name,
    subtitle: null,
    faction: id,
    tags_json: [],
    body_html: "<p></p>",
    raw_json: { id, factionKey: id, name },
    locked: false
  });
}

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${JSON.stringify(detail)})` : ""}`);
    failures.push(label);
  }
}

async function run() {
  const { getEntry } = require("../lib/entriesRepo");

  // ---------- 5e world ----------
  console.log("\n=== 5e ruleset ===");
  const world5e = "world-5e-test";
  upsertWorldConfigRow(world5e, { ruleset: "5e", draft_json: {} });
  seedFaction(world5e, "riverguard", "The Riverguard");

  const { generate5eEnemyProcedurally, generate5eClassProcedurally, generate5eItemProcedurally, generate5eSpellProcedurally, generate5eSurvivorProcedurally } = require("../lib/proceduralGenerators/5e");
  const { save5eEnemyEntry } = require("../lib/rulesets/5e/enemyRepo");
  const { save5eClassEntry } = require("../lib/rulesets/5e/classRepo");
  const { save5eItemEntry } = require("../lib/rulesets/5e/itemRepo");
  const { save5eSpellEntry } = require("../lib/rulesets/5e/spellRepo");
  const { save5eSurvivorEntry } = require("../lib/rulesets/5e/survivorRepo");

  console.log("\n5e Enemies:");
  const enemy = await generate5eEnemyProcedurally(world5e);
  await save5eEnemyEntry(world5e, enemy, null);
  const savedEnemy = await getEntry(world5e, "enemies", enemy.id);
  check("enemy saved with a name", !!(savedEnemy && savedEnemy.name));
  check("enemy has computed challengeRating.cr", !!(savedEnemy.raw.challengeRating && savedEnemy.raw.challengeRating.cr), savedEnemy.raw.challengeRating);
  check("enemy bodyHtml rendered", !!(savedEnemy.bodyHtml && savedEnemy.bodyHtml.includes("Challenge")));
  check("enemy ruleset tagged 5e", savedEnemy.ruleset === "5e");

  console.log("\n5e Classes:");
  const cls = await generate5eClassProcedurally(world5e);
  await save5eClassEntry(world5e, cls, null);
  const savedClass = await getEntry(world5e, "classes", cls.id);
  check("class saved with a name", !!(savedClass && savedClass.name));
  check("class has subclassUnlockLevel set by code", typeof savedClass.raw.subclassUnlockLevel === "number");
  check("class bodyHtml rendered a level table", savedClass.bodyHtml.includes("Class Table"));

  console.log("\n5e Items:");
  const item = await generate5eItemProcedurally(world5e);
  await save5eItemEntry(world5e, item, null);
  const savedItem = await getEntry(world5e, "items", item.id);
  check("item saved with a name", !!(savedItem && savedItem.name));
  check("item bodyHtml rendered", !!savedItem.bodyHtml);

  console.log("\n5e Spells:");
  const spell = await generate5eSpellProcedurally(world5e);
  await save5eSpellEntry(world5e, spell);
  const savedSpell = await getEntry(world5e, "spells", spell.id);
  check("spell saved with a name", !!(savedSpell && savedSpell.name));
  check("spell level is 0-9", savedSpell.level >= 0 && savedSpell.level <= 9);

  console.log("\n5e Survivors (needs a real Class first):");
  const pc = await generate5eSurvivorProcedurally(world5e);
  await save5eSurvivorEntry(world5e, pc, null);
  const savedPc = await getEntry(world5e, "survivors", pc.id);
  check("PC saved with a name", !!(savedPc && savedPc.name));
  check("PC classes[] references the real class rolled earlier", Array.isArray(savedPc.raw.classes) && savedPc.raw.classes.length > 0 && (savedPc.raw.classes[0].classId === cls.id || db.entries.some((e) => e.category === "classes" && e.entry_id === savedPc.raw.classes[0].classId)));
  check("PC hitPoints computed (not model/table-invented)", typeof savedPc.raw.hitPoints === "number" && savedPc.raw.hitPoints > 0);

  console.log("\n5e Survivors with NO classes yet (fresh world) should throw a clear error:");
  const emptyWorld = "world-5e-empty";
  upsertWorldConfigRow(emptyWorld, { ruleset: "5e" });
  try {
    await generate5eSurvivorProcedurally(emptyWorld);
    check("throws when world has no classes", false);
  } catch (err) {
    check("throws when world has no classes", /no Classes yet/i.test(err.message), err.message);
  }

  // ---------- Generic world ----------
  console.log("\n=== generic ruleset ===");
  const worldGeneric = "world-generic-test";
  const genericSystem = {
    useFormula: true,
    attributes: [{ key: "might", label: "Might" }, { key: "grit", label: "Grit" }, { key: "wit", label: "Wit" }],
    derivedStats: [{ key: "vitality", label: "Vitality", attributeKey: "grit", coefficient: 3, base: 10 }]
  };
  upsertWorldConfigRow(worldGeneric, { ruleset: "generic", generic_system_json: genericSystem, draft_json: {} });
  seedFaction(worldGeneric, "wardens", "The Wardens");

  const { generateGenericEnemyProcedurally, generateGenericClassProcedurally, generateGenericItemProcedurally, generateGenericSurvivorProcedurally } = require("../lib/proceduralGenerators/generic");
  const { saveGenericEnemyEntry } = require("../lib/rulesets/generic/enemyRepo");
  const { saveGenericClassEntry } = require("../lib/rulesets/generic/classRepo");
  const { saveGenericItemEntry } = require("../lib/rulesets/generic/itemRepo");
  const { saveGenericSurvivorEntry } = require("../lib/rulesets/generic/survivorRepo");

  console.log("\nGeneric Enemies:");
  const gEnemy = await generateGenericEnemyProcedurally(worldGeneric, genericSystem);
  await saveGenericEnemyEntry(worldGeneric, gEnemy, genericSystem, null);
  const savedGEnemy = await getEntry(worldGeneric, "enemies", gEnemy.id);
  check("generic enemy saved", !!(savedGEnemy && savedGEnemy.name));
  check("generic enemy attributes use only this world's keys", Object.keys(savedGEnemy.raw.attributes).every((k) => ["might", "grit", "wit"].includes(k)), savedGEnemy.raw.attributes);
  check("generic enemy derivedStats computed by code", savedGEnemy.raw.derivedStats && savedGEnemy.raw.derivedStats.vitality === 10 + 3 * savedGEnemy.raw.attributes.grit, savedGEnemy.raw.derivedStats);

  console.log("\nGeneric Classes (narrative-first, no leveling):");
  const gCls = await generateGenericClassProcedurally(worldGeneric, genericSystem);
  await saveGenericClassEntry(worldGeneric, gCls, genericSystem, null);
  const savedGClass = await getEntry(worldGeneric, "classes", gCls.id);
  check("generic class saved", !!(savedGClass && savedGClass.name));
  check("generic class has no invented numeric level field", savedGClass.raw.level === undefined && savedGClass.raw.casterType === undefined);

  console.log("\nGeneric Items (narrative-first):");
  const gItem = await generateGenericItemProcedurally(worldGeneric, genericSystem);
  await saveGenericItemEntry(worldGeneric, gItem, genericSystem, null);
  const savedGItem = await getEntry(worldGeneric, "items", gItem.id);
  check("generic item saved", !!(savedGItem && savedGItem.name));
  check("generic item has no invented rarity/value field", savedGItem.raw.rarity === undefined && savedGItem.raw.valueGp === undefined);

  console.log("\nGeneric Survivors (needs a real Class first):");
  const gPc = await generateGenericSurvivorProcedurally(worldGeneric, genericSystem);
  await saveGenericSurvivorEntry(worldGeneric, gPc, genericSystem, null);
  const savedGPc = await getEntry(worldGeneric, "survivors", gPc.id);
  check("generic PC saved", !!(savedGPc && savedGPc.name));
  check("generic PC derivedStats computed by code", savedGPc.raw.derivedStats && savedGPc.raw.derivedStats.vitality === 10 + 3 * savedGPc.raw.attributes.grit, savedGPc.raw.derivedStats);

  console.log("\nGeneric Survivors with no attribute system configured should throw:");
  const worldGenericUnset = "world-generic-unset";
  upsertWorldConfigRow(worldGenericUnset, { ruleset: "generic", generic_system_json: null });
  try {
    await generateGenericSurvivorProcedurally(worldGenericUnset, null);
    check("throws when generic system unset", false);
  } catch (err) {
    check("throws when generic system unset", true);
  }

  // ---------- Genre awareness ----------
  // Every new procedural table carries a `genre` field per row -- verify
  // filtering actually EXCLUDES rows, not just that it runs without
  // crashing (a bug here would silently draw from the full pool
  // regardless of the world's detected genre, defeating the point).
  console.log("\n=== genre awareness ===");
  const enemies5eTable = require("../data/proceduralTables/5e/enemies.json");
  const enemiesGenericTable = require("../data/proceduralTables/generic/enemies.json");

  function tagsFor(pool, value) {
    const row = pool.find((r) => r.value === value);
    return (row && row.genre) || ["universal"];
  }

  console.log("\n5e Enemies, scifi-flagged world (15x):");
  const worldScifi = "world-5e-scifi";
  upsertWorldConfigRow(worldScifi, { ruleset: "5e", draft_json: { "1": { genre: "Hard Sci-Fi" } } });
  let sawNonUniversalScifi = false;
  let allEpithetsEligible = true;
  for (let i = 0; i < 15; i++) {
    const e = await generate5eEnemyProcedurally(worldScifi);
    const epithet = e.name.split(" ")[0];
    const tags = tagsFor(enemies5eTable.nameEpithets, epithet);
    if (tags.includes("scifi")) sawNonUniversalScifi = true;
    if (!tags.includes("scifi") && !tags.includes("universal")) allEpithetsEligible = false;
  }
  check("scifi world draws real scifi-tagged epithets, not just universal ones", sawNonUniversalScifi);
  check("scifi world never draws a fantasy/post_apoc/modern/horror-only epithet", allEpithetsEligible);

  console.log("\n5e Enemies, fantasy-flagged world (15x):");
  const worldFantasyGenre = "world-5e-fantasy-genre";
  upsertWorldConfigRow(worldFantasyGenre, { ruleset: "5e", draft_json: { "1": { genre: "High Fantasy" } } });
  let sawFantasyOnly = false;
  for (let i = 0; i < 15; i++) {
    const e = await generate5eEnemyProcedurally(worldFantasyGenre);
    const epithet = e.name.split(" ")[0];
    const tags = tagsFor(enemies5eTable.nameEpithets, epithet);
    if (tags.includes("fantasy") && !tags.includes("scifi")) sawFantasyOnly = true;
  }
  check("fantasy world draws real fantasy-tagged epithets", sawFantasyOnly);

  console.log("\n5e Enemies, unrecognized genre falls back to the full pool:");
  const worldUnknownGenre = "world-5e-unknown-genre";
  upsertWorldConfigRow(worldUnknownGenre, { ruleset: "5e", draft_json: { "1": { genre: "Something I Made Up That Matches No Keyword" } } });
  const eUnknown = await generate5eEnemyProcedurally(worldUnknownGenre);
  check("unrecognized genre still produces a valid enemy (fails open to full pool)", !!(eUnknown && eUnknown.name));

  console.log("\nGeneric Enemies, this world's own genre (10x):");
  const worldGenericHorror = "world-generic-horror";
  upsertWorldConfigRow(worldGenericHorror, { ruleset: "generic", generic_system_json: genericSystem, draft_json: { "1": { genre: "Cosmic Horror" } } });
  let sawHorrorOnly = false;
  for (let i = 0; i < 10; i++) {
    const e = await generateGenericEnemyProcedurally(worldGenericHorror, genericSystem);
    const epithet = e.name.split(" ")[0];
    const tags = tagsFor(enemiesGenericTable.nameEpithets, epithet);
    if (tags.includes("horror") && !tags.includes("scifi") && !tags.includes("post_apoc")) sawHorrorOnly = true;
  }
  check("generic enemy generation is genre-aware too, not just 5e", sawHorrorOnly);

  console.log("\nSame world, two different genres produce visibly different flavor (regression guard for the original 'always sounds post-apoc' bug):");
  const worldSwap = "world-5e-genre-swap";
  upsertWorldConfigRow(worldSwap, { ruleset: "5e", draft_json: { "1": { genre: "High Fantasy" } } });
  const beforeSwap = await generate5eEnemyProcedurally(worldSwap);
  upsertWorldConfigRow(worldSwap, { draft_json: { "1": { genre: "Hard Sci-Fi" } } });
  const namesAfterSwap = [];
  for (let i = 0; i < 10; i++) namesAfterSwap.push((await generate5eEnemyProcedurally(worldSwap)).actions[0].name);
  check("changing a world's genre changes procedural flavor output (not stuck on one vocabulary)", namesAfterSwap.some((n) => n !== beforeSwap.actions[0].name), { before: beforeSwap.actions[0].name, after: namesAfterSwap });

  // ---------- Summary ----------
  console.log(`\n${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILURE(S)`}`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("Test script crashed:", err);
  process.exitCode = 1;
});
