// scripts/testSessionPacket.js
//
// Session Prep Companion, Phase 4 -- end-to-end (mocked-API) test for the
// full generate -> preview -> confirm -> write path, same fakeSupabase +
// mocked global.fetch harness as scripts/testPipeline.js (see that
// file's header for why this sandbox can't reach a live Supabase project
// or make real Claude calls). Runs the real Express routes over HTTP
// (routes/generateSessionPacket.js + routes/confirmEntry.js), not direct
// lib calls, so this also exercises the actual route wiring registered
// in server.js.
//
// Covers:
//   1. Assembly resolves a seeded Quest's real NPC/Location into the
//      roster the prompt is grounded with.
//   2. A model-proposed taggedEntries reference that ISN'T on the real
//      roster is dropped rather than trusted (reference real ids, never
//      invent).
//   3. The preview response is well-formed and matches what confirm-entry
//      expects.
//   4. Confirming the preview actually writes a real "session-packets"
//      entry, browsable via GET /api/entries/session-packets.
//   5. Regenerating (fillExistingId) an existing packet re-assembles
//      against the SAME Quest it was originally generated for.
//
// Run with: node scripts/testSessionPacket.js

process.env.ANTHROPIC_API_KEY = "test-key";

const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (url.includes("anthropic.com")) {
    const body = JSON.parse(opts.body);
    const systemText = Array.isArray(body.system) ? body.system.map((b) => b.text).join("\n") : (body.system || "");
    if (systemText.includes("You are assembling a Session Packet")) {
      return jsonResponse({
        title: "The Mill's Silence",
        openingReadAloud: "Rain hammers the tin roof of the old mill as you step inside.",
        sceneBeats: [
          {
            title: "Arrival",
            description: "The party meets Miller Thom at the mill's entrance.",
            taggedEntries: [
              { category: "npcs", entryId: "miller-thom", note: "Quest-giver, grieving." },
              { category: "locations", entryId: "the-old-mill", note: "The setting." },
              { category: "npcs", entryId: "nobody-real", note: "A hallucinated reference that must be dropped." }
            ]
          },
          {
            title: "The Wheel",
            description: "Something broke the mill's wheel deliberately.",
            taggedEntries: [{ category: "locations", entryId: "the-old-mill", note: "Investigate the damage." }]
          }
        ],
        npcVoiceReminders: [{ entryId: "miller-thom", reminder: "Gentle with strangers, cold with kin -- trails off mid-sentence." }],
        complicationsDeck: [{ title: "A Second Visitor", description: "Another scavenger shows up looking for the same thing." }],
        openThreads: []
      });
    }
    throw new Error("Unhandled prompt in test mock (first 120 chars): " + systemText.slice(0, 120));
  }
  return originalFetch(url, opts);
};

function jsonResponse(payload) {
  return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(payload) }] }) };
}

require("./lib/fakeSupabase").install();

const express = require("express");
const { upsertEntry, getEntry } = require("../lib/entriesRepo");
const { createCampaignModule } = require("../lib/campaignModuleRepo");
const generateSessionPacketRoute = require("../routes/generateSessionPacket");
const confirmEntryRoute = require("../routes/confirmEntry");

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Session Packet (Phase 4) end-to-end test ==\n");

  console.log("Seeding a Location, an NPC, and a Quest...");
  await upsertEntry(WORLD_ID, "locations", { id: "the-old-mill", name: "The Old Mill", subtitle: "Ruined watermill", faction: null, tags: [], bodyHtml: "<p>t</p>", raw: { regionBiome: "riverlands" } });
  await upsertEntry(WORLD_ID, "npcs", { id: "miller-thom", name: "Miller Thom", subtitle: "Grieving caretaker", faction: null, tags: [], bodyHtml: "<p>t</p>", raw: { roleArchetype: "quest-giver" } });
  const quest = await createCampaignModule(WORLD_ID, {
    name: "The Mill's Silence",
    entries: [
      { category: "locations", entryId: "the-old-mill", role: "setting", note: "" },
      { category: "npcs", entryId: "miller-thom", role: "quest-giver", note: "" }
    ],
    createdVia: "manual"
  });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = "test-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", generateSessionPacketRoute);
  app.use("/api", confirmEntryRoute);

  const server = app.listen(4322);
  try {
    console.log("\nTest 1: generate a new Session Packet for the Quest");
    const genRes = await fetch("http://localhost:4322/api/generate-session-packet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId: quest.id })
    });
    const genData = await genRes.json();
    check("responds 200", genRes.status === 200);
    check("returns a preview, not a direct save", genData.preview === true && genData.category === "session-packets");
    check("mode is 'new'", genData.mode === "new");

    const beat1Tags = genData.entry.sceneBeats[0].taggedEntries;
    check("the hallucinated NPC reference was dropped", !beat1Tags.some((t) => t.entryId === "nobody-real"));
    check("the two real references survived and were hydrated with names", beat1Tags.length === 2 && beat1Tags.every((t) => t.name));
    check("npcVoiceReminders resolved the real NPC with a hydrated name", genData.entry.npcVoiceReminders[0].name === "Miller Thom");
    check("questName is set for a bare-quest packet", genData.entry.questName === "The Mill's Silence");
    check("bodyHtml preview links to the real NPC dossier", genData.newBodyHtmlPreview.includes("category=npcs&id=miller-thom"));

    console.log("\nTest 2: confirm the preview -- writes a real entry");
    const confirmRes = await fetch("http://localhost:4322/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "session-packets", entry: genData.entry })
    });
    const confirmData = await confirmRes.json();
    check("confirm responds 200", confirmRes.status === 200);
    check("confirm reports the right category/id", confirmData.category === "session-packets" && confirmData.id === genData.entry.id);

    const saved = await getEntry(WORLD_ID, "session-packets", genData.entry.id);
    check("the packet is retrievable via getEntry", !!saved);
    check("saved bodyHtml renders the scene beats", saved.bodyHtml.includes("Arrival"));
    check("saved raw carries the full structured packet (not just bodyHtml)", saved.raw.sceneBeats.length === 2);

    console.log("\nTest 3: regenerate (fillExistingId) re-assembles against the same Quest");
    const regenRes = await fetch("http://localhost:4322/api/generate-session-packet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fillExistingId: genData.entry.id })
    });
    const regenData = await regenRes.json();
    check("regenerate responds 200 and is mode 'regenerate'", regenRes.status === 200 && regenData.mode === "regenerate");
    check("regenerate carries forward the same questId", regenData.entry.questId === quest.id);
    check("regenerate's oldBodyHtmlPreview shows the previously-saved version", regenData.oldBodyHtmlPreview && regenData.oldBodyHtmlPreview.includes("Arrival"));
  } finally {
    server.close();
  }

  console.log("\n== Result ==");
  if (failures.length === 0) {
    console.log("ALL PASS");
    process.exit(0);
  } else {
    console.log(`${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
