// scripts/testWorldStatusPanelCategoryTargets.js
//
// Regression test for a category-list drift bug in archive/js/render.js,
// same root cause and shape as the ones already fixed in routes/export.js
// (PDF export), lib/pdfExport.js (whole-world export), and
// lib/loreParsing.js (World Bible grounding): a per-category constant
// object was never updated when "spells" shipped as a real category.
//
// renderWorldStatusPanel()'s CATEGORY_TARGETS was missing a "spells"
// entry even though "spells" is a real CATEGORY_LABELS row (and thus a
// real entry in `rows`) for every 5e-ruleset world. `target =
// CATEGORY_TARGETS["spells"]` came back `undefined`, so
// `pct = Math.min(count / undefined, 1)` computed as NaN. One NaN row
// poisons `overallPct` (a plain sum/divide over every row's pct), which
// breaks the homepage World Status Panel in two ways on every affected
// world: the progress bar renders an invalid `width:NaN%` (the browser
// silently drops it, so the bar looks stuck), and the `overallPct >= 1`
// "World fully archived" congratulations state can never trigger again,
// since a NaN comparison is always false.
//
// render.js is a plain browser file with no module.exports (it's loaded
// via <script> tags, not required) and no existing Node test harness --
// this loads it into a vm context with just enough of a `document`/
// `window`/`localStorage` stub to execute renderWorldStatusPanel() for
// real and inspect what it actually produces, rather than re-implementing
// the calculation as a separate copy that could drift from the real code.
//
// Run with: node scripts/testWorldStatusPanelCategoryTargets.js

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

function makeFakeLocalStorage(initial) {
  const store = Object.assign({}, initial);
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
}

// Loads archive/js/render.js into a fresh vm context and returns that
// context (so callers can read/call its top-level consts/functions
// directly, same as if they'd been module.exports'd) -- `localStorageData`
// seeds what getEnabledCategoriesFromCache() reads.
function loadRenderJs(localStorageData) {
  const source = fs.readFileSync(path.join(__dirname, "..", "archive", "js", "render.js"), "utf8");
  const fakeDocument = {
    getElementById: () => makeFakeElement(),
    addEventListener() {},
    body: { dataset: {} }
  };
  const sandbox = {
    document: fakeDocument,
    localStorage: makeFakeLocalStorage(localStorageData),
    console,
    window: {},
    fetch: async () => { throw new Error("fetch() should not be called by this test"); }
  };
  sandbox.window = sandbox; // enough for the one `window.formatGenerationError = ...` top-level assignment
  const context = vm.createContext(sandbox);
  vm.runInContext(source, context, { filename: "render.js" });
  // Top-level `const`/`let` bindings (CATEGORY_TARGETS, CATEGORY_LABELS)
  // live in the script's lexical environment, not as properties of the
  // context object -- unlike function declarations (renderWorldStatusPanel),
  // which DO land on it. Re-expose the ones this test needs via the one
  // object `window === sandbox`, so they show up as real properties on
  // the returned context.
  vm.runInContext(
    "window.CATEGORY_TARGETS = CATEGORY_TARGETS; window.CATEGORY_LABELS = CATEGORY_LABELS;",
    context,
    { filename: "render.js (const re-export shim)" }
  );
  return context;
}

function seededManifests(overrides) {
  // A "mostly complete" 5e-ruleset world -- enough entries in every
  // category to be at/above each CATEGORY_TARGETS target, so a
  // correctly-computed overallPct should land at exactly 1 (fully
  // archived). Spells included, since that's the row that was broken.
  const full = (n) => Array.from({ length: n }, (_, i) => ({ locked: false, id: `e${i}` }));
  return Object.assign({
    npcs: full(3),
    enemies: full(3),
    items: full(3),
    classes: full(2),
    logs: full(3),
    survivors: full(3),
    factions: full(2),
    locations: full(3),
    spells: full(3),
    "session-packets": []
  }, overrides);
}

console.log("=== testWorldStatusPanelCategoryTargets ===\n");

console.log("-- Test 1: CATEGORY_TARGETS has a real numeric entry for every non-special category --");
const ctx1 = loadRenderJs({});
const targets = ctx1.CATEGORY_TARGETS;
const labels = ctx1.CATEGORY_LABELS;
const specialCased = new Set(["factions", "session-packets"]); // factions: dynamic target; session-packets: excluded entirely, see render.js's own comment
Object.keys(labels).filter((c) => !specialCased.has(c)).forEach((cat) => {
  check(`CATEGORY_TARGETS["${cat}"] is a positive number`, typeof targets[cat] === "number" && targets[cat] > 0, targets[cat]);
});

console.log("\n-- Test 2: a fully-archived 5e-ruleset world (spells included) computes a clean, non-NaN overallPct via the real DOM output --");
// enabledMap left unset (no cached category config) so every row,
// spells included, passes the "is this category enabled" filter --
// the actual state on a freshly-loaded homepage before that cache warms.
const ctx2 = loadRenderJs({});
const host2 = makeFakeElement();
ctx2.document.getElementById = (id) => (id === "world-status-panel" ? host2 : makeFakeElement());
ctx2.renderWorldStatusPanel(seededManifests());
check("panel HTML contains no NaN anywhere", !host2.innerHTML.includes("NaN"), host2.innerHTML.slice(0, 200));
check("a fully-archived world reaches the 'fully archived' congratulations state", host2.innerHTML.includes("fully archived"), host2.innerHTML.slice(0, 200));

console.log("\n-- Test 3: a partially-archived 5e-ruleset world (spells present but empty) still renders a real, non-NaN progress width --");
const ctx3 = loadRenderJs({});
const host3 = makeFakeElement();
ctx3.document.getElementById = (id) => (id === "world-status-panel" ? host3 : makeFakeElement());
ctx3.renderWorldStatusPanel(seededManifests({ spells: [] }));
check("panel HTML contains no NaN anywhere", !host3.innerHTML.includes("NaN"), host3.innerHTML.slice(0, 300));
const widthMatch = host3.innerHTML.match(/width:(-?\d+(?:\.\d+)?)%/);
check("progress bar has a real numeric width (not NaN, not missing)", !!widthMatch, host3.innerHTML.slice(0, 300));
if (widthMatch) {
  const widthPct = Number(widthMatch[1]);
  check("progress bar width is a valid percentage between 0 and 100", widthPct >= 0 && widthPct <= 100, widthPct);
}

console.log(`\n${failures.length === 0 ? "ALL PASSED" : `${failures.length} FAILED`}`);
process.exit(failures.length === 0 ? 0 : 1);
