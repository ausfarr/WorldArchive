// routes/debugCompareTextModels.js
//
// TEMPORARY debug route -- runs the same NPC-generation prompt against
// 5 candidate text models (Sonnet 4.6, Haiku 4.5, Gemini 3.1 Pro,
// Gemini 3.6 Flash, Gemini 3.5 Flash-Lite) and returns them side by
// side as JSON, so quality/cost/speed can be compared without needing
// shell access on Render.
//
// This exists because Render's free/lower tiers don't expose a Shell
// tab the way Replit did -- see scripts/compareTextModels.js for the
// original shell-script version this was converted from. Mounted the
// same way routes/adminCost.js is: gated by resolveTenant (needs a
// logged-in user) + a hardcoded admin-email allowlist, NOT public.
//
// DELETE THIS FILE AND ITS server.js require/app.use LINE once you're
// done comparing models -- it's a one-time diagnostic tool, not a
// permanent feature, and it makes live API calls to Claude + Gemini
// (real cost, same as any other generation) every time it's hit.
//
// Usage once deployed:
//   GET /api/debug/compare-text-models
//   GET /api/debug/compare-text-models?role=Merchant&faction=ferro-kings
// (worldId defaults to your own logged-in world; pass ?worldId=... to
// point at a different one.)

const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { buildRosterContext } = require("../lib/roster");
const { buildNpcContentSystemPrompt } = require("../prompts/npcContentPrompt");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");

const router = express.Router();

// Same allowlist pattern as routes/adminCost.js -- keep in sync manually,
// this is intentionally not a shared constant to avoid coupling a
// throwaway debug route to the permanent admin module.
const ADMIN_EMAILS = ["ausfarr@gmail.com"];

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
  return Number(((inputTokens / 1e6) * rate[0] + (outputTokens / 1e6) * rate[1]).toFixed(4));
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

function flattenSystemPrompt(systemPromptBlocks) {
  if (typeof systemPromptBlocks === "string") return systemPromptBlocks;
  return systemPromptBlocks.map((b) => b.text).join("\n\n");
}

router.get("/debug/compare-text-models", async (req, res) => {
  try {
    if (!req.userEmail || !ADMIN_EMAILS.includes(req.userEmail)) {
      return res.status(403).json({ error: "Not authorized." });
    }

    const worldId = req.query.worldId || req.worldId;
    const role = req.query.role || "Informant/Fixer";
    const faction = req.query.faction || "";
    const name = req.query.name || "";

    const rosterContext = await buildRosterContext(worldId);
    const loreContext = await getLoreContext(worldId, { category: "npcs", faction });
    const settingContext = await getSettingContext(worldId);
    const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

    const systemPromptBlocks = buildNpcContentSystemPrompt({
      settingContext, loreContext, factionOptionsText, rosterContext,
      name, role, faction, existingContent: null
    });
    const systemPromptFlat = flattenSystemPrompt(systemPromptBlocks);
    const userMessage = "Generate the NPC now.";

    const results = [];

    for (const model of ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]) {
      const start = Date.now();
      try {
        const raw = await callClaude({ systemPrompt: systemPromptBlocks, userMessage, maxTokens: 3000, model });
        results.push({ model, elapsedMs: Date.now() - start, npc: parseJsonResponse(raw), error: null });
      } catch (err) {
        results.push({ model, elapsedMs: Date.now() - start, npc: null, error: err.message });
      }
    }

    for (const model of ["gemini-3.1-pro", "gemini-3.6-flash", "gemini-3.5-flash-lite"]) {
      const start = Date.now();
      try {
        const { text, inputTokens, outputTokens } = await callGeminiText(model, systemPromptFlat, userMessage);
        results.push({
          model,
          elapsedMs: Date.now() - start,
          npc: parseJsonResponse(text),
          error: null,
          estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
          inputTokens,
          outputTokens
        });
      } catch (err) {
        results.push({ model, elapsedMs: Date.now() - start, npc: null, error: err.message });
      }
    }

    res.json({ worldId, role, faction, name, results });
  } catch (err) {
    console.error("Model comparison failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
