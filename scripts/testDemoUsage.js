// scripts/testDemoUsage.js
//
// End-to-end test for the unauthenticated demo generator's rate limits
// (routes/demo.js, lib/demoUsageRepo.js) -- see
// session_addendum_demo_mode_scope.md. Hits the real /api/demo/generate
// and /api/demo/generate-portrait routes repeatedly from simulated
// visitor IPs and asserts the DB-backed cap blocks at the right count.
//
// Deliberately does NOT mock the DB check itself (per this project's own
// testing convention for anything cap-shaped -- see
// scripts/testTenantIsolation.js's header) -- this needs REAL Supabase
// (SUPABASE_URL / SUPABASE_SECRET_KEY env vars), and REQUIRES
// migrations/027_demo_usage.sql to have already been run by hand against
// that project (see CLAUDE.md's migrations note -- this script doesn't
// run it, same as every other script here). It only mocks the Claude/
// Gemini HTTP calls (same technique scripts/testPipeline.js uses), so no
// real ANTHROPIC_API_KEY/GEMINI_API_KEY is needed and no generation cost
// is spent -- this test is about the cap logic, not generation quality.
//
// Simulated visitor IPs use the reserved TEST-NET-3 documentation range
// (203.0.113.0/24, RFC 5737) -- guaranteed never to be a real visitor's
// address, sent via X-Forwarded-For with app.set("trust proxy", true) on
// the test app, exactly mirroring how server.js trusts Render's edge in
// production (see server.js's trust-proxy comment).
//
// Creates and fully cleans up its own throwaway demo_usage rows (keyed
// by ip_hash for the two test IPs below) -- safe to run against the real
// project, including in CI.
//
// Run with: node scripts/testDemoUsage.js

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.GEMINI_API_KEY = "test-key";

const originalFetch = global.fetch;

function flattenSystem(system) {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) return system.map((b) => (b && b.text) || "").join("\n");
  return "";
}

const MOCK_NPC_JSON = {
  id: "test-demo-npc",
  name: "Test Demo NPC",
  callsign: null,
  roleArchetype: "Quest-Giver",
  faction: "unaligned",
  age: 40,
  signatureQuote: "Every road leads somewhere, if you're patient.",
  physicalDescription: "A weathered traveler with a well-worn pack.",
  traits: ["patient", "watchful", "quietly stubborn"],
  contradiction: "Preaches patience but can't sit still.",
  wants: "Find safe passage north.",
  actuallyNeeds: "Someone to trust the plan.",
  speech: { register: "plain", rhythm: "measured", tic: "trails off mid-sentence", neverSay: "hurry up" },
  relationships: [],
  dialogue: { openingLine: "You look like you're going somewhere.", branches: [] },
  questHook: "Needs an escort north through dangerous territory.",
  designNotes: "First Quest-Giver in this empty demo roster."
};

global.fetch = async (url, opts) => {
  if (url.includes("anthropic.com")) {
    const body = JSON.parse(opts.body);
    const systemText = flattenSystem(body.system);
    const isArtCall = systemText.includes("image-generation prompts");
    if (isArtCall) {
      return { ok: true, json: async () => ({ content: [{ type: "text", text: "A weathered traveler stands at a crossroads, wide landscape composition." }] }) };
    }
    return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(MOCK_NPC_JSON) }] }) };
  }
  if (url.includes("googleapis.com")) {
    const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: tinyPng, mimeType: "image/png" } }] } }] }) };
  }
  return originalFetch(url, opts);
};

const express = require("express");
const demoRoute = require("../routes/demo");
const { supabase } = require("../lib/supabaseClient");
const { hashIp } = require("../lib/demoUsageRepo");

const IP_A = "203.0.113.10"; // simulated visitor #1 -- hits the text cap
const IP_B = "203.0.113.20"; // simulated visitor #2 -- must stay unaffected by #1's usage

const failures = [];
function check(label, condition) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}`);
    failures.push(label);
  }
}

async function cleanup() {
  for (const ip of [IP_A, IP_B]) {
    await supabase.from("demo_usage").delete().eq("ip_hash", hashIp(ip));
  }
}

async function generate(baseUrl, ip, category = "npcs", preset = "high-fantasy") {
  const res = await fetch(`${baseUrl}/api/demo/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ category, preset })
  });
  return { status: res.status, body: await res.json() };
}

async function generatePortrait(baseUrl, ip) {
  const res = await fetch(`${baseUrl}/api/demo/generate-portrait`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ category: "npcs", subjectJson: { name: "Test Demo NPC", physicalDescription: "test" } })
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log("== Demo generator rate-limit test ==\n");

  console.log("Clearing any pre-existing test fixtures...");
  await cleanup();
  console.log("  done.\n");

  const app = express();
  app.set("trust proxy", true); // mirrors server.js -- lets X-Forwarded-For drive req.ip for this test
  app.use(express.json());
  app.use("/api/demo", demoRoute);

  const server = app.listen(4002);
  const baseUrl = "http://localhost:4002";

  try {
    console.log("Test 1: text cap blocks at 2/day for the same visitor");
    const gen1 = await generate(baseUrl, IP_A);
    check("1st generation for IP_A succeeds (200)", gen1.status === 200);
    check("1st generation returns a rendered bodyHtml", !!(gen1.body && gen1.body.bodyHtml));

    const gen2 = await generate(baseUrl, IP_A);
    check("2nd generation for IP_A succeeds (200)", gen2.status === 200);

    const gen3 = await generate(baseUrl, IP_A);
    check("3rd generation for IP_A is rejected (429)", gen3.status === 429);
    check("3rd generation's rejection reports cap=2", gen3.body && gen3.body.cap === 2);
    check("3rd generation's rejection reports count still at 2 (not incremented past cap)", gen3.body && gen3.body.count === 2);
    console.log("");

    console.log("Test 2: a different visitor is unaffected by IP_A's cap");
    const genB = await generate(baseUrl, IP_B);
    check("1st generation for IP_B (a different visitor) succeeds (200)", genB.status === 200);
    console.log("");

    console.log("Test 3: portrait cap blocks at 1/day, independently of the text cap");
    const portrait1 = await generatePortrait(baseUrl, IP_A);
    check("1st portrait for IP_A succeeds (200) despite IP_A already being at its text cap", portrait1.status === 200);
    check("1st portrait returns an imageDataUrl", !!(portrait1.body && portrait1.body.imageDataUrl && portrait1.body.imageDataUrl.startsWith("data:image/png;base64,")));

    const portrait2 = await generatePortrait(baseUrl, IP_A);
    check("2nd portrait for IP_A is rejected (429)", portrait2.status === 429);
    check("2nd portrait's rejection reports cap=1", portrait2.body && portrait2.body.cap === 1);
    console.log("");
  } finally {
    server.close();
    console.log("Cleaning up test fixtures...");
    await cleanup();
    console.log("  done.\n");
  }

  if (failures.length > 0) {
    console.log(`RESULT: ${failures.length} check(s) failed:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("RESULT: all checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
