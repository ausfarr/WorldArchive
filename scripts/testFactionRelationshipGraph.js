// scripts/testFactionRelationshipGraph.js
//
// Pure-function unit test for lib/factionTemplate.js's new
// buildRelationshipGraphSvg() -- no DB, no API keys, no mocks needed, since
// the function only ever touches the plain faction object passed in. Run
// directly: node scripts/testFactionRelationshipGraph.js

const assert = require("assert");
const { buildFactionBodyHtml, buildRelationshipGraphSvg } = require("../lib/factionTemplate");

let passed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${label}`);
  } catch (err) {
    console.error(`  FAIL - ${label}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("No relationships -- graph is skipped entirely, not an empty shell:");
check("empty array returns \"\"", () => {
  assert.strictEqual(buildRelationshipGraphSvg({ name: "The Ferro-Kings", relationships: [] }), "");
});
check("missing relationships field returns \"\"", () => {
  assert.strictEqual(buildRelationshipGraphSvg({ name: "The Ferro-Kings" }), "");
});
check("buildFactionBodyHtml with no relationships has no <svg>", () => {
  const html = buildFactionBodyHtml({ name: "The Ferro-Kings", relationships: [] }, []);
  assert.ok(!html.includes("<svg"), "expected no <svg> when there are no relationships");
  assert.ok(html.includes("rel-table"), "the plain table should still render");
});

console.log("One real relationship -- basic shape:");
const oneRel = {
  name: "The Preservation",
  relationships: [{ faction: "The Board", stance: "Open war", why: "Contest the same territory" }]
};
check("renders a wrapper, one edge, one node", () => {
  const svg = buildRelationshipGraphSvg(oneRel);
  assert.ok(svg.includes('class="rel-graph"'), "expected the wrapper div");
  assert.ok(svg.includes("<svg"), "expected an <svg> element");
  assert.strictEqual((svg.match(/<line /g) || []).length, 1, "expected exactly one edge");
  assert.strictEqual((svg.match(/<circle /g) || []).length, 2, "expected one satellite + one center circle");
  assert.ok(svg.includes("The Board"), "satellite label should include the related faction's name");
});
check("war stance maps to the primary/danger color", () => {
  const svg = buildRelationshipGraphSvg(oneRel);
  assert.ok(svg.includes('stroke="var(--neon-primary)"'), "expected the war-bucket color on the edge");
});
check("no toId means the node is not wrapped in a link", () => {
  const svg = buildRelationshipGraphSvg(oneRel);
  assert.ok(!svg.includes("<a href="), "expected no <a> wrapper when toId is unresolved");
});

console.log("Stance bucketing across the free-text spectrum the model actually writes:");
const stanceCases = [
  ["Uneasy alliance", "#e0a83c"], // "alliance" would match the ally bucket first if order were wrong -- this checks rivalry wins
  ["Trade partner", "var(--neon-cyan)"],
  ["Open war", "var(--neon-primary)"],
  ["Distant, no contact", "var(--ink-faint)"]
];
for (const [stance, expectedColor] of stanceCases) {
  check(`"${stance}" -> ${expectedColor}`, () => {
    const svg = buildRelationshipGraphSvg({
      name: "Test Faction",
      relationships: [{ faction: "Other", stance, why: "" }]
    });
    assert.ok(svg.includes(`stroke="${expectedColor}"`), `expected stroke color ${expectedColor} for stance "${stance}"`);
  });
}

console.log("A resolved toId produces a clickable dossier link:");
check("toId present -> node wrapped in <a href=\"dossier.html?...\">", () => {
  const svg = buildRelationshipGraphSvg({
    name: "The Board",
    relationships: [{ faction: "The Ferro-Kings", toId: "the-ferro-kings", stance: "Rivalry", why: "" }]
  });
  assert.ok(svg.includes('<a href="dossier.html?category=factions&id=the-ferro-kings">'), "expected a dossier link wrapping the linked node");
});

console.log("HTML/XML injection in a model-authored name or stance is escaped, not passed through:");
check("angle brackets and quotes in faction/stance/why are escaped", () => {
  const svg = buildRelationshipGraphSvg({
    name: "The <script>Board</script>",
    relationships: [{ faction: '"><img onerror=alert(1)>', stance: "Rivalry & War", why: "<b>bold</b>" }]
  });
  assert.ok(!svg.includes("<script>"), "faction name must not inject a raw <script> tag");
  assert.ok(!svg.includes("<img"), "related-faction name must not inject a raw <img> tag");
  assert.ok(!svg.includes("<b>bold</b>"), "the why text (in the tooltip) must be escaped");
});

console.log("More relationships than MAX_GRAPH_NODES (12) -- capped, with an overflow note, table unaffected:");
check("13 relationships render 12 nodes + an overflow line", () => {
  const relationships = Array.from({ length: 13 }, (_, i) => ({ faction: `Faction ${i}`, stance: "Neutral", why: "" }));
  const svg = buildRelationshipGraphSvg({ name: "Central Power", relationships });
  assert.strictEqual((svg.match(/<line /g) || []).length, 12, "expected exactly 12 edges even with 13 relationships");
  assert.ok(svg.includes("+ 1 more relationship"), "expected a singular overflow note for the 1 excluded relationship");
});
check("the plain rel-table still lists every relationship, uncapped", () => {
  const relationships = Array.from({ length: 13 }, (_, i) => ({ faction: `Faction ${i}`, stance: "Neutral", why: "" }));
  const html = buildFactionBodyHtml({ name: "Central Power", relationships }, []);
  for (let i = 0; i < 13; i++) {
    assert.ok(html.includes(`Faction ${i}`), `expected Faction ${i} in the table even though the graph caps at 12`);
  }
});

console.log(`\n${passed} check(s) passed.`);
if (process.exitCode) {
  console.error("\nSome checks FAILED.");
} else {
  console.log("\nAll checks passed.");
}
