#!/usr/bin/env node
// scripts/seedSaltmereDemo.js
//
// Seeds the Saltmere Sprawl demo world with the 79-entry content pack in
// saltmere_pack/ (factions, NPCs, hazards, items, districts, anomalies,
// classes, divers, logs + portraits), so the static demo has 100+ entries.
//
//   node scripts/seedSaltmereDemo.js                       # dry-run (default): prints the plan, writes nothing
//   node scripts/seedSaltmereDemo.js --apply --confirm-host <host>
//   node scripts/seedSaltmereDemo.js --remove --confirm-host <host>
//
// Flags
//   --world-name "Saltmere Sprawl" | --world-id <uuid>   which world (default: --world-name "Saltmere Sprawl")
//   --dry-run     explicit no-write mode (the default; also turns --apply/--remove into a preview)
//   --apply       back the world up, then create every non-duplicate pack entry + image
//   --remove      delete exactly the entries this script created (tagged demoSeed, or in the ids file) + their images
//   --confirm-host <host>   REQUIRED with --apply/--remove: must equal the host of SUPABASE_URL. Not a secret --
//                 it exists so a write can never go to whichever project the shell happens to point at.
//   --pack-dir, --ids-file, --backup-dir   overrides (defaults: saltmere_pack/, scripts/.seed-saltmere-ids.json, scripts/backups/)
//
// Design notes (full rationale in world_forge_scope.md's "Saltmere demo seed" section):
//   - Additive only. Existing entries are never edited or deleted: duplicates are skipped by
//     (category, name), and the app's entry cross-linking BACKFILL (lib/entryLinker.js's
//     backfillReferencesFromNewEntry, which rewrites OTHER entries that name a new one) and its
//     ghost-placeholder creation are deliberately NOT run -- both would touch rows we don't own.
//     Links are instead resolved up front from the pack itself (slug -> id map) and, for
//     references into entries that already exist, by id/name.
//   - Entries are written through the app's own save*Entry() writers (the same ones
//     routes/confirmEntry.js and the generate routes use), after the same code-side
//     post-processing the generate routes apply (CR, HP, proficiency, spell slots...).
//   - Tag: raw_json.raw.demoSeed (inside the content object, so it survives any later
//     save*Entry() rebake that spreads the content) plus a top-level raw_json.demoSeed via
//     patchEntryMeta. No migration needed. scripts/.seed-saltmere-ids.json is a second record.
//   - Timeline events are NOT written (they'd outlive --remove; the Timeline page's own
//     "Sync timeline" button backfills dated entries on demand).

const fs = require("fs");
const path = require("path");

const {
  SEED_TAG, PACK_CATEGORIES, PORTRAIT_CATEGORIES,
  buildExistingIndex, planEntries, makeResolver, validateContent, adaptEntry, loadPack
} = require("./lib/saltmereSeed");

const REPO_ROOT = path.join(__dirname, "..");
const DEFAULTS = {
  worldName: "Saltmere Sprawl",
  packDir: path.join(REPO_ROOT, "saltmere_pack"),
  idsFile: path.join(__dirname, ".seed-saltmere-ids.json"),
  backupDir: path.join(__dirname, "backups")
};

class SeedError extends Error {}

// ------------------------------------------------------------------
// DB helpers
// ------------------------------------------------------------------

