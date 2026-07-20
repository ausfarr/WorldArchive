process.env.ANTHROPIC_API_KEY = "test-key";
process.env.GEMINI_API_KEY = "test-key";

const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (typeof url === "string" && url.includes("anthropic.com")) {
    const body = JSON.parse(opts.body);
    const isArtCall = body.system.includes("image-generation prompts");
    if (isArtCall) {
      return {
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "A hulking security drone looms in a wide horizontal composition." }] })
      };
    }
    return {
      ok: true,
      json: async () => ({
        content: [{
          type: "text",
          text: JSON.stringify({
            id: "containment-warden",
            name: "Containment Warden",
            faction: "preservation",
            tier: "Elite",
            role: "Crowd Control / Field Enforcer",
            signatureQuote: "Compliance is not optional. It is inevitable.",
            flavor: "A segmented white chassis on four spider-like limbs, a single blue sensor-eye tracking movement.",
            attributes: { body: 11, reflex: 12, knowledge: 9, presence: 13, sanity: 6, fate: 4 },
            abilities: [
              { name: "Containment Field", kind: "Active", flavor: "Deploys a stasis bubble.", effect: "Roots one target for 2 turns.", scaling: "Root duration bonus = PRESENCE/13 ≈ 1.0 turns" },
              { name: "Protocol Override", kind: "Passive", flavor: "Ignores minor damage.", effect: "Reduces incoming damage by a flat percent.", scaling: "Reduction = BASE(10%) + (SANITY/10) ≈ 10.6%" }
            ],
            phaseChange: null,
            hexTongue: null,
            combatNotes: { positioning: "Front Row", applies: "Root", vulnerableTo: "EMP/tech damage", drops: "Scrap, rare Data Drive" },
            designNotes: "First Preservation Elite with a hard-CC root effect — distinct from Stasis Marshal's single-target hold."
          })
        }]
      })
    };
  }
  if (typeof url === "string" && url.includes("gemini-3.1-flash-image")) {
    const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: tinyPng } }] } }] }) };
  }
  return originalFetch(url, opts);
};

const express = require("express");
const generateEnemyRoute = require("../routes/generateEnemy");
const app = express();
app.use(express.json());
app.use("/api", generateEnemyRoute);

const server = app.listen(4009, async () => {
  const res = await fetch("http://localhost:4009/api/generate-enemy", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", tier: "Elite", faction: "preservation" })
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Body:", JSON.stringify(data, null, 2));

  const fs = require("fs");
  const path = require("path");
  const dataText = fs.readFileSync(path.join(__dirname, "..", "archive", "enemies", "data", "containment-warden.js"), "utf8");
  console.log("\\n=== Generated bodyHtml derived stats section ===");
  const match = dataText.match(/<h2>Derived Stats<\/h2>[\s\S]*?<\/table>/);
  console.log(match ? match[0] : "NOT FOUND");

  const { loadWindowExport } = require("../lib/roster");
  const parsed = loadWindowExport(dataText, "ENTRY");
  console.log("\\nRound-trip parse OK:", !!parsed);
  console.log("Tier tag class correct (tier-elite):", dataText.includes('class="tag tier-elite"'));

  server.close(); process.exit(0);
});
