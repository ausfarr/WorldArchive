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
        json: async () => ({
          content: [{ type: "text", text: "A weathered fixer leans against a rusted support beam in a wide horizontal composition, subterranean corridor visible on either side, arms crossed, sizing up the viewer. Painterly digital illustration with heavy shadow and a single dramatic light source." }]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        content: [{
          type: "text",
          text: JSON.stringify({
            id: "vess-okoro", name: "Vess Okoro", callsign: "The Fixer",
            roleArchetype: "Informant/Fixer", faction: "unaligned", age: 41,
            signatureQuote: "Everyone's got a price. Yours is just information.",
            physicalDescription: "Patchwork coat over salvaged tech.",
            traits: ["watchful"], contradiction: "Sells secrets, keeps one.",
            wants: "Stay alive.", actuallyNeeds: "A non-transactional bond.",
            speech: { register: "clipped", rhythm: "guarded", tic: "quotes a price", neverSay: "trust me" },
            relationships: [{ type: "Faction allegiance", toId: null, toCategory: null, toLabel: "Unaligned", why: "Neutral by trade." }],
            dialogue: { openingLine: "Talk's not free.", branches: [{ toneLabel: "If you pay", reply: "Smart." }] },
            questHook: null, designNotes: "First Informant/Fixer, no collision."
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
const generateRoute = require("../routes/generate");
const app = express();
app.use(express.json());
app.use("/api", generateRoute);

const server = app.listen(4008, async () => {
  const res = await fetch("http://localhost:4008/api/generate-npc", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", role: "Informant/Fixer", faction: "" })
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Body:", JSON.stringify(data, null, 2));
  server.close(); process.exit(0);
});