async function findWorld(supabase, { worldName, worldId }) {
  if (worldId) {
    const { data, error } = await supabase.from("worlds").select("id, name").eq("id", worldId).maybeSingle();
    if (error) throw new SeedError(`World lookup failed: ${error.message}`);
    if (!data) throw new SeedError(`No world with id ${worldId}. Nothing was changed.`);
    return data;
  }
  // The app never writes worlds.name after creation (resolveTenant inserts
  // "My World" and nothing renames it); the name a user actually picked is
  // the wizard's Step 1 "worldName", stored in world_config.draft_json["1"]
  // (see lib/worldFlavor.js's getSettingContext). So match on either.
  const want = worldName.trim().toLowerCase();
  const { data: worlds, error } = await supabase.from("worlds").select("id, name");
  if (error) throw new SeedError(`World lookup failed: ${error.message}`);
  const { data: configs, error: cfgErr } = await supabase.from("world_config").select("world_id, draft_json");
  if (cfgErr) throw new SeedError(`World lookup failed: ${cfgErr.message}`);
  const draftNameById = new Map((configs || []).map((c) => [c.world_id, c.draft_json && c.draft_json["1"] && c.draft_json["1"].worldName]));
  const nameOf = (w) => draftNameById.get(w.id) || w.name;
  const matches = (worlds || []).filter((w) => String(w.name || "").trim().toLowerCase() === want || String(draftNameById.get(w.id) || "").trim().toLowerCase() === want);
  if (matches.length === 0) {
    const names = [...new Set((worlds || []).map(nameOf))].map((n) => `"${n}"`).slice(0, 20).join(", ");
    throw new SeedError(`No world named "${worldName}" found (${(worlds || []).length} worlds checked; names present: ${names || "none"}). Nothing was changed. Pass --world-id <uuid> if it is named differently.`);
  }
  if (matches.length > 1) {
    throw new SeedError(`${matches.length} worlds are named "${worldName}" (${matches.map((w) => w.id).join(", ")}). Re-run with --world-id <uuid>. Nothing was changed.`);
  }
  return { id: matches[0].id, name: nameOf(matches[0]) };
}

// Every entries row for the world (locked ghosts included), paged because
// PostgREST caps a response at 1000 rows.
async function loadWorldRows(supabase, worldId) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("entries").select("*").eq("world_id", worldId).order("created_at", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new SeedError(`Reading the world's entries failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function rowSummary(row) {
  return { category: row.category, id: row.entry_id, name: row.name, locked: !!row.locked };
}

function isTagged(row) {
  const raw = row.raw_json || {};
  return raw.demoSeed === SEED_TAG || (raw.raw && raw.raw.demoSeed === SEED_TAG);
}

function writeBackup(rows, { worldId, backupDir, host, label }) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(backupDir, `saltmere-${label}-${worldId}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ worldId, host, takenAt: new Date().toISOString(), rowCount: rows.length, rows }, null, 2));
  return file;
}

function readIdsFile(idsFile) {
  try { return JSON.parse(fs.readFileSync(idsFile, "utf8")); } catch (e) { return null; }
}
function writeIdsFile(idsFile, data) {
  fs.writeFileSync(idsFile, JSON.stringify(data, null, 2));
}

// ------------------------------------------------------------------
// Planning (shared by dry-run and apply)
// ------------------------------------------------------------------

async function buildPlan({ supabase, world, packDir, log }) {
  const { getRuleset, getCalendarConfig } = require("../lib/worldConfigRepo");
  const ruleset = await getRuleset(world.id);
  if (ruleset !== "5e") {
    throw new SeedError(`World "${world.name}" runs the "${ruleset}" ruleset; the pack's Hazards/Salvage/Anomalies/Dive Roles/Divers are 5e content. Aborting -- nothing was changed.`);
  }
  const calendarConfig = await getCalendarConfig(world.id);
  const rows = await loadWorldRows(supabase, world.id);
  const existing = rows.map(rowSummary);
  const existingIndex = buildExistingIndex(existing);

  const pack = loadPack(packDir);
  const { plan, skips, slugToRef } = planEntries(pack, existingIndex);
  const resolve = makeResolver({ slugToRef, existingIndex });

  // Class content for divers: pack classes are filled in as they're adapted
  // (classes precede divers in PACK_CATEGORIES); classes already in the
  // world are read from their rows.
  const classContent = new Map();
  for (const r of rows) if (r.category === "classes" && r.raw_json && r.raw_json.raw) classContent.set(r.entry_id, r.raw_json.raw);

  const { getRealBackgroundsAndFeats } = require("../lib/rulesets/5e/backgroundsAndFeatsSeed");
  const { backgrounds } = await getRealBackgroundsAndFeats();
  const { DEFAULT_NPC_COMBAT_PROFILE } = require("../lib/rulesets/5e/npcCombatDefaults");

  const report = { unresolved: [] };
  const ctx = { resolve, calendarConfig, report, classContent, backgrounds };
  const adaptations = [];
  const invalid = [];

  for (const item of plan) {
    // Fresh clone per NPC: the default profile is a shared module-level object.
    ctx.npcCombatProfile = structuredClone(DEFAULT_NPC_COMBAT_PROFILE);
    const { content, notes } = adaptEntry(item, ctx);
    item.content = content;
    if (item.category === "classes") classContent.set(item.id, content);
    for (const n of notes) adaptations.push({ entry: `${item.category}/${item.name}`, note: n });
    const problems = validateContent(item.category, content);
    for (const p of problems) invalid.push({ entry: `${item.category}/${item.name}`, problem: p });
  }

  if (invalid.length) {
    const lines = invalid.map((i) => `  - ${i.entry}: ${i.problem}`).join("\n");
    throw new SeedError(`Pack validation failed for ${new Set(invalid.map((i) => i.entry)).size} entr${invalid.length === 1 ? "y" : "ies"}; nothing was written:\n${lines}`);
  }
  log && log(`(calendar: ${calendarConfig && calendarConfig.months ? calendarConfig.months.length + " months" : "none configured"}; ruleset: ${ruleset})`);
  return { plan, skips, existingRows: rows, unresolved: report.unresolved, adaptations, ruleset };
}

