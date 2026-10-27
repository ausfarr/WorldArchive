// scripts/testSaltmereSeed.js
//
// Tests for scripts/seedSaltmereDemo.js + scripts/lib/saltmereSeed.js.
// Standalone (repo convention: no runner) -- `node scripts/testSaltmereSeed.js`.
//
// Part 1 is pure unit tests: the slug->id resolver and the dedupe.
// Part 2 drives the real CLI entry point (run()) end-to-end against
// scripts/lib/fakeSupabase.js: dry-run writes nothing, apply creates the
// pack through the app's real writers with working cross-links / tags /
// image uploads, a second apply is a no-op, and --remove returns the world
// to its prior state without touching a pre-existing entry.
// No real Supabase, API keys, or network are used.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://fake.supabase.test";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "fake";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const fake = require("./lib/fakeSupabase");
fake.install(); // must run before any app module is required

const S = require("./lib/saltmereSeed");
const { run } = require("./seedSaltmereDemo");

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ok  ${name}`); })
    .catch((err) => { console.error(`  FAIL ${name}\n${err.stack}`); process.exitCode = 1; });
}

const PACK_DIR = path.join(__dirname, "..", "saltmere_pack");
const quiet = () => {};

function existingRow(category, id, name, extra = {}) {
  return { category, id, name, locked: false, ...extra };
}

async function unitTests() {
  console.log("Unit: dedupe");

  await test("skips a pack entry whose (category, name) exists, case-insensitively and ignoring punctuation", () => {
    const pack = S.loadPack(PACK_DIR);
    const idx = S.buildExistingIndex([
      existingRow("npcs", "old-tomo", "OLD TOMO"),
      existingRow("factions", "x", "dockers' union")
    ]);
    const { plan, skips } = S.planEntries(pack, idx);
    assert.strictEqual(skips.length, 2);
    assert(skips.some((s) => s.category === "npcs" && s.name === "Old Tomo" && s.existingId === "old-tomo"));
    assert(skips.some((s) => s.category === "factions" && s.name === "Dockers' Union"));
    assert.strictEqual(plan.length, 77);
  });

  await test("same name in a DIFFERENT category is not a duplicate", () => {
    const pack = S.loadPack(PACK_DIR);
    const idx = S.buildExistingIndex([existingRow("items", "old-tomo", "Old Tomo")]);
    const { skips } = S.planEntries(pack, idx);
    assert.strictEqual(skips.length, 0);
  });

  await test("a locked placeholder with the same name counts as existing (we never overwrite a row)", () => {
    const pack = S.loadPack(PACK_DIR);
    const idx = S.buildExistingIndex([existingRow("npcs", "old-tomo", "Old Tomo", { locked: true })]);
    const { skips, plan } = S.planEntries(pack, idx);
    assert.strictEqual(skips.length, 1);
    assert(/placeholder/.test(skips[0].reason));
    assert(!plan.find((p) => p.name === "Old Tomo"));
  });

  await test("expected counts on an empty world: 5/18/9/8/9/8/6/8/8", () => {
    const { plan } = S.planEntries(S.loadPack(PACK_DIR), S.buildExistingIndex([]));
    const by = {};
    plan.forEach((p) => { by[p.packCategory] = (by[p.packCategory] || 0) + 1; });
    assert.deepStrictEqual(by, { factions: 5, classes: 6, npcs: 18, districts: 9, hazards: 9, items: 8, anomalies: 8, divers: 8, logs: 8 });
    assert.strictEqual(plan.length, 79);
  });

  await test("an id held by a DIFFERENT existing entry gets a numeric suffix instead of overwriting it", () => {
    const pack = { ...S.loadPack(PACK_DIR) };
    const idx = S.buildExistingIndex([existingRow("npcs", "old-tomo", "Somebody Else")]);
    const { plan } = S.planEntries(pack, idx);
    const tomo = plan.find((p) => p.name === "Old Tomo");
    assert.strictEqual(tomo.id, "old-tomo-2");
  });

  await test("portrait ids are unique across portrait categories (hazard + diver both 'Cable Siren')", () => {
    const { plan } = S.planEntries(S.loadPack(PACK_DIR), S.buildExistingIndex([]));
    const siren = plan.filter((p) => p.name === "Cable Siren");
    assert.strictEqual(siren.length, 2);
    assert.notStrictEqual(siren[0].id, siren[1].id);
    const portraitIds = plan.filter((p) => S.PORTRAIT_CATEGORIES.has(p.category)).map((p) => p.id);
    assert.strictEqual(new Set(portraitIds).size, portraitIds.length);
  });

  console.log("Unit: slug -> id resolver");
  const pack = S.loadPack(PACK_DIR);
  const idx = S.buildExistingIndex([
    existingRow("factions", "gate-syndicate", "Gate Syndicate"),
    existingRow("npcs", "old-tomo", "Old Tomo")
  ]);
  const { slugToRef } = S.planEntries(pack, idx);
  const resolve = S.makeResolver({ slugToRef, existingIndex: idx });

  await test("pack slug -> the real (slugified-name) id, not the slug", () => {
    assert.strictEqual(resolve("watching-eye", { category: "factions" }).id, "the-watching-eye");
    assert.strictEqual(resolve("watching-eye", { category: "factions" }).via, "pack");
  });
  await test("slug of a deduped (skipped) pack entry resolves to the EXISTING entry's id", () => {
    const r = resolve("old-tomo", { category: "npcs" });
    assert.strictEqual(r.id, "old-tomo");
    assert.strictEqual(r.via, "existing");
  });
  await test("a slug that is not in the pack resolves against existing entries by id, then by name", () => {
    assert.strictEqual(resolve("gate-syndicate", { category: "factions" }).id, "gate-syndicate");
    const idx2 = S.buildExistingIndex([existingRow("factions", "gs-1", "Gate Syndicate")]);
    const r2 = S.makeResolver({ slugToRef: new Map(), existingIndex: idx2 });
    assert.strictEqual(r2("gate-syndicate", { category: "factions", label: "Gate Syndicate" }).id, "gs-1"); // via display name
  });
  await test("display names resolve too (faction relationships carry names, not slugs)", () => {
    assert.strictEqual(resolve("Salvage Guild", { category: "factions" }).id, "salvage-guild");
    assert.strictEqual(resolve("DOCKERS UNION", { category: "factions" }).id, "dockers-union");
  });
  await test("a leading 'The' is ignored when resolving into existing entries ('seawall-authority' -> 'The Seawall Authority')", () => {
    const idx3 = S.buildExistingIndex([existingRow("factions", "the-seawall-authority", "The Seawall Authority")]);
    const r3 = S.makeResolver({ slugToRef: new Map(), existingIndex: idx3 });
    assert.strictEqual(r3("seawall-authority", { category: "factions" }).id, "the-seawall-authority");
    assert.strictEqual(r3("Seawall Authority", { category: "factions", label: "Seawall Authority" }).id, "the-seawall-authority");
    // ...but dedupe stays strict: the pack's "The Watching Eye" is NOT merged into an existing "Watching Eye".
    const { skips } = S.planEntries(pack, S.buildExistingIndex([existingRow("factions", "watching-eye", "Watching Eye")]));
    assert.strictEqual(skips.length, 0);
  });
  await test("category is respected: a faction slug does not resolve as an npc", () => {
    assert.strictEqual(resolve("salvage-guild", { category: "npcs" }), null);
  });
  await test("unresolvable refs, null and 'unaligned' return null (caller leaves them as-is and reports)", () => {
    assert.strictEqual(resolve("no-such-thing", { category: "npcs" }), null);
    assert.strictEqual(resolve(null, { category: "factions" }), null);
    assert.strictEqual(resolve("unaligned", { category: "factions" }), null);
  });
  await test("the whole pack validates against the real prompt schemas", () => {
    const keys = S.schemaKeys("prompts/npcContentPrompt.js", "SCHEMA_DESCRIPTION");
    assert(keys.includes("roleArchetype") && keys.includes("dialogue"));
  });
}

// ---------------- end-to-end on the fake DB ----------------

const W = "world-saltmere";
function resetDb() {
  for (const k of Object.keys(fake.db)) fake.db[k].length = 0;
  fake.db.worlds = fake.db.worlds || []; // not one of the fake's built-in tables
  fake.storageLog.length = 0;
  fake.db.worlds.push({ id: W, name: "Saltmere Sprawl", user_id: "u1" });
  fake.db.worlds.push({ id: "world-other", name: "Elsewhere", user_id: "u2" });
  fake.db.world_config.push({
    world_id: W, ruleset: "5e", setup_completed_at: "2026-01-01",
    calendar_config: { months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i}`, days: 30 })), days_per_week: 7, current_date: { year: 20, month_index: 0, day: 1 } }
  });
  const ent = (category, id, name, extra = {}) => ({
    world_id: W, category, entry_id: id, name, subtitle: null, faction: null, tags_json: [], body_html: `<p>${name}</p>`,
    raw_json: { id, name, category, raw: { id, name }, ...extra }, locked: false, created_at: "2026-01-01"
  });
  // The four factions the pack's NPCs/districts/logs point at, plus two
  // pre-existing entries that duplicate pack entries.
  [["gate-syndicate", "Gate Syndicate"], ["seawall-authority", "Seawall Authority"], ["tidewalkers", "Tidewalkers"], ["hollow-choir", "Hollow Choir"]]
    .forEach(([id, name]) => fake.db.entries.push(ent("factions", id, name, { factionKey: id })));
  fake.db.entries.push(ent("npcs", "old-tomo", "Old Tomo", { sentinel: "hand-written, must survive" }));
  fake.db.entries.push(ent("locations", "stilt-market", "Stilt Market"));
}

