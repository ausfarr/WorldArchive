// scripts/compareTextModels.js
//
// Runs the SAME NPC generation prompt (real prompt builder, real world
// context) against 5 candidate text models and prints them side by side
// with latency + estimated cost, so quality can be eyeballed rather than
// guessed at. Doesn't write anything to the archive/DB -- read-only
// comparison, safe to run against a real live world.
//
// Usage:
//   WORLD_ID=<your-world-id> node scripts/compareTextModels.js
//   WORLD_ID=<your-world-id> node scripts/compareTextModels.js "Role: Merchant" "Faction: preservation"
//
// Requires ANTHROPIC_API_KEY and GEMINI_API_KEY in the environment
// (same as production -- run this in Replit's Shell where Secrets are
// already loaded, not locally).

const { callClaude, parseJsonResponse } = require("../lib/claude");
const { buildRosterContext } = require("../lib/roster");
const { buildNpcContentSystemPrompt } = require("../prompts/npcContentPrompt");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");

const WORLD_ID = process.env.WORLD_ID;
if (!WORLD_ID) {
  console.error("Set WORLD_ID env var to a real world id before running this script.");
  process.exit(1);
}

// Same test character concept for every model -- change these to taste,
// but keep them identical across a single run for a fair comparison.
const ROLE = process.env.TEST_ROLE || "Informant/Fixer";
const FACTION = process.env.TEST_FACTION || "";
const NAME = process.env.TEST_NAME || "";

// Pricing per million tokens, input/output. Update if rates change --
// these are just for this script's estimate column, not billing.
const RATES = {
  "claude-sonnet-4-6": [3.00, 15.00],
  "claude-haiku-4-5-20251001": [1.00, 5.00],
  "gemini-3.1-pro": [2.00, 12.00],
  "gemini-3.6-flash": [1.50, 7.50],
  "gemini-3.5-flash-lite": [0.30, 2.50]
};

function estimateCost(model, inputTokens, outputTokens) {
  const rate = RATES[model];
  if (!rate || inputTokens == null || outputTokens == null) return null;
  return (inputTokens / 1e6) * rate[0] + (outputTokens / 1e6) * rate[1];
}

async function callGeminiText(model, systemPromptText, userMessage) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPromptText }] },
      contents: [{ parts: [{ text: userMessage }] }]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const textPart = data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!textPart) throw new Error("No text content in Gemini response: " + JSON.stringify(data));
  const usage = data.usageMetadata || {};
  return {
    text: textPart,
    inputTokens: usage.promptTokenCount ?? null,
    outputTokens: usage.candidatesTokenCount ?? null
  };
}

// The prompt builder returns Claude's cache-block array shape. Flatten
// it to a plain string for Gemini calls (Gemini doesn't use the same
// caching mechanism) -- content is identical either way, just reformatted.
function flattenSystemPrompt(systemPromptBlocks) {
  if (typeof systemPromptBlocks === "string") return systemPromptBlocks;
  return systemPromptBlocks.map((b) => b.text).join("\n\n");
}

function summarize(npc) {
  if (!npc) return "(failed to parse)";
  return [
    `  Name: ${npc.name}  (${npc.roleArchetype}, ${npc.faction})`,
    `  Quote: "${npc.signatureQuote}"`,
    `  Traits: ${(npc.traits || []).join(", ")}`,
    `  Contradiction: ${npc.contradiction}`,
    `  Wants: ${npc.wants}`,
    `  Actually needs: ${npc.actuallyNeeds}`,
    `  Speech tic: ${npc.speech?.tic}`
  ].join("\n");
}

async function run() {
  console.log(`Building shared context for world ${WORLD_ID}...\n`);
  const rosterContext = await buildRosterContext(WORLD_ID);
  const loreContext = await getLoreContext(WORLD_ID, { category: "npcs", faction: FACTION });
  const settingContext = await getSettingContext(WORLD_ID);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(WORLD_ID));

  const systemPromptBlocks = buildNpcContentSystemPrompt({
    settingContext, loreContext, factionOptionsText, rosterContext,
    name: NAME, role: ROLE, faction: FACTION, existingContent: null
  });
  const systemPromptFlat = flattenSystemPrompt(systemPromptBlocks);
  const userMessage = "Generate the NPC now.";

  const results = [];

  // Claude models -- reuse the real caching-shaped prompt + real callClaude.
  for (const model of ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]) {
    const start = Date.now();
    try {
      const raw = await callClaude({ systemPrompt: systemPromptBlocks, userMessage, maxTokens: 3000, model });
      const elapsed = Date.now() - start;
      const npc = parseJsonResponse(raw);
      results.push({ model, elapsed, npc, error: null });
    } catch (err) {
      results.push({ model, elapsed: Date.now() - start, npc: null, error: err.message });
    }
  }

  // Gemini models -- flattened plain-string system prompt.
  for (const model of ["gemini-3.1-pro", "gemini-3.6-flash", "gemini-3.5-flash-lite"]) {
    const start = Date.now();
    try {
      const { text, inputTokens, outputTokens } = await callGeminiText(model, systemPromptFlat, userMessage);
      const elapsed = Date.now() - start;
      const npc = parseJsonResponse(text);
      results.push({ model, elapsed, npc, error: null, inputTokens, outputTokens });
    } catch (err) {
      results.push({ model, elapsed: Date.now() - start, npc: null, error: err.message });
    }
  }

  console.log("=".repeat(70));
  console.log(`RESULTS -- Role: ${ROLE || "(unspecified)"}  Faction: ${FACTION || "(unspecified)"}`);
  console.log("=".repeat(70));

  for (const r of results) {
    console.log(`\n--- ${r.model} ---`);
    console.log(`Time: ${(r.elapsed / 1000).toFixed(1)}s`);
    if (r.error) {
      console.log(`ERROR: ${r.error}`);
      continue;
    }
    if (r.inputTokens != null) {
      const cost = estimateCost(r.model, r.inputTokens, r.outputTokens);
      console.log(`Tokens: ${r.inputTokens} in / ${r.outputTokens} out  (est. $${cost?.toFixed(4)})`);
    } else {
      console.log(`Tokens: (see costTracker log above for Claude usage/cost)`);
    }
    console.log(summarize(r.npc));
  }

  console.log("\n" + "=".repeat(70));
  console.log("Full JSON for each model:\n");
  for (const r of results) {
    console.log(`--- ${r.model} full output ---`);
    console.log(JSON.stringify(r.npc, null, 2));
    console.log();
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