function printTable(rows, headers, log) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] == null ? "" : r[i]).length)));
  const fmt = (r) => r.map((c, i) => String(c == null ? "" : c).padEnd(widths[i])).join("  ");
  log(fmt(headers));
  log(widths.map((w) => "-".repeat(w)).join("  "));
  rows.forEach((r) => log(fmt(r)));
}

function printPlan({ plan, skips, unresolved, adaptations, imageStats }, log) {
  log("\nPer-category plan");
  const rows = PACK_CATEGORIES.map((c) => {
    const create = plan.filter((p) => p.packCategory === c.file).length;
    const skip = skips.filter((s) => s.packCategory === c.file).length;
    return [c.file, c.label, c.app, create, skip];
  });
  const totals = ["TOTAL", "", "", rows.reduce((n, r) => n + r[3], 0), rows.reduce((n, r) => n + r[4], 0)];
  printTable([...rows, totals], ["pack", "label", "app category", "create", "skip"], log);

  log("\nEntries");
  printTable(
    [
      ...plan.map((p) => ["CREATE", p.category, p.id, p.name, imageStats(p)]),
      ...skips.map((s) => ["SKIP", s.category, s.existingId, s.name, s.reason])
    ],
    ["action", "category", "id", "name", "image / reason"],
    log
  );
  if (skips.length) {
    log("\nSkipped (already in the world):");
    skips.forEach((s) => log(`  - ${s.category}/${s.name}: ${s.reason}`));
  }
  log(`\nUnresolved cross-links: ${unresolved.length}`);
  unresolved.forEach((u) => log(`  - ${u.entry} :: ${u.field} = ${JSON.stringify(u.value)} (left as-is)`));
  log(`\nAdaptations to fit the app's schemas: ${adaptations.length}`);
  const grouped = new Map();
  for (const a of adaptations) {
    const key = a.note.replace(/ \(x\d+\)$/, "");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(a.entry);
  }
  for (const [note, entries] of grouped) log(`  - ${note}\n      ${entries.length} entr${entries.length === 1 ? "y" : "ies"}: ${entries.slice(0, 6).join(", ")}${entries.length > 6 ? ", ..." : ""}`);
}

// What image the pack has for an entry and what the app can do with it.
function describeImage(item, packDir) {
  const stem = item.packEntry.image;
  if (!stem) return "none in pack";
  const file = path.join(packDir, "images", `${stem}.png`);
  if (!fs.existsSync(file)) return `MISSING ${stem}.png`;
  if (PORTRAIT_CATEGORIES.has(item.category)) return `portrait ${stem}.png`;
  if (item.category === "factions") return `banner ${stem}.png`;
  return `${stem}.png NOT attachable (app has no ${item.category} image support)`;
}

// ------------------------------------------------------------------
// Apply
// ------------------------------------------------------------------

