// routes/demo.js
//
// Unauthenticated demo generator -- lets a visitor generate a small,
// hard-capped number of NPCs/Enemies (text, then an optional portrait)
// with no account and no worldId. See
// session_addendum_demo_mode_scope.md for the full design and why this
// reuses the real generation pipelines (NPCs' ruleset-agnostic prompt;
// Enemies' Generic-ruleset Homebrew pipeline, since Echoes' own
// attribute formulas are as off-limits here as its setting is) rather
// than forking a parallel one.
//
// Deliberately mounted in server.js BEFORE app.use("/api", resolveTenant)
// -- same reasoning as routes/waitlist.js -- so these routes never need
// req.worldId/req.userId. Every downstream call
// (callClaudeExpectingJson/callClaude/generateImage) works unchanged
// with no request-scoped wiring; lib/costContext.js's getCostContext()
// degrades gracefully to {} outside a resolveTenant-wrapped request, so
// demo generation cost is console-logged only, not persisted to
// cost_log (see the scope doc's "known gap" note -- accepted for this
// session, not fixed here).
//
// Rate limiting is IP-based (lib/demoUsageRepo.js), which only works
// correctly because server.js now sets `trust proxy` -- see that file's
// comment for why this route would otherwise cap every visitor behind
// Render's edge together.

const express = require("express");
const { callClaude, callClaudeExpectingJson, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildNpcContentSystemPrompt } = require("../prompts/npcContentPrompt");
const { buildHomebrewGenericEnemySystemPrompt } = require("../prompts/rulesets/generic/enemyContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { buildBodyHtml: buildNpcBodyHtml, slugify: slugifyNpc } = require("../lib/entryTemplate");
const { buildEnemyBodyHtml, slugify: slugifyEnemy } = require("../lib/rulesets/generic/enemyTemplate");
const { computeDerivedStats } = require("../lib/rulesets/generic/statFormulas");
const { formatFactionOptionsForPrompt } = require("../lib/worldFlavor");
const { getDemoPreset, listDemoPresets, DEMO_GENERIC_SYSTEM } = require("../lib/demoPresets");
const {
  DEMO_TEXT_CAP,
  DEMO_PORTRAIT_CAP,
  checkAndIncrementDemoText,
  checkAndIncrementDemoPortrait,
  refundDemoText,
  refundDemoPortrait
} = require("../lib/demoUsageRepo");

const router = express.Router();

// No factions/roster exist in a demo -- reuse the exact strings the
// real prompt builders already fall back to for a brand-new, empty
// world (formatFactionOptionsForPrompt([]), buildRosterContext's own
// "No NPCs archived yet" string in lib/roster.js) rather than inventing
// new wording that could silently drift from what the model actually
// expects to see there.
const NO_FACTIONS_TEXT = formatFactionOptionsForPrompt([]);
const NO_NPC_ROSTER_TEXT = "No NPCs archived yet — any role+faction combination is available.";
const NO_ENEMY_ROSTER_TEXT = "No enemies archived yet -- any concept is available.";

async function generateDemoNpc(preset) {
  const systemPrompt = buildNpcContentSystemPrompt({
    settingContext: preset.settingContext,
    loreContext: "",
    factionOptionsText: NO_FACTIONS_TEXT,
    rosterContext: NO_NPC_ROSTER_TEXT,
    name: null,
    role: null,
    faction: null
  });
  const npc = await callClaudeExpectingJson({
    systemPrompt,
    userMessage: "Generate the NPC now.",
    maxTokens: 3000
  });
  npc.id = npc.id || slugifyNpc(npc.name);
  const bodyHtml = buildNpcBodyHtml(npc, null);
  return { category: "npcs", raw: npc, bodyHtml };
}

async function generateDemoEnemy(preset) {
  const systemPrompt = buildHomebrewGenericEnemySystemPrompt({
    settingContext: preset.settingContext,
    loreContext: "",
    factionOptionsText: NO_FACTIONS_TEXT,
    rosterContext: NO_ENEMY_ROSTER_TEXT,
    name: null,
    genericSystem: DEMO_GENERIC_SYSTEM
  });
  const proposed = await callClaudeExpectingJson({
    systemPrompt,
    userMessage: "Design the monster now.",
    maxTokens: 2000
  });
  const enemy = {
    ...proposed,
    id: slugifyEnemy(proposed.name),
    faction: null,
    derivedStats: computeDerivedStats(DEMO_GENERIC_SYSTEM, proposed.attributes),
    sourceMode: "homebrew"
  };
  const bodyHtml = buildEnemyBodyHtml(enemy, DEMO_GENERIC_SYSTEM, null);
  return { category: "enemies", raw: enemy, bodyHtml };
}

router.post("/generate", async (req, res) => {
  try {
    const { category, preset: presetKey } = req.body || {};
    if (category !== "npcs" && category !== "enemies") {
      return res.status(400).json({ error: "category must be 'npcs' or 'enemies'." });
    }
    const preset = getDemoPreset(presetKey);
    if (!preset) {
      return res.status(400).json({ error: `Unknown preset '${presetKey}'.`, presets: listDemoPresets() });
    }

    const usage = await checkAndIncrementDemoText(req.ip);
    if (!usage.allowed) {
      return res.status(429).json({
        error: "You've used your free demo generations for today. Sign up to keep building — it only takes a minute.",
        cap: DEMO_TEXT_CAP,
        count: usage.count
      });
    }

    try {
      const result = category === "npcs" ? await generateDemoNpc(preset) : await generateDemoEnemy(preset);
      res.json(result);
    } catch (genErr) {
      await refundDemoText(req.ip);
      throw genErr;
    }
  } catch (err) {
    console.error("Demo generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Portrait -- same art-prompt-writer -> Gemini chain as
// routes/generateEntryImage.js, minus the Supabase Storage upload (see
// lib/fileWriter.js's saveImage -- that's the one branch point, per the
// scope doc's "Portraits" section). subjectJson is exactly the `raw`
// object /generate above just returned -- the frontend posts it
// straight back, there's nowhere else to look it up from since nothing
// was saved.
router.post("/generate-portrait", async (req, res) => {
  try {
    const { category, subjectJson } = req.body || {};
    if (category !== "npcs" && category !== "enemies") {
      return res.status(400).json({ error: "category must be 'npcs' or 'enemies'." });
    }
    if (!subjectJson || typeof subjectJson !== "object") {
      return res.status(400).json({ error: "subjectJson is required." });
    }

    const usage = await checkAndIncrementDemoPortrait(req.ip);
    if (!usage.allowed) {
      return res.status(429).json({
        error: "You've used your free demo portrait for today. Sign up to keep building — it only takes a minute.",
        cap: DEMO_PORTRAIT_CAP,
        count: usage.count
      });
    }

    try {
      const artSystemPrompt = buildArtPromptSystemPrompt({ category, subjectJson, styleGuide: null, factionAccent: null });
      const artPrompt = await callClaude({
        systemPrompt: artSystemPrompt,
        userMessage: "Write the prompt now.",
        maxTokens: 500,
        model: HAIKU_MODEL
      });

      const { buffer, mimeType } = await generateImage(artPrompt.trim());
      const imageDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
      res.json({ imageDataUrl });
    } catch (genErr) {
      await refundDemoPortrait(req.ip);
      throw genErr;
    }
  } catch (err) {
    console.error("Demo portrait generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/presets", (req, res) => {
  res.json({ presets: listDemoPresets() });
});

module.exports = router;
