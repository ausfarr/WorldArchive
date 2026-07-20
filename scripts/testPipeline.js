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

const express = require("express");
const generateRoute = require("../routes/generate");

const app = express();
app.use(express.json());
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

  const fs = require("fs");
  const path = require("path");
  const dataFileExists = fs.existsSync(path.join(__dirname, "..", "archive", "npcs", "data", "vess-okoro.js"));
  const imageExists = fs.existsSync(path.join(__dirname, "..", "archive", "images", "vess-okoro.png"));
  const manifestText = fs.readFileSync(path.join(__dirname, "..", "archive", "npcs", "manifest.js"), "utf8");
  console.log("Data file written:", dataFileExists);
  console.log("Image written:", imageExists);
  console.log("Manifest contains new entry:", manifestText.includes("vess-okoro"));

  server.close();
  process.exit(0);
});
