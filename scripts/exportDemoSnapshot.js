#!/usr/bin/env node
// scripts/exportDemoSnapshot.js
//
// Builds the static "Demo world" tab for the marketing site
// (marketing/demo/) from the Saltmere Sprawl content -- with NO database
// dependency at view time, so it keeps working after the live world is
// replaced by a real one.
//
//   node scripts/exportDemoSnapshot.js --capture [--world-name "Saltmere Sprawl"]
//       READ-ONLY against the live project (SELECTs only): saves the world's
//       existing entries + the config the demo needs (category labels/blurbs,
//       site title, theme, calendar) to saltmere_pack/existing_world_snapshot.json.
//       Run once while the demo content is still in the live world; commit the file.
//
//   node scripts/exportDemoSnapshot.js            (default: build)
//       Needs no credentials and touches no database. Loads the snapshot into the
//       in-memory fake (scripts/lib/fakeSupabase.js), applies the 79-entry pack to it
//       with the real seed script (so ids, links, templates and rendered bodyHtml are
//       exactly what the app would produce), then writes marketing/demo/data.js and
//       marketing/demo/images/.
//
// Why replay the seed instead of re-rendering: the dossier HTML comes from the app's
// own templates; running the real seed path against a fake DB is the way to get that
// output without a server or a live project, and the result is deterministic.

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SNAPSHOT = path.join(REPO, "saltmere_pack", "existing_world_snapshot.json");
const OUT_DIR = path.join(REPO, "marketing", "demo");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

