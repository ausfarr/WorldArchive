// scripts/testRelationshipGraphStanceColors.js
//
// Regression test for the dossier Relationships panel's faction-stance
// edge coloring (archive/js/render.js#STANCE_BUCKETS / stanceBucket /
// mostSevereStanceBucket, used by renderRelationshipGraph). Ported from
// the faction-only graph in claude/hopeful-rubin-2p5a67, whose keyword
// buckets had two false-positive bugs this pins down: bare /war/ matched
// "wary" (so "Wary neutrality" read as open war) and bare /ally/ matched
// "formally"/"mutually" (so "Formally neutral" read as allied).
//
// Also renders the real panel end to end (fake authFetch + fake DOM, same
// vm-context approach as scripts/testWorldStatusPanelCategoryTargets.js)
// to confirm colors apply only to faction<->faction lines and the legend
// only appears when a colored line is actually drawn.
//
// Run with: node scripts/testRelationshipGraphStanceColors.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail !== undefined ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function makeFakeElement() {
  const el = {
    _innerHTML: "",
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    getAttribute() { return null; },
    querySelector() { return makeFakeElement(); },
    querySelectorAll() { return []; },
    closest() { return makeFakeElement(); }
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return el._innerHTML; },
    set(v) { el._innerHTML = v; }
  });
  return el;
}

function loadRenderJs(graphResponse) {
  const source = fs.readFileSync(path.join(__dirname, "..", "archive", "js", "render.js"), "utf8");
  const host = makeFakeElement();
  const sandbox = {
    document: {
      getElementById: (id) => (id === "relationship-graph-zone" ? host : makeFakeElement()),
      // stripHtml() (used for node labels) parses via a detached div's
      // textContent -- a tag-stripping stand-in is enough for plain names.
      createElement: () => {
        let text = "";
        return {
          set innerHTML(v) { text = String(v).replace(/<[^>]*>/g, ""); },
          get textContent() { return text; }
        };
      },
      addEventListener() {},
      body: { dataset: {} }
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console,
    location: { pathname: "/dossier.html" },
    // auth.js's authFetch isn't loaded here -- the panel's one network call
    // is faked to return a fixed graph.
    authFetch: async () => ({ ok: true, json: async () => ({ graph: graphResponse }) }),
    fetch: async () => { throw new Error("fetch() should not be called by this test"); }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(source, context, { filename: "render.js" });
  vm.runInContext(
    "window.STANCE_BUCKETS = STANCE_BUCKETS; window.stanceBucket = stanceBucket; window.mostSevereStanceBucket = mostSevereStanceBucket;",
    context,
    { filename: "render.js (const re-export shim)" }
  );
  return { context, host };
}

function bucketKey(ctx, stance) {
  const b = ctx.stanceBucket(stance);
  return b ? b.key : null;
}

async function main() {
  console.log("\nstanceBucket -- keyword buckets:");
  const { context: ctx } = loadRenderJs(null);
  const cases = [
    ["Open war", "hostile"],
    ["At war over the river trade", "hostile"],
    ["Sworn enemies", "hostile"],
    ["Hostile rivalry", "hostile"],
    ["Uneasy alliance", "strained"],
    ["Bitter rivals", "strained"],
    ["Wary neutrality", "strained"],
    ["Trade partner", "allied"],
    ["Close allies", "allied"],
    ["Formal alliance", "allied"],
    ["Formally neutral", null],
    ["Mutually indifferent", null],
    ["Neutral", null],
    ["", null]
  ];
  cases.forEach(([stance, want]) => {
    const got = bucketKey(ctx, stance);
    check(`"${stance}" -> ${want || "no bucket"}`, got === want, `got ${got}`);
  });

  console.log("\nmostSevereStanceBucket -- two stances on one line take the more severe:");
  const sev = ctx.mostSevereStanceBucket(["Trade partner", "Sworn enemies"]);
  check("ally + hostile -> hostile", sev && sev.key === "hostile", sev && sev.key);
  const sev2 = ctx.mostSevereStanceBucket(["connected to", "notable at"]);
  check("non-stance labels -> no bucket", sev2 === null, sev2 && sev2.key);

  console.log("\nrenderRelationshipGraph -- faction dossier colors only faction<->faction lines, with a legend:");
  const factionGraph = {
    center: "factions:iron-pact",
    nodes: [
      { id: "iron-pact", category: "factions", name: "Iron Pact", isCenter: true },
      { id: "ash-court", category: "factions", name: "Ash Court" },
      { id: "salt-guild", category: "factions", name: "Salt Guild" },
      { id: "mara-voss", category: "npcs", name: "Mara Voss" }
    ],
    edges: [
      { from: "factions:iron-pact", to: "factions:ash-court", label: "Open war" },
      { from: "factions:iron-pact", to: "factions:salt-guild", label: "Trade partner" },
      { from: "npcs:mara-voss", to: "factions:iron-pact", label: "connected to" }
    ]
  };
  const f = loadRenderJs(factionGraph);
  await f.context.renderRelationshipGraph({ category: "factions", id: "iron-pact", name: "Iron Pact" });
  const html = f.host.innerHTML;
  const lines = html.match(/<line[^>]*>/g) || [];
  check("three lines drawn", lines.length === 3, lines.length);
  check("two lines carry a stance color", lines.filter((l) => /style="stroke:/.test(l)).length === 2);
  check("hostile line uses --neon-primary", lines.some((l) => l.includes("stroke:var(--neon-primary)")));
  check("allied line uses --neon-cyan", lines.some((l) => l.includes("stroke:var(--neon-cyan)")));
  check("legend lists Hostile and Allied only", /graph-stance-legend/.test(html) && /Hostile/.test(html) && /Allied/.test(html) && !/Strained/.test(html));

  console.log("\nrenderRelationshipGraph -- non-faction dossier gets no stance colors or legend:");
  const npcGraph = {
    center: "npcs:mara-voss",
    nodes: [
      { id: "mara-voss", category: "npcs", name: "Mara Voss", isCenter: true },
      { id: "ash-court", category: "factions", name: "Ash Court" }
    ],
    edges: [{ from: "npcs:mara-voss", to: "factions:ash-court", label: "Open war" }]
  };
  const n = loadRenderJs(npcGraph);
  await n.context.renderRelationshipGraph({ category: "npcs", id: "mara-voss", name: "Mara Voss" });
  check("no colored line", !/style="stroke:/.test(n.host.innerHTML));
  check("no legend", !/graph-stance-legend/.test(n.host.innerHTML));

  console.log(`\n${failures.length === 0 ? "All checks passed." : `${failures.length} check(s) FAILED:`}`);
  failures.forEach((x) => console.log(`  - ${x}`));
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