async function applyPlan({ supabase, world, built, opts, log, host }) {
  const fw = require("../lib/fileWriter");
  const { save5eEnemyEntry } = require("../lib/rulesets/5e/enemyRepo");
  const { save5eItemEntry } = require("../lib/rulesets/5e/itemRepo");
  const { save5eSpellEntry } = require("../lib/rulesets/5e/spellRepo");
  const { save5eClassEntry } = require("../lib/rulesets/5e/classRepo");
  const { save5eSurvivorEntry } = require("../lib/rulesets/5e/survivorRepo");
  const { patchEntryMeta } = require("../lib/entriesRepo");
  const { buildFactionRoundup } = require("../lib/factionRoundup");

  const WRITE = {
    factions: async (c) => fw.saveFactionEntry(world.id, c, await buildFactionRoundup(world.id, c.factionKey)),
    npcs: (c, url) => fw.saveNpcEntry(world.id, c, url),
    locations: (c, url) => fw.saveLocationEntry(world.id, c, url),
    logs: (c) => fw.saveLogEntry(world.id, c),
    enemies: (c, url) => save5eEnemyEntry(world.id, c, url),
    items: (c, url) => save5eItemEntry(world.id, c, url),
    spells: (c) => save5eSpellEntry(world.id, c),
    classes: (c, url) => save5eClassEntry(world.id, c, url),
    survivors: (c, url) => save5eSurvivorEntry(world.id, c, url)
  };

  // 11. Back up first -- before ANY insert.
  const backupFile = writeBackup(built.existingRows, { worldId: world.id, backupDir: opts.backupDir, host, label: "before-apply" });
  log(`\nBackup written: ${path.relative(process.cwd(), backupFile)} (${built.existingRows.length} rows)`);

  const ids = { tag: SEED_TAG, worldId: world.id, host, startedAt: new Date().toISOString(), entries: [] };
  writeIdsFile(opts.idsFile, ids);

  const created = {};
  const imageFailures = [];
  const imageNotAttachable = [];
  const failures = [];
  const bannerUrls = new Map(); // faction id -> url
  const countBefore = built.existingRows.filter((r) => !r.locked).length;

  for (const item of built.plan) {
    const record = { category: item.category, id: item.id, portrait: false, banner: false };
    try {
      let imageUrl = null;
      const stem = item.packEntry.image;
      const imageFile = stem ? path.join(opts.packDir, "images", `${stem}.png`) : null;
      if (imageFile && PORTRAIT_CATEGORIES.has(item.category)) {
        try {
          imageUrl = await fw.saveImage(world.id, item.id, fs.readFileSync(imageFile), "image/png");
          record.portrait = true;
        } catch (err) {
          imageFailures.push({ entry: `${item.category}/${item.name}`, error: err.message });
        }
      } else if (imageFile && item.category === "factions") {
        try {
          bannerUrls.set(item.id, await fw.saveFactionBanner(world.id, item.id, fs.readFileSync(imageFile), "image/png"));
          record.banner = true;
        } catch (err) {
          imageFailures.push({ entry: `${item.category}/${item.name}`, error: err.message });
        }
      } else if (stem) {
        imageNotAttachable.push(`${item.category}/${item.name}`);
      }

      await WRITE[item.category](item.content, imageUrl);
      ids.entries.push(record);
      writeIdsFile(opts.idsFile, ids); // incremental: a crash mid-run still leaves --remove a complete list
      created[item.category] = (created[item.category] || 0) + 1;
    } catch (err) {
      failures.push({ entry: `${item.category}/${item.name}`, error: err.message });
      log(`  ! ${item.category}/${item.name} failed: ${err.message}`);
      // A portrait uploaded for an entry that then failed to save is an orphan; remove it.
      if (record.portrait) { try { await fw.deletePortrait(world.id, item.id); } catch (e) { /* best effort */ } }
      if (record.banner) { try { await fw.deleteFactionBanner(world.id, item.id); } catch (e) { /* best effort */ } }
    }
  }

  // Faction dossiers list their members ("Roundup"); the factions were
  // written first, before any member existed, so rebuild now. Only our own
  // factions are re-saved -- existing factions are left alone.
  for (const item of built.plan.filter((p) => p.category === "factions")) {
    if (!ids.entries.find((e) => e.category === "factions" && e.id === item.id)) continue;
    try { await WRITE.factions(item.content); } catch (err) { log(`  ! roundup refresh for ${item.name} failed: ${err.message}`); }
  }

  // Tag (top-level) + banner url via the app's own patchEntryMeta. Done last
  // because save*Entry() rewrites raw_json wholesale, dropping patch-only
  // fields (see entriesRepo.js's patchEntryMeta header) -- the in-content
  // raw.demoSeed is the copy that survives that.
  for (const e of ids.entries) {
    const patch = { demoSeed: SEED_TAG };
    if (e.category === "factions" && bannerUrls.has(e.id)) patch.bannerImageUrl = bannerUrls.get(e.id);
    try { await patchEntryMeta(world.id, e.category, e.id, patch); } catch (err) { log(`  ! tagging ${e.category}/${e.id} failed: ${err.message} (still recorded in the ids file)`); }
  }

  ids.finishedAt = new Date().toISOString();
  writeIdsFile(opts.idsFile, ids);
  const after = (await loadWorldRows(supabase, world.id)).filter((r) => !r.locked).length;
  return { backupFile, created, failures, imageFailures, imageNotAttachable, countBefore, countAfter: after, idsFile: opts.idsFile };
}