async function capture() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set for --capture.");
  const { findWorld } = require("./seedSaltmereDemo");
  const { supabase } = require("../lib/supabaseClient");
  const world = await findWorld(supabase, { worldName: val("--world-name", "Saltmere Sprawl") });
  const { data: rows, error } = await supabase.from("entries").select("*").eq("world_id", world.id).limit(1000);
  if (error) throw error;
  const { data: cfg, error: cfgErr } = await supabase.from("world_config").select("ruleset, calendar_config, category_config_json, style_guide_json, draft_json").eq("world_id", world.id).single();
  if (cfgErr) throw cfgErr;
  const snap = {
    capturedAt: new Date().toISOString(),
    worldName: world.name,
    config: {
      ruleset: cfg.ruleset,
      calendar_config: cfg.calendar_config,
      category_config_json: cfg.category_config_json,
      style_guide_json: cfg.style_guide_json,
      step1: (cfg.draft_json || {})["1"] || {}
    },
    // world_id / row ids are deliberately dropped: nothing here should identify the live project's rows.
    rows: rows.map((r) => ({ category: r.category, entry_id: r.entry_id, name: r.name, subtitle: r.subtitle, faction: r.faction, tags_json: r.tags_json, body_html: r.body_html, raw_json: r.raw_json, locked: r.locked, created_at: r.created_at }))
  };
  // Portrait URLs in stored HTML embed the project ref and world id. They're dead links for these
  // entries anyway (and the build drops/replaces every portrait <img>), so scrub them from the committed file.
  const scrubbed = JSON.stringify(snap, null, 1).replace(/https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/[^"\\\s]*/g, "about:blank");
  fs.writeFileSync(SNAPSHOT, scrubbed);
  console.log(`Captured ${rows.length} entries from "${world.name}" -> ${path.relative(REPO, SNAPSHOT)} (read-only; nothing was written to the database).`);
}

// Per-faction accent colours for the demo. The four pre-existing factions keep the colours from the
// world's own style guide (style_guide_json.factionAccents); the five pack factions have no accent
// (the app generates one with a model call at creation time), so give them one here -- presentation
// only, applied to the exported data, not written anywhere.
const PACK_FACTION_ACCENTS = ["#e0a458", "#6aa7d8", "#d96c8c", "#8fcf7a", "#c7b27a"];

async function build() {
  if (!fs.existsSync(SNAPSHOT)) throw new Error(`${path.relative(REPO, SNAPSHOT)} not found. Run with --capture first (while the live world still has the demo content).`);
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));

  process.env.SUPABASE_URL = "http://snapshot.invalid";
  process.env.SUPABASE_SECRET_KEY = "unused";
  const fake = require("./lib/fakeSupabase");
  fake.install(); // before any app module loads: nothing below can reach a real database
  const S = require("./lib/saltmereSeed");
  const { run } = require("./seedSaltmereDemo");

  const W = "snapshot-world";
  fake.db.worlds = [{ id: W, name: snap.worldName, user_id: "snapshot-user" }];
  fake.db.world_config.push({ world_id: W, ruleset: snap.config.ruleset, setup_completed_at: snap.capturedAt, calendar_config: snap.config.calendar_config, draft_json: { "1": snap.config.step1 }, category_config_json: snap.config.category_config_json, style_guide_json: snap.config.style_guide_json });
  for (const r of snap.rows) fake.db.entries.push({ ...r, world_id: W });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "demo-export-"));
  const quiet = [];
  const result = await run({ mode: "apply", worldId: W, packDir: path.join(REPO, "saltmere_pack"), idsFile: path.join(tmp, "ids.json"), backupDir: path.join(tmp, "b"), log: (l) => quiet.push(l), host: "snapshot.invalid" });
  if (result.failures && result.failures.length) throw new Error("Seed replay failed:\n" + result.failures.map((f) => `  ${f.entry}: ${f.error}`).join("\n"));
  console.log(`Replayed seed: created ${Object.values(result.created).reduce((a, b) => a + b, 0)}, skipped ${result.skips.length} duplicate(s), unresolved links ${result.unresolved.length}.`);

  // id -> pack image stem, using the same plan the seed made against the snapshot's existing entries.
  const existingIndex = S.buildExistingIndex(snap.rows.map((r) => ({ category: r.category, id: r.entry_id, name: r.name, locked: !!r.locked })));
  const { plan } = S.planEntries(S.loadPack(path.join(REPO, "saltmere_pack")), existingIndex);
  const stemOf = new Map(plan.filter((p) => p.packEntry.image).map((p) => [`${p.category}/${p.id}`, p.packEntry.image]));

  const rows = fake.db.entries.filter((r) => !r.locked);
  const have = new Set(rows.map((r) => `${r.category}/${r.entry_id}`));

  // Faction accent lookup.
  const accentById = {};
  for (const fa of (snap.config.style_guide_json && snap.config.style_guide_json.factionAccents) || []) if (fa.accentColorHex) accentById[fa.id] = fa.accentColorHex;
  let nextAccent = 0;
  for (const r of rows.filter((x) => x.category === "factions")) if (!accentById[r.entry_id]) accentById[r.entry_id] = (r.raw_json && r.raw_json.accentColor) || PACK_FACTION_ACCENTS[nextAccent++ % PACK_FACTION_ACCENTS.length];

  fs.rmSync(path.join(OUT_DIR, "images"), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT_DIR, "images"), { recursive: true });
  const copied = new Set();
  const copyImage = (stem, destName) => {
    const src = path.join(REPO, "saltmere_pack", "images", `${stem}.png`);
    if (!fs.existsSync(src)) return null;
    fs.copyFileSync(src, path.join(OUT_DIR, "images", destName));
    copied.add(destName);
    return `images/${destName}`;
  };

  const rewriteHtml = (html, category, id, name) => {
    let out = html || "";
    const stem = stemOf.get(`${category}/${id}`);
    const local = stem && category !== "factions" ? copyImage(stem, `${id}.png`) : null;
    // Portrait: point at the bundled copy, or drop the tag (a live-world portrait URL would be dead/foreign).
    out = out.replace(/<img class="portrait-img"[^>]*>/g, local ? `<img class="portrait-img" src="${local}" alt="${name.replace(/"/g, "&quot;")}" loading="lazy">` : "");
    // Cross-links: dossier.html?category=X&id=Y -> #/X/Y (or plain text if the target isn't in the snapshot).
    out = out.replace(/<a ([^>]*?)href="(?:\.\.\/)?dossier\.html\?category=([^&"]+)&(?:amp;)?id=([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g, (m, pre, cat, tid, post, inner) => (have.has(`${cat}/${decodeURIComponent(tid)}`) ? `<a ${pre}href="#/${cat}/${tid}"${post}>${inner}</a>` : `<span>${inner}</span>`));
    // The static page has no app behaviour.
    out = out.replace(/\sonerror="[^"]*"/g, "").replace(/\sonclick="[^"]*"/g, "");
    return out;
  };

  const entries = rows.map((r) => {
    const raw = r.raw_json || {};
    const stem = stemOf.get(`${r.category}/${r.entry_id}`);
    const thumb = stem && r.category !== "factions" && fs.existsSync(path.join(REPO, "saltmere_pack", "images", `${stem}.png`)) ? `images/${r.entry_id}.png` : null;
    const banner = stem && r.category === "factions" ? copyImage(stem, `faction-${r.entry_id}.png`) : null;
    const html = rewriteHtml(r.body_html, r.category, r.entry_id, r.name);
    return {
      category: r.category, id: r.entry_id, name: r.name, subtitle: r.subtitle || "", eyebrow: raw.eyebrow || "",
      faction: r.faction && r.faction !== "unaligned" ? r.faction : null,
      tags: r.tags_json || [], bodyHtml: html, footer: raw.footer || [], image: thumb, banner,
      seeded: raw.demoSeed === S.SEED_TAG || !!(raw.raw && raw.raw.demoSeed === S.SEED_TAG)
    };
  });

  const catCfg = snap.config.category_config_json || {};
  const site = catCfg._site || {};
  const style = snap.config.style_guide_json || {};
  const ORDER = [["factions", "Powers"], ["npcs", "Contacts"], ["locations", "Districts"], ["enemies", "Hazards"], ["items", "Salvage"], ["spells", "Anomalies"], ["classes", "Dive Roles"], ["survivors", "Divers"], ["logs", "Dive Logs"]];
  const categories = ORDER.map(([slug, fallback]) => ({ slug, label: (catCfg[slug] && catCfg[slug].label) || fallback, blurb: (catCfg[slug] && catCfg[slug].blurb) || "", count: entries.filter((e) => e.category === slug).length })).filter((c) => c.count);
  const factions = {};
  for (const r of rows.filter((x) => x.category === "factions")) factions[r.entry_id] = { name: r.name, accent: accentById[r.entry_id] };

  const data = {
    world: {
      name: snap.worldName, title: site.title || snap.worldName, tagline: site.tagline || "", statusLine: site.statusLine || "", footer: site.footer || "",
      genre: snap.config.step1.genre || [], era: snap.config.step1.era || "",
      theme: { fontDisplay: style.fontDisplay || null, fontBody: style.fontBody || null, primaryColor: style.primaryColor || null, secondaryColor: style.secondaryColor || null, panelColor: style.panelColor || null, inkColor: style.inkColor || null, backgroundColor: style.backgroundColor || null }
    },
    categories, factions, entries
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "data.js"), `// GENERATED by scripts/exportDemoSnapshot.js -- do not edit by hand.\nwindow.DEMO_DATA = ${JSON.stringify(data)};\n`);
  fs.copyFileSync(path.join(REPO, "archive", "css", "style.css"), path.join(OUT_DIR, "archive.css"));
  console.log(`Wrote ${path.relative(REPO, path.join(OUT_DIR, "data.js"))}: ${entries.length} entries (${entries.filter((e) => e.seeded).length} from the pack), ${copied.size} images.`);
  console.log(categories.map((c) => `  ${c.label}: ${c.count}`).join("\n"));
}

(flag("--capture") ? capture() : build()).catch((e) => { console.error("ERROR:", e.message || e); process.exitCode = 1; });
