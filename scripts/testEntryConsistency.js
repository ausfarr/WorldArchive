// scripts/testEntryConsistency.js
//
// Bug batch 1 audit fixes, items 4-7 (session_addendum_bug_batch_1.md).
// Drives the REAL /confirm-entry, DELETE /entries/:category/:id and
// GET /timeline-events routes over HTTP against scripts/lib/fakeSupabase.js
// with BILLING_ENABLED=true (so the entry cap is live). No AI calls.
//
//   4. Filling a locked ghost placeholder counts against the entry cap
//      (both /confirm-entry and the /generate-X middleware).
//   5. Renaming a faction doesn't duplicate reciprocal relationships.
//   7. A rename flows into other entries' stored labels (only where the
//      label still equals the old name), and the Timeline shows live names.
//   6. Deleting a faction makes its members Unaligned (re-saved, so the
//      dossier's faction line updates), removes other factions'
//      relationships to it, clears other stored ids pointing at it, and the
//      Timeline marks it deleted instead of linking to a 404.
//
// Usage: node scripts/testEntryConsistency.js

process.env.BILLING_ENABLED = "true";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_not_real";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key-not-real";

const fake = require("./lib/fakeSupabase");
fake.install();
const { db } = fake;

const express = require("express");
const { getEntry, listEntries } = require("../lib/entriesRepo");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { createTimelineEvent } = require("../lib/timelineRepo");

const WORLD = "88888888-8888-8888-8888-888888888888";
const USER = "u-consistency";
const CAL = { months: [{ name: "Frostmere", days: 30 }, { name: "Ashfall", days: 28 }], days_per_week: 7, weekday_names: null, era_name: "", current_date: { year: 812, month_index: 1, day: 10 } };

const failures = [];
function check(label, condition, detail) {
  console.log(`  ${condition ? "PASS" : "FAIL"} - ${label}${!condition && detail !== undefined ? `  (${JSON.stringify(detail)})` : ""}`);
  if (!condition) failures.push(label);
}

function npc(id, name, extra) {
  return {
    id, name, subtitle: "test", faction: null, tags: [], roleArchetype: "quest-giver",
    speech: { register: "plain", rhythm: "plain", tic: "none", neverSay: "nothing" }, dialogue: {}, ...extra
  };
}
function faction(id, name, extra) {
  return {
    id, factionKey: id, name, nickname: "n", overviewQuote: "q", origin: "o", corePhilosophy: "p", structureHierarchy: "s",
    territory: "t", goalsNearTerm: "g", goalsLongTerm: "g", internalTensions: "i", iconography: "i", relationships: [],
    economyResources: "e", joining: "j", ...extra
  };
}