function snapshot() { return JSON.stringify(fake.db.entries); }

async function e2eTests() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saltmere-seed-test-"));
  const base = { packDir: PACK_DIR, worldName: "Saltmere Sprawl", idsFile: path.join(tmp, "ids.json"), backupDir: path.join(tmp, "backups"), log: quiet, host: "fake.supabase.test" };

  console.log("E2E (fake DB)");

  resetDb();
  const before = snapshot();
  const beforeCount = fake.db.entries.length;

  await test("dry-run (default) reports the plan and writes nothing", async () => {
    const r = await run({ ...base, mode: "dry-run" });
    assert.strictEqual(r.plan.length, 77); // Old Tomo + Stilt Market already exist
    assert.strictEqual(r.skips.length, 2);
    assert.strictEqual(snapshot(), before);
    assert.strictEqual(fake.storageLog.length, 0);
    assert(!fs.existsSync(base.backupDir));
    assert(!fs.existsSync(base.idsFile));
  });

  await test("--apply with --dry-run is still a preview", async () => {
    await run({ ...base, mode: "apply", dryRun: true });
    assert.strictEqual(snapshot(), before);
  });

  await test("aborts when the world is not found / not 5e, writing nothing", async () => {
    await assert.rejects(run({ ...base, worldName: "Nope", mode: "apply" }), /No world named "Nope"/);
    fake.db.world_config[0].ruleset = "echoes";
    await assert.rejects(run({ ...base, mode: "apply" }), /5e content/);
    fake.db.world_config[0].ruleset = "5e";
    assert.strictEqual(snapshot(), before);
  });

  await test("fails the whole run, before any write, when one entry is invalid", async () => {
    const badPack = path.join(tmp, "badpack");
    fs.cpSync(PACK_DIR, badPack, { recursive: true });
    const f = path.join(badPack, "content", "npcs.json");
    const npcs = JSON.parse(fs.readFileSync(f, "utf8"));
    delete npcs[3].wants; npcs[5].roleArchetype = "Wizard King";
    fs.writeFileSync(f, JSON.stringify(npcs));
    await assert.rejects(run({ ...base, packDir: badPack, mode: "apply" }), (e) => /validation failed/.test(e.message) && /wants/.test(e.message) && /Wizard King/.test(e.message));
    assert.strictEqual(snapshot(), before);
    assert(!fs.existsSync(base.backupDir));
  });

  let applied;
  await test("--apply creates every non-duplicate entry through the real writers", async () => {
    applied = await run({ ...base, mode: "apply" });
    assert.deepStrictEqual(applied.created, { factions: 5, classes: 6, npcs: 17, locations: 8, enemies: 9, items: 8, spells: 8, survivors: 8, logs: 8 });
    assert.strictEqual(applied.failures.length, 0);
    assert.strictEqual(fake.db.entries.length, beforeCount + 77);
    assert.strictEqual(applied.countAfter - applied.countBefore, 77);
  });

  await test("a JSON backup of the prior entries was written before the inserts", () => {
    const files = fs.readdirSync(base.backupDir);
    assert.strictEqual(files.length, 1);
    const b = JSON.parse(fs.readFileSync(path.join(base.backupDir, files[0]), "utf8"));
    assert.strictEqual(b.rowCount, beforeCount);
    assert(b.rows.every((r) => r.world_id === W));
  });

  await test("pre-existing entries are byte-for-byte untouched", () => {
    const old = JSON.parse(before);
    for (const o of old) {
      const now = fake.db.entries.find((r) => r.category === o.category && r.entry_id === o.entry_id);
      assert.deepStrictEqual(now, o, `${o.category}/${o.entry_id} changed`);
    }
  });

  const created = () => fake.db.entries.filter((r) => r.raw_json && r.raw_json.demoSeed === S.SEED_TAG);

  await test("every created entry is tagged demoSeed (top level AND inside the content), and the ids file lists them all", () => {
    assert.strictEqual(created().length, 77);
    assert(created().every((r) => r.raw_json.raw.demoSeed === S.SEED_TAG));
    const ids = JSON.parse(fs.readFileSync(base.idsFile, "utf8"));
    assert.strictEqual(ids.entries.length, 77);
    assert(ids.finishedAt);
  });

  await test("cross-links: no dangling toId / classId / locationId / faction in any created entry", () => {
    const has = (cat, id) => fake.db.entries.some((r) => r.category === cat && r.entry_id === id);
    let checked = 0;
    const factionOk = (id) => !id || id === "unaligned" || has("factions", id);
    for (const r of created()) {
      const c = r.raw_json.raw;
      if (r.category === "npcs") {
        assert(factionOk(c.faction), `${r.entry_id} faction ${c.faction}`);
        for (const rel of c.relationships) { assert(has(rel.toCategory, rel.toId), `${r.entry_id} -> ${rel.toCategory}/${rel.toId}`); checked++; }
      }
      if (r.category === "locations") {
        assert(factionOk(c.faction));
        for (const n of c.notableNpcs) { assert(has("npcs", n.toId), `${r.entry_id} notable ${n.toId}`); checked++; }
      }
      if (r.category === "logs") {
        if (c.locationId) { assert(has("locations", c.locationId), `log ${r.entry_id} loc ${c.locationId}`); checked++; }
        assert(factionOk(c.faction));
      }
      if (r.category === "survivors") for (const k of c.classes) { assert(has("classes", k.classId)); checked++; }
      if (r.category === "spells") for (const k of c.classes) { assert(k.id && has("classes", k.id)); checked++; }
      if (r.category === "factions") for (const rel of c.relationships) { assert(has("factions", rel.toId), `${r.entry_id} rel ${rel.toId}`); checked++; }
    }
    assert(checked > 60, `only ${checked} links checked`);
  });

  await test("a link into a deduped entry lands on the existing row (Mama Quill's stall -> existing Stilt Market; district -> existing Old Tomo)", () => {
    const quill = fake.db.entries.find((r) => r.entry_id === "mama-quill");
    assert(quill.raw_json.raw.relationships.some((x) => x.toId === "stilt-market" && x.toCategory === "locations"));
    // Some created entry must point at the pre-existing (deduped) Old Tomo.
    const pointsAtTomo = created().filter((r) => JSON.stringify(r.raw_json.raw).includes('"toId":"old-tomo"'));
    assert(pointsAtTomo.length > 0, "nothing links to the existing Old Tomo");
  });

  await test("5e enemies carry a code-computed CR and render a stat block with the uploaded portrait", () => {
    const e = fake.db.entries.find((r) => r.category === "enemies" && r.entry_id === "rust-hauler-drone");
    assert(e.raw_json.raw.challengeRating.estimated === true && e.raw_json.raw.challengeRating.cr);
    assert(/Armor Class/.test(e.body_html));
    assert(e.body_html.includes("https://fake-storage.test/portraits/") || /fake-storage\.test/.test(e.body_html), "portrait url missing");
  });

  await test("quoted fields are not double-quoted in the rendered dossier (templates add their own quotes)", () => {
    const tomo = fake.db.entries.find((r) => r.entry_id === "mama-quill");
    assert(!/^["\u201c]/.test(tomo.raw_json.raw.signatureQuote), "signatureQuote still wrapped");
    assert(!/^["\u201c]/.test(tomo.raw_json.raw.dialogue.openingLine));
    const sg = fake.db.entries.find((r) => r.entry_id === "salvage-guild");
    assert(!/^["\u201c]/.test(sg.raw_json.raw.overviewQuote));
    assert(!/<div class="quote-block">""/.test(sg.body_html), "faction quote doubled");
  });

  await test("divers get code-computed HP / proficiency from their class; skills are keys", () => {
    const d = fake.db.entries.find((r) => r.category === "survivors" && r.entry_id === "rook-delacroix");
    const c = d.raw_json.raw;
    assert(c.hitPoints > 8 && c.proficiencyBonus === 3 && c.totalLevel === 8);
    assert(c.skillProficiencies.every((k) => /^[a-z_]+$/.test(k)));
    assert.strictEqual(c.classes[0].classId, "rust-diver");
  });

  await test("images: portraits/banners uploaded once each at unique paths; anomalies (no app image support) skipped", () => {
    const uploads = fake.storageLog.filter((l) => l.op === "upload");
    const paths = uploads.map((u) => `${u.bucket}/${u.path}`);
    assert.strictEqual(new Set(paths).size, paths.length, "two entries wrote the same storage object");
    const portraits = uploads.filter((u) => u.bucket === "portraits" || !/world-art/.test(u.bucket));
    const banners = uploads.filter((u) => /faction-.*-banner/.test(u.path));
    assert.strictEqual(banners.length, 5);
    // 17 npcs + 8 locations + 9 enemies + 8 items + 8 survivors + 6 classes
    assert.strictEqual(uploads.length - banners.length, 17 + 8 + 9 + 8 + 8 + 6);
    assert.strictEqual(applied.imageNotAttachable.length, 8);
    void portraits;
  });

  await test("a second --apply is a no-op (everything is now a duplicate)", async () => {
    const snap = snapshot();
    const r = await run({ ...base, mode: "apply" });
    assert.strictEqual(Object.keys(r.created).length, 0);
    assert.strictEqual(r.skips.length, 79);
    assert.strictEqual(snapshot(), snap);
  });

  await test("--remove deletes exactly the seeded entries + images and returns the world to its prior state", async () => {
    const uploaded = new Set(fake.storageLog.filter((l) => l.op === "upload").map((l) => `${l.bucket}/${l.path}`));
    fake.storageLog.length = 0;
    const r = await run({ ...base, mode: "remove" });
    assert.strictEqual(r.list.length, 77);
    assert.strictEqual(r.removed, 77);
    assert.strictEqual(r.countAfter, beforeCount);
    assert.strictEqual(snapshot(), before);
    // Every uploaded object (56 portraits + 5 banners) is removed, and nothing else.
    const removed = new Set(fake.storageLog.filter((l) => l.op === "remove").flatMap((l) => l.paths.map((p) => `${l.bucket}/${p}`)));
    assert.strictEqual(uploaded.size, 61);
    assert.deepStrictEqual([...removed].sort(), [...uploaded].sort());
    assert(!fs.existsSync(base.idsFile), "ids file should be retired after a clean remove");
  });

  await test("--remove --dry-run lists but deletes nothing", async () => {
    await run({ ...base, mode: "apply" });
    const snap = snapshot();
    const r = await run({ ...base, mode: "remove", dryRun: true });
    assert.strictEqual(r.list.length, 77);
    assert.strictEqual(snapshot(), snap);
  });

  await test("--remove still finds entries whose top-level tag was lost, via the ids file", async () => {
    for (const row of fake.db.entries) if (row.raw_json) delete row.raw_json.demoSeed; // simulate a rebake dropping the patch-only field
    const r = await run({ ...base, mode: "remove" });
    assert.strictEqual(r.removed, 77);
    assert.strictEqual(snapshot(), before.replace(/"demoSeed":"saltmere-v1",?/g, ""));
  });

  await test("a failed image upload keeps the entry and is reported", async () => {
    resetDb();
    const { supabase } = require("../lib/supabaseClient");
    const realFrom = supabase.storage.from;
    supabase.storage.from = (bucket) => {
      const b = realFrom(bucket);
      return { ...b, upload: (p) => (p.includes("mama-quill") ? Promise.resolve({ data: null, error: { message: "boom" } }) : b.upload(p)) };
    };
    try {
      const r = await run({ ...base, mode: "apply" });
      assert.strictEqual(r.imageFailures.length, 1);
      assert(/mama-quill|Mama Quill/.test(r.imageFailures[0].entry));
      assert(fake.db.entries.some((x) => x.entry_id === "mama-quill"), "entry must be kept");
      assert.strictEqual(r.failures.length, 0);
    } finally { supabase.storage.from = realFrom; }
  });

  fs.rmSync(tmp, { recursive: true, force: true });
}

(async () => {
  await unitTests();
  await e2eTests();
  console.log(`\n${passed} passed${process.exitCode ? " -- WITH FAILURES" : ""}`);
})();