// ------------------------------------------------------------------
// Remove
// ------------------------------------------------------------------

async function removeSeeded({ supabase, world, opts, log, host, dryRun }) {
  const fw = require("../lib/fileWriter");
  const { deleteEntry } = require("../lib/entriesRepo");
  const rows = await loadWorldRows(supabase, world.id);
  const idsData = readIdsFile(opts.idsFile);
  const fromFile = idsData && idsData.worldId === world.id ? idsData.entries : [];

  const targets = new Map(); // `${category}|${id}` -> { category, id }
  for (const r of rows) if (isTagged(r)) targets.set(`${r.category}|${r.entry_id}`, { category: r.category, id: r.entry_id, name: r.name });
  for (const e of fromFile) {
    const row = rows.find((r) => r.category === e.category && r.entry_id === e.id);
    // Present in the ids file but gone from the world: nothing to delete (a
    // later manual delete). Present and untagged (a rebake dropped the tag):
    // still ours, because this script created it.
    if (row) targets.set(`${e.category}|${e.id}`, { category: e.category, id: e.id, name: row.name });
  }
  const list = [...targets.values()];
  log(`\n${list.length} seeded entr${list.length === 1 ? "y" : "ies"} found in "${world.name}" (tag ${SEED_TAG}${fromFile.length ? `, ids file: ${fromFile.length}` : ", no ids file"}).`);
  const byCat = {};
  list.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + 1; });
  log(Object.entries(byCat).map(([c, n]) => `  ${c}: ${n}`).join("\n"));
  const countBefore = rows.filter((r) => !r.locked).length;
  if (dryRun || !list.length) {
    if (dryRun) log("\n(dry-run: nothing deleted)");
    return { removed: 0, countBefore, countAfter: countBefore, list };
  }

  const backupFile = writeBackup(rows, { worldId: world.id, backupDir: opts.backupDir, host, label: "before-remove" });
  log(`Backup written: ${path.relative(process.cwd(), backupFile)}`);

  const errors = [];
  for (const t of list) {
    try {
      await deleteEntry(world.id, t.category, t.id);
      if (PORTRAIT_CATEGORIES.has(t.category)) await fw.deletePortrait(world.id, t.id).catch((e) => errors.push(`portrait ${t.id}: ${e.message}`));
      if (t.category === "factions") await fw.deleteFactionBanner(world.id, t.id).catch((e) => errors.push(`banner ${t.id}: ${e.message}`));
    } catch (err) {
      errors.push(`${t.category}/${t.id}: ${err.message}`);
    }
  }

  // The app's own delete also clears ids that OTHER entries stored for the
  // deleted one (lib/entryCleanup.js). Our entries only point at each other
  // (all gone now), so this matters only for something a person linked to a
  // seeded entry afterwards -- scan first, and touch only entries that
  // actually reference a removed id.
  const remaining = (await loadWorldRows(supabase, world.id));
  const blob = remaining.map((r) => JSON.stringify(r.raw_json || {})).join("\n");
  const referenced = list.filter((t) => blob.includes(`"${t.id}"`));
  if (referenced.length) {
    const { detachReferencesToDeletedEntry, unalignFactionMembers } = require("../lib/entryCleanup");
    for (const t of referenced) {
      try {
        await detachReferencesToDeletedEntry(world.id, t.category, t.id);
        if (t.category === "factions") await unalignFactionMembers(world.id, t.id, t.name);
        log(`  cleaned stale references to ${t.category}/${t.id} in other entries`);
      } catch (err) { errors.push(`cleanup ${t.category}/${t.id}: ${err.message}`); }
    }
  }

  const countAfter = (await loadWorldRows(supabase, world.id)).filter((r) => !r.locked).length;
  if (!errors.length && fs.existsSync(opts.idsFile)) fs.renameSync(opts.idsFile, `${opts.idsFile}.removed-${Date.now()}`);
  return { removed: list.length - errors.length, errors, countBefore, countAfter, backupFile, list };
}

