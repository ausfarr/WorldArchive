// routes/demo.js
//
// Unauthenticated demo generator -- lets a visitor generate a small,
// hard-capped number of NPCs/Enemies (text, then an optional portrait)
// with no account and no worldId. See
// session_addendum_demo_mode_scope.md for the full design (updated:
// Enemies now go through the real 5e Homebrew pipeline, not the Generic
// ruleset's -- Austin's explicit call, since 5e is the ruleset the
// public product actually targets and the demo should read as a
// faithful preview of that, not a made-up placeholder system). NPCs stay
// on the ruleset-agnostic prompt every ruleset (including 5e) already
// shares. Neither path forks a parallel generator -- Enemies reuse
// lib/rulesets/5e/homebrewEnemyGenerator.js's generateHomebrew5eEnemy()
// via new override params added there for exactly this caller (real CR
// math, real SRD reference-monster lookup, real stat-block template),
// same "reuse it, don't fork it" rule this file already followed for
// NPCs.
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
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { buildBodyHtml: buildNpcBodyHtml, slugify: slugifyNpc } = require("../lib/entryTemplate");
const { generateHomebrew5eEnemy } = require("../lib/rulesets/5e/homebrewEnemyGenerator");
const { buildEnemyBodyHtml: buildEnemyBodyHtml5e } = require("../lib/rulesets/5e/enemyTemplate");
const { DEFAULT_NPC_COMBAT_PROFILE } = require("../lib/rulesets/5e/npcCombatDefaults");
const { formatFactionOptionsForPrompt } = require("../lib/worldFlavor");
const { getDemoPreset, listDemoPresets } = require("../lib/demoPresets");
const {
  DEMO_TEXT_CAP,
  DEMO_PORTRAIT_CAP,
  getClientIp,
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

// A visitor's own typed setting, capped and wrapped to match the shape
// lib/demoPresets.js's fixed presets already provide (a "Genre & tone: ..."
// settingContext string) -- generateDemoNpc/generateDemoEnemy below don't
// need to know the difference between the two sources. This is the actual
// point of letting a visitor type their own setting instead of only
// picking a preset: it's the one thing a canned demo can't show --
// generation grounded in *your* idea, not a generic template (see
// marketing/compare.html's "grounded, not generic" pitch). Cap length
// generously enough for a real setting blurb but far short of anything
// that would meaningfully change generation cost.
const MAX_CUSTOM_SETTING_LENGTH = 500;

function buildCustomPreset(customSetting) {
  const trimmed = String(customSetting).trim().slice(0, MAX_CUSTOM_SETTING_LENGTH);
  return { settingContext: `Genre & tone: ${trimmed}` };
}

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
  // Real 5e-ruleset worlds attach this same lightweight default combat
  // profile to every generated NPC (routes/generate.js) so an un-stat'd
  // NPC is never a hard dead-end in combat -- a static object, no
  // worldId/DB lookup involved, so it's exactly as free to attach here.
  npc.combatProfile = DEFAULT_NPC_COMBAT_PROFILE;
  const bodyHtml = buildNpcBodyHtml(npc, null);
  return { category: "npcs", raw: npc, bodyHtml };
}

async function generateDemoEnemy(preset) {
  const enemy = await generateHomebrew5eEnemy(null, {
    settingContextOverride: preset.settingContext,
    factionOptionsTextOverride: NO_FACTIONS_TEXT,
    loreContextOverride: "",
    rosterOverride: NO_ENEMY_ROSTER_TEXT
  });
  const bodyHtml = buildEnemyBodyHtml5e(enemy, null);
  return { category: "enemies", raw: enemy, bodyHtml };
}

router.post("/generate", async (req, res) => {
  try {
    const { category, preset: presetKey, customSetting } = req.body || {};
    if (category !== "npcs" && category !== "enemies") {
      return res.status(400).json({ error: "category must be 'npcs' or 'enemies'." });
    }

    let preset;
    if (typeof customSetting === "string" && customSetting.trim()) {
      preset = buildCustomPreset(customSetting);
    } else {
      preset = getDemoPreset(presetKey);
      if (!preset) {
        return res.status(400).json({ error: `Unknown preset '${presetKey}'.`, presets: listDemoPresets() });
      }
    }

    const clientIp = getClientIp(req);
    const usage = await checkAndIncrementDemoText(clientIp);
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
      await refundDemoText(clientIp);
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

    const clientIp = getClientIp(req);
    const usage = await checkAndIncrementDemoPortrait(clientIp);
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
      await refundDemoPortrait(clientIp);
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
