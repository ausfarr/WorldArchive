// scripts/testSpellRosterCap.js
//
// Regression test for lib/roster.js's buildSpellRosterContext() and
// routes/generateSpell.js's use of it. Before this fix, generateSpell.js
// built its homebrew-mode roster context inline with a raw, uncapped
// `listEntries(worldId, "spells")` map/join -- unlike every sibling
// category (NPCs, Enemies, Items, Classes, Survivors, Logs, Locations),
// which all go through lib/roster.js's splitRosterForCap() and its
// MAX_FULL_ROSTER_LINES (60) cap. That means a world's Spell list was the
// one category whose homebrew-generation prompt cost grew unboundedly
// with its own history instead of being bounded like everything else --
// see roster.js's header comment on why that cap exists (a category's
// roster context alone crosses 100% of a typical generation call's cost
// around ~390 entries without it).
//
// Uses the same in-memory Supabase fake scripts/testPipeline.js and
// friends share (scripts/lib/fakeSupabase.js), so it runs offline with no
// real credentials.
//
// Run with: node scripts/testSpellRosterCap.js

const { install, db } = require("./lib/fakeSupabase");
install();

const { buildSpellRosterContext } = require("../lib/roster");

const WORLD = "world-spellrostercap";
const MAX_FULL_ROSTER_LINES = 60;

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail !== undefined ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function resetDb() {
  db.entries.length = 0;
}

function seedSpell(i) {
  db.entries.push({
    world_id: WORLD,
    category: "spells",
    entry_id: `spell-${i}`,
    name: `Spell ${i}`,
    subtitle: `Level ${i % 9} — School`,
    faction: null,
    tags_json: [],
    body_html: "<p></p>",
    raw_json: { level: i % 9, sourceMode: "homebrew" },
    locked: false,
    created_at: new Date(2020, 0, 1 + i).toISOString()
  });
}

async function run() {
  console.log("=== testSpellRosterCap ===\n");

  // ---- Empty world: explanatory fallback line, not a blank/dangling context ----
  resetDb();
  const emptyContext = await buildSpellRosterContext(WORLD);
  check("empty world returns explanatory fallback text", emptyContext === "No spells archived yet -- any concept is available.", emptyContext);

  // ---- Under the cap: every spell listed individually, no overflow note ----
  resetDb();
  const smallCount = 10;
  for (let i = 0; i < smallCount; i++) seedSpell(i);
  const smallContext = await buildSpellRosterContext(WORLD);
  const smallLines = smallContext.split("\n").filter((l) => l.startsWith("- "));
  check(`${smallCount} spells: all ${smallCount} listed individually`, smallLines.length === smallCount, smallLines.length);
  check("under cap: no overflow note", !smallContext.includes("older entries not shown"), smallContext);

  // ---- Over the cap: this is the actual bug -- pre-fix this listed every ----
  // ---- spell uncapped; post-fix it's bounded at MAX_FULL_ROSTER_LINES.   ----
  resetDb();
  const bigCount = 75;
  for (let i = 0; i < bigCount; i++) seedSpell(i);
  const bigContext = await buildSpellRosterContext(WORLD);
  const bigLines = bigContext.split("\n").filter((l) => l.startsWith("- "));
  check(`${bigCount} spells: capped at ${MAX_FULL_ROSTER_LINES} individually-listed lines, not all ${bigCount}`, bigLines.length === MAX_FULL_ROSTER_LINES, bigLines.length);
  check("over cap: overflow note present and reports the right count", bigContext.includes(`+ ${bigCount - MAX_FULL_ROSTER_LINES} older entries not shown individually`), bigContext);

  // ---- Sanity: a raw, uncapped listEntries() over the same seed WOULD have ----
  // ---- produced 75 lines -- demonstrates the fixed function is actually ----
  // ---- doing the capping, not just coincidentally matching a small fixture. ----
  const { listEntries } = require("../lib/entriesRepo");
  const uncapped = await listEntries(WORLD, "spells", { locked: false });
  check(`sanity: the underlying data really does have all ${bigCount} rows (cap is applied in JS, not by the query)`, uncapped.length === bigCount, uncapped.length);

  console.log(`\n${failures.length === 0 ? "ALL PASSED" : `${failures.length} FAILED`}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