function pushRow(category, id, name, { locked = false, faction: fac = null } = {}) {
  db.entries.push({
    world_id: WORLD, category, entry_id: id, name, subtitle: null, faction: fac, tags_json: [], body_html: locked ? null : "<p>x</p>",
    raw_json: locked ? { raw: null } : { raw: { id, name } }, locked, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
}

async function main() {
  console.log("== Entry consistency: cap on ghost fills, renames, faction delete ==\n");
  db.world_config.push({ world_id: WORLD, draft_json: {}, calendar_config: CAL, entries_purchased: 0, generation_count: 0 });
  db.plans = [{ id: "chronicled_monthly", name: "Plan", monthly_quota: 250, monthly_quota_images: 10, stripe_price_id: "p" }];

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = USER; req.worldId = WORLD; next(); });
  app.use("/api", require("../routes/confirmEntry"));
  app.use("/api", require("../routes/entries"));
  app.use("/api", require("../routes/timeline"));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const port = server.address().port;
  const call = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const origErr = console.error;

  try {
    // ---------- 4: ghost fills count against the cap ----------
    console.log("Item 4: filling a ghost placeholder respects the entry cap");
    for (let i = 0; i < 30; i++) pushRow("npcs", `filler-${i}`, `Filler ${i}`);
    pushRow("npcs", "ghost-vess", "Ghost Vess", { locked: true });
    let r = await call("POST", "/confirm-entry", { category: "npcs", entry: npc("ghost-vess", "Ghost Vess") });
    check("/confirm-entry: filling a ghost at the 30-entry cap -> 403 entry_cap_reached", r.status === 403 && r.body.error === "entry_cap_reached", r);
    check("the ghost is still a locked stub", (await getEntry(WORLD, "npcs", "ghost-vess")).locked === true);
    r = await call("POST", "/confirm-entry", { category: "npcs", entry: npc("filler-3", "Filler 3 Edited") });
    check("/confirm-entry: editing an existing (unlocked) entry at the cap still works", r.status === 200, r);

    const runMw = (path, body) => new Promise((resolve) => {
      const req = { path, body, worldId: WORLD, userId: USER };
      const res = { on() {}, status(c) { this.c = c; return this; }, json(b) { resolve({ allowed: false, status: this.c, body: b }); } };
      enforceEntryCapOnGenerate(req, res, (err) => resolve({ allowed: !err }));
    });
    const mwGhost = await runMw("/generate-npc", { fillExistingId: "ghost-vess" });
    check("/generate-npc middleware: filling a ghost at the cap is refused", !mwGhost.allowed && mwGhost.body.error === "entry_cap_reached", mwGhost);
    const mwRegen = await runMw("/generate-npc", { fillExistingId: "filler-1" });
    check("/generate-npc middleware: regenerating a real entry at the cap is allowed", mwRegen.allowed);
    db.world_config[0].entries_purchased = 25;
    r = await call("POST", "/confirm-entry", { category: "npcs", entry: npc("ghost-vess", "Ghost Vess") });
    check("with room (entry pack bought), the ghost fill succeeds and becomes a real entry", r.status === 200 && (await getEntry(WORLD, "npcs", "ghost-vess")).locked === false, r);
    db.entries = db.entries.filter((e) => !e.entry_id.startsWith("filler-"));

    // ---------- 5 + 7: faction rename ----------
    console.log("\nItems 5 + 7: renaming a faction");
    r = await call("POST", "/confirm-entry", { category: "factions", entry: faction("iron-pact", "The Iron Pact") });
    r = await call("POST", "/confirm-entry", { category: "factions", entry: faction("salt-choir", "The Salt Choir", { relationships: [{ faction: "The Iron Pact", stance: "Rivals", why: "tolls" }] }) });
    let pact = await getEntry(WORLD, "factions", "iron-pact");
    const recips = (pact.raw.relationships || []).filter((x) => x.faction === "The Salt Choir");
    check("setup: Iron Pact received one reciprocal to Salt Choir", recips.length === 1, pact.raw.relationships);
    let choir = await getEntry(WORLD, "factions", "salt-choir");
    check("setup: Salt Choir's relationship resolved to iron-pact", choir.raw.relationships[0].toId === "iron-pact", choir.raw.relationships);

    // An NPC with a relationship to the Pact, and one with a custom label.
    await call("POST", "/confirm-entry", { category: "npcs", entry: npc("vess", "Vess", { faction: "iron-pact", relationships: [{ toCategory: "factions", toId: "iron-pact", toLabel: "The Iron Pact", note: "sworn" }] }) });
    await call("POST", "/confirm-entry", { category: "npcs", entry: npc("oren", "Oren", { relationships: [{ toCategory: "factions", toId: "iron-pact", toLabel: "those Pact bastards", note: "hates" }] }) });
    await createTimelineEvent(WORLD, { sourceType: "entry_date", sourceId: "iron-pact", sourceCategory: "factions", sessionNumber: null, worldDate: { year: 700, monthIndex: 0, day: 1 }, summary: "Founded: The Iron Pact", linkedEntryIds: [{ category: "factions", entryId: "iron-pact" }], linkedFactionIds: [] });

    // Rename the Salt Choir (it names the Pact; the Pact has a reciprocal back).
    choir = await getEntry(WORLD, "factions", "salt-choir");
    r = await call("POST", "/confirm-entry", { category: "factions", entry: { ...choir.raw, name: "The Salt Chorus" } });
    pact = await getEntry(WORLD, "factions", "iron-pact");
    const toChoir = (pact.raw.relationships || []).filter((x) => x.toId === "salt-choir" || x.faction === "The Salt Choir" || x.faction === "The Salt Chorus");
    check("5: renamed faction's reciprocal is NOT duplicated on the other faction", r.status === 200 && toChoir.length === 1, pact.raw.relationships);
    check("7: and that reciprocal now carries the new name", toChoir[0] && toChoir[0].faction === "The Salt Chorus", toChoir);

    // Rename the Pact itself: NPC labels follow, custom labels don't.
    pact = await getEntry(WORLD, "factions", "iron-pact");
    await call("POST", "/confirm-entry", { category: "factions", entry: { ...pact.raw, name: "The Iron Compact" } });
    const vess = await getEntry(WORLD, "npcs", "vess");
    const oren = await getEntry(WORLD, "npcs", "oren");
    choir = await getEntry(WORLD, "factions", "salt-choir");
    check("7: NPC relationship label that equalled the old name is updated", vess.raw.relationships[0].toLabel === "The Iron Compact", vess.raw.relationships);
    check("7: a DM's custom label is left alone", oren.raw.relationships[0].toLabel === "those Pact bastards");
    check("7: other faction's relationship to it is renamed", choir.raw.relationships[0].faction === "The Iron Compact", choir.raw.relationships);
    let tl = await call("GET", "/timeline-events");
    const founded = tl.body.events.find((e) => e.sourceId === "iron-pact");
    check("7: Timeline shows the live name ('Founded: The Iron Compact') without rewriting history", founded && founded.summary === "Founded: The Iron Compact");
    check("7: stored Timeline text is untouched", db.timeline_events.find((e) => e.source_id === "iron-pact").summary === "Founded: The Iron Pact");

    // ---------- 6: faction delete ----------
    console.log("\nItem 6: deleting a faction");
    pushRow("items", "pact-seal", "Pact Seal", { faction: "iron-pact" });
    db.entries.find((e) => e.entry_id === "pact-seal").raw_json = { raw: { id: "pact-seal", name: "Pact Seal", faction: "iron-pact", category: "Weapon" } };
    const origConfirm = global.confirm;
    console.error = () => {};
    r = await call("DELETE", "/entries/factions/iron-pact");
    console.error = origErr;
    const vessAfter = await getEntry(WORLD, "npcs", "vess");
    choir = await getEntry(WORLD, "factions", "salt-choir");
    const orenAfter = await getEntry(WORLD, "npcs", "oren");
    check("delete: 200 and reports members unaligned", r.status === 200 && r.body.cleanup && r.body.cleanup.members && r.body.cleanup.members.unaligned >= 1, r.body);
    check("6: NPC member is now Unaligned ('unaligned'), column + raw", vessAfter.faction === "unaligned" && vessAfter.raw.faction === "unaligned", { col: vessAfter.faction, raw: vessAfter.raw.faction });
    check("6: NPC dossier body re-rendered (no link to the deleted faction)", !/category=factions&id=iron-pact/.test(vessAfter.bodyHtml || ""));
    check("6: other faction's relationship to the deleted faction is removed", !(choir.raw.relationships || []).some((x) => x.toId === "iron-pact" || x.faction === "The Iron Compact"), choir.raw.relationships);
    check("6: other stored ids pointing at it are cleared, labels kept", orenAfter.raw.relationships[0].toId === null && orenAfter.raw.relationships[0].toLabel === "those Pact bastards", orenAfter.raw.relationships);
    tl = await call("GET", "/timeline-events");
    const foundedAfter = tl.body.events.find((e) => e.sourceId === "iron-pact");
    check("6: Timeline event kept as history, flagged sourceDeleted", foundedAfter && foundedAfter.sourceDeleted === true);
    global.confirm = origConfirm;
  } finally {
    console.error = origErr;
    server.close();
  }

  if (failures.length) {
    console.log(`\nRESULT: ${failures.length} check(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("\nRESULT: all checks passed.");
  process.exit(0);
}

main().catch((err) => { console.error("Test crashed:", err); process.exit(1); });
