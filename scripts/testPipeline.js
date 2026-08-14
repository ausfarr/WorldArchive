// scripts/testPipeline.js
//
// End-to-end NPC generation pipeline test: POST /api/generate-npc with
// global.fetch mocked for the Anthropic call, verifying the real route +
// middleware + save path runs without touching a live Supabase project.
//
// Rewritten for the Postgres/multi-tenant architecture -- this script
// predated both the entries-table migration (it used to assert against
// flat `archive/npcs/data/<id>.js` + `manifest.js` files, which the app
// hasn't written since; see CLAUDE.md's "Data model" section) and the
// requireAiEnabled/enforceGenerationCap/enforceEntryCapOnGenerate
// middleware chain that now sits in front of every /generate-X route
// (added for multi-tenant billing/caps, after this script was last
// touched). Both left it permanently broken: the file-existence checks
// always failed even when the route worked, and once the middleware
// chain landed, the route errored outright trying to reach a real
// Supabase project this sandbox has no network access to. Fixed the same
// way scripts/testProceduralRulesetGenerators.js already solved this: an
// in-memory fake for @supabase/supabase-js's query-builder surface,
// injected into require.cache before any real app module loads, so the
// real code path runs unmodified against fake tables.
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.IMAGEGEN_API_KEY = "test-key";

const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (url.includes("anthropic.com")) {
    const body = JSON.parse(opts.body);
    const isArtCall = body.system.includes("image-generation prompts");
    if (isArtCall) {
      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "A weathered fixer leans against a rusted support beam, arms crossed, sizing up the viewer. She wears a mismatched patchwork coat over salvaged Board tech, mono-filament wire coiled at her belt catching a stray sodium lamp glow. Set in a dim, rust-streaked subway corridor, haze drifting through a broken skylight. Painterly digital illustration with heavy shadow and a single dramatic light source, gritty concept-art register. A tall vertical character portrait, waist-up, centered composition." }]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        content: [{
          type: "text",
          text: JSON.stringify({
            id: "vess-okoro",
            name: "Vess Okoro",
            callsign: "The Fixer",
            roleArchetype: "Informant/Fixer",
            faction: "unaligned",
            age: 34,
            signatureQuote: "Everyone's got a price. Yours is just information.",
            physicalDescription: "Patchwork coat over salvaged tech, always watching exits.",
            traits: ["watchful", "transactional", "quietly loyal to no one but herself"],
            contradiction: "Sells everyone's secrets except the one person who saved her life once.",
            wants: "Stay useful enough to stay alive.",
            actuallyNeeds: "One relationship that isn't a transaction.",
            speech: { register: "clipped street slang", rhythm: "short, guarded", tic: "answers a question with a price first", neverSay: "trust me" },
            relationships: [
              { type: "Faction allegiance", toId: null, toCategory: null, toLabel: "Unaligned — works all four factions", why: "Neutrality is her business model." }
            ],
            dialogue: {
              openingLine: "Information's not free. Neither is my time.",
              branches: [
                { toneLabel: "If you pay upfront", reply: "Smart. Most people haggle first and regret it." },
                { toneLabel: "If you threaten her", reply: "Cute. Threats are a worse currency than caps down here." }
              ]
            },
            questHook: null,
            designNotes: "First Informant/Fixer archetype generated — no collision with existing Faction Leader/Rival/Quest-Giver roster."
          })
        }]
      })
    };
  }
  if (url.includes("googleapis.com")) {
    // 1x1 transparent PNG, base64
    const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ inlineData: { data: tinyPng } }] } }]
      })
    };
  }
  return originalFetch(url, opts);
};

require("./lib/fakeSupabase").install();

const express = require("express");
const generateRoute = require("../routes/generate");
const { getEntry } = require("../lib/entriesRepo");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  // Stand-in for middleware/resolveTenant.js, which this script
  // deliberately doesn't exercise (it does a real Supabase Auth JWT
  // round trip) -- every downstream route/middleware only ever reads
  // req.userId/req.worldId, so a fixed pair is enough to run the real
  // generation code path end to end.
  req.userId = "test-user";
  req.worldId = "test-world";
  next();
});
app.use("/api", generateRoute);

const server = app.listen(4001, async () => {
  const res = await fetch("http://localhost:4001/api/generate-npc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", role: "Informant/Fixer", faction: "" })
  });
  const data = await res.json();
  console.log("Response status:", res.status);
  console.log("Response body:", JSON.stringify(data, null, 2));

  const saved = await getEntry("test-world", "npcs", "vess-okoro");
  console.log("Entry saved to entries table:", !!saved);
  console.log("Name matches:", saved && saved.name === "Vess Okoro");
  console.log("bodyHtml rendered:", !!(saved && saved.bodyHtml));

  server.close();
  process.exit(0);
});