// ------------------------------------------------------------------
// Entry points
// ------------------------------------------------------------------

// opts: { mode: 'dry-run'|'apply'|'remove', dryRun, worldName, worldId, packDir, idsFile, backupDir, log, supabase?, host? }
async function run(optsIn) {
  const opts = { ...DEFAULTS, log: console.log, ...optsIn };
  const log = opts.log;
  const supabase = opts.supabase || require("../lib/supabaseClient").supabase;
  const host = opts.host || (process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : "unknown");

  const world = await findWorld(supabase, opts);
  log(`Target: "${world.name}" (${world.id}) on ${host}`);

  if (opts.mode === "remove") {
    return { mode: "remove", world, ...(await removeSeeded({ supabase, world, opts, log, host, dryRun: !!opts.dryRun })) };
  }

  const built = await buildPlan({ supabase, world, packDir: opts.packDir, log });
  printPlan({ ...built, imageStats: (p) => describeImage(p, opts.packDir) }, log);

  if (opts.mode !== "apply" || opts.dryRun) {
    log("\nDRY RUN -- nothing was written. Re-run with --apply --confirm-host " + host + " to create these entries.");
    return { mode: "dry-run", world, plan: built.plan, skips: built.skips, unresolved: built.unresolved, adaptations: built.adaptations };
  }
  const result = await applyPlan({ supabase, world, built, opts, log, host });
  log("\nCreated: " + (Object.entries(result.created).map(([c, n]) => `${c} ${n}`).join(", ") || "nothing"));
  log(`World entry count (non-placeholder): ${result.countBefore} -> ${result.countAfter}`);
  if (result.failures.length) log(`FAILED entries (${result.failures.length}):\n` + result.failures.map((f) => `  - ${f.entry}: ${f.error}`).join("\n"));
  if (result.imageFailures.length) log(`Image uploads that failed (entry kept):\n` + result.imageFailures.map((f) => `  - ${f.entry}: ${f.error}`).join("\n"));
  if (result.imageNotAttachable.length) log(`Images with no attach path in the app (entry kept, image not used): ${result.imageNotAttachable.length}\n  ` + result.imageNotAttachable.join(", "));
  return { mode: "apply", world, unresolved: built.unresolved, adaptations: built.adaptations, skips: built.skips, ...result };
}

function parseArgs(argv) {
  const a = { mode: "dry-run", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new SeedError(`${t} needs a value`); return argv[++i]; };
    if (t === "--apply") a.mode = "apply";
    else if (t === "--remove") a.mode = "remove";
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "--world-name") a.worldName = val();
    else if (t === "--world-id") a.worldId = val();
    else if (t === "--confirm-host") a.confirmHost = val();
    else if (t === "--pack-dir") a.packDir = path.resolve(val());
    else if (t === "--ids-file") a.idsFile = path.resolve(val());
    else if (t === "--backup-dir") a.backupDir = path.resolve(val());
    else if (t === "--help" || t === "-h") a.help = true;
    else throw new SeedError(`Unknown flag ${t}`);
  }
  return a;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(fs.readFileSync(__filename, "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 24).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new SeedError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
    const host = new URL(process.env.SUPABASE_URL).host;
    const writes = (args.mode === "apply" || args.mode === "remove") && !args.dryRun;
    if (writes && args.confirmHost !== host) {
      throw new SeedError(`--${args.mode} writes to ${host}. Re-run with --confirm-host ${host} to confirm that is the project you mean (a dev/staging project -- never run this against production before review).`);
    }
    await run({ ...args, host });
  } catch (err) {
    if (err instanceof SeedError) { console.error(`\nERROR: ${err.message}`); process.exitCode = 1; return; }
    throw err;
  }
}

if (require.main === module) main();

module.exports = { run, parseArgs, SeedError, findWorld, isTagged };
