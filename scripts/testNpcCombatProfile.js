// scripts/testNpcCombatProfile.js
//
// Phase 7 (NPCs) regression test. lib/entryTemplate.js's buildBodyHtml
// is the SHARED NPC template used by every world regardless of ruleset
// -- this test exists specifically to guarantee the Combat Profile
// addition never changes output for an NPC that doesn't have one (every
// Echoes NPC, and every 5e NPC created before this phase shipped), plus
// a few checks that it renders correctly when present.
//
// Run with: node scripts/testNpcCombatProfile.js

const { buildBodyHtml } = require("../lib/entryTemplate");
const { DEFAULT_NPC_COMBAT_PROFILE } = require("../lib/rulesets/5e/npcCombatDefaults");
const { DEFAULT_NPC_COMBAT_PROFILE: DEFAULT_NPC_COMBAT_PROFILE_PF2E } = require("../lib/rulesets/pf2e/npcCombatDefaults");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

const BASE_NPC = {
  id: "test-npc",
  name: "Rin Okafor",
  signatureQuote: "Trust is a currency I don't extend twice.",
  physicalDescription: "Tall, sharp-eyed, always in motion.",
  age: 34,
  traits: ["guarded", "meticulous"],
  contradiction: "Fiercely loyal to people she claims not to trust.",
  wants: "Control over the district's supply lines.",
  actuallyNeeds: "Someone to actually rely on.",
  speech: { register: "clipped", rhythm: "fast", tic: "counts on fingers", neverSay: "I'm sorry" },
  relationships: [{ type: "Rival", toId: null, toCategory: null, toLabel: "The Ledger Boys", why: "Territory dispute." }],
  designNotes: "Fills a fixer/informant gap.",
  faction: "unaligned"
};

function testNoCombatProfileIsUnchanged() {
  console.log("\nRegression: NPC WITHOUT combatProfile (every Echoes NPC, every pre-Phase-7 5e NPC):");
  const html = buildBodyHtml(BASE_NPC);
  check("does NOT include a Combat Profile heading", !html.includes("Combat Profile"));
  check("still includes every existing section (Personality/Motivation/Speech/Relationships/Design Notes)",
    html.includes("Personality") && html.includes("Motivation") && html.includes("Speech Pattern") && html.includes("Relationships") && html.includes("Design Notes"));
  check("still includes the NPC's own content (quote, traits)", html.includes("Trust is a currency") && html.includes("guarded"));
}

function testDefaultCombatProfileRenders() {
  console.log("\nDefault combat profile (Commoner-equivalent, real SRD stats):");
  const npc = { ...BASE_NPC, combatProfile: DEFAULT_NPC_COMBAT_PROFILE };
  const html = buildBodyHtml(npc);
  check("includes a Combat Profile heading, labeled as default", html.includes("Combat Profile (default"));
  check("AC 10", /Armor Class<\/th><td>10\b/.test(html), html.match(/Armor Class[\s\S]{0,20}/));
  check("HP 4 (1d8)", html.includes("4 (1d8)"));
  check("CR 0, 10 XP", html.includes("0 (10 XP)"));
  check("Club action present", html.includes("Club"));
  check("still includes Design Notes after the combat profile section", html.includes("Design Notes"));
}

function testUpgradedCombatProfileRenders() {
  console.log("\nUpgraded (Combatant) profile -- not labeled as default:");
  const upgraded = {
    ...DEFAULT_NPC_COMBAT_PROFILE,
    armorClass: 15,
    hitPoints: 45,
    abilities: { str: 14, dex: 16, con: 13, int: 10, wis: 12, cha: 8 },
    challengeRating: { cr: "2", xp: 450, estimated: true },
    actions: [{ name: "Twin Daggers", description: "Melee Weapon Attack: +5 to hit. Hit: 8 (2d4+3) piercing damage." }],
    isDefaultProfile: false
  };
  const npc = { ...BASE_NPC, combatProfile: upgraded };
  const html = buildBodyHtml(npc);
  check("Combat Profile heading present WITHOUT '(default...' label", html.includes("Combat Profile</h2>") && !html.includes("Combat Profile (default"));
  check("upgraded AC 15 shown", /Armor Class<\/th><td>15\b/.test(html));
  check("upgraded CR 2 shown (estimated badge present)", html.includes("2 (450 XP)") && html.includes("estimated"));
  check("Twin Daggers action shown", html.includes("Twin Daggers"));
}

function testPf2eDefaultCombatProfileRenders() {
  console.log("\nPF2e default combat profile (computed via verified Building Creatures math at level 0, low tier):");
  const npc = { ...BASE_NPC, combatProfile: DEFAULT_NPC_COMBAT_PROFILE_PF2E };
  const html = buildBodyHtml(npc);
  check("dispatches to the PF2e renderer, not 5e's (no 'Armor Class' 5e-labeled row)", !html.includes("Armor Class</th>"));
  check("includes a Combat Profile heading, labeled as default", html.includes("Combat Profile (default"));
  check("PF2e-shaped Level row present", /Level<\/th><td>0\b/.test(html), html.match(/Level[\s\S]{0,20}/));
  check("PF2e AC row present (different label than 5e's)", html.includes("<th>AC</th>"));
  check("Fist strike present", html.includes("Fist"));
  check("still includes Design Notes after the combat profile section", html.includes("Design Notes"));
}

function testPf2eUpgradedCombatProfileRenders() {
  console.log("\nPF2e upgraded (Combatant) profile -- not labeled as default:");
  const upgraded = {
    ...DEFAULT_NPC_COMBAT_PROFILE_PF2E,
    level: 3,
    armorClass: 19,
    hitPoints: 45,
    abilities: { str: 3, dex: 2, con: 2, int: 0, wis: 1, cha: 0 },
    melee: [{ name: "Longsword", bonus: 11, traits: ["versatile", "P"], description: "2d8+5 slashing" }],
    isDefaultProfile: false
  };
  const npc = { ...BASE_NPC, combatProfile: upgraded };
  const html = buildBodyHtml(npc);
  check("Combat Profile heading present WITHOUT '(default...' label", html.includes("Combat Profile</h2>") && !html.includes("Combat Profile (default"));
  check("upgraded level 3 shown", /Level<\/th><td>3\b/.test(html));
  check("Longsword strike shown", html.includes("Longsword"));
}

function testRulesetFallbackDefaultsTo5e() {
  console.log("\nA combatProfile with no `ruleset` field (every profile saved before this field existed) falls back to the 5e renderer:");
  const legacyProfile = { ...DEFAULT_NPC_COMBAT_PROFILE };
  delete legacyProfile.ruleset;
  const npc = { ...BASE_NPC, combatProfile: legacyProfile };
  const html = buildBodyHtml(npc);
  check("still renders via the 5e template (Armor Class label present)", html.includes("Armor Class</th>"));
}

function main() {
  testNoCombatProfileIsUnchanged();
  testDefaultCombatProfileRenders();
  testUpgradedCombatProfileRenders();
  testPf2eDefaultCombatProfileRenders();
  testPf2eUpgradedCombatProfileRenders();
  testRulesetFallbackDefaultsTo5e();

  console.log("\n" + "=".repeat(50));
  if (failures.length) {
    console.log(`${failures.length} assertion(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log("All assertions passed.");
  }
}

main();
