// routes/generateSpell.js
//
// Multi-ruleset genericization, Phase 4 (Spells) + PF2e expansion.
// Brand-new category -- no Echoes equivalent, so unlike
// routes/generateEnemy.js there's no "existing code path to preserve"
// branch here. requireCategoryAvailable("spells") turns away any
// ruleset without a `spells` registry entry with a clean 501 --
// currently that's 'echoes' (no spell system at all) and 'generic' (no
// fixed system to hang a spell category off of).

const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { requireCategoryAvailable } = require("../middleware/requireCategoryAvailable");
const { callClaudeExpectingJson } = require("../lib/claude");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");
const { listEntries, getEntry } = require("../lib/entriesRepo");
const { getRuleset } = require("../lib/worldConfigRepo");

const { buildHomebrewSpellSystemPrompt } = require("../prompts/rulesets/5e/spellContentPrompt");
const { save5eSpellEntry } = require("../lib/rulesets/5e/spellRepo");
const { slugify, buildSpellBodyHtml } = require("../lib/rulesets/5e/spellTemplate");
const { isValidSpellLevel } = require("../lib/rulesets/5e/spellFormulas");

const { buildHomebrewSpellSystemPrompt: buildHomebrewPf2eSpellSystemPrompt } = require("../prompts/rulesets/pf2e/spellContentPrompt");
const { savePf2eSpellEntry } = require("../lib/rulesets/pf2e/spellRepo");
const { slugify: slugifyPf2e, buildSpellBodyHtml: buildSpellBodyHtmlPf2e } = require("../lib/rulesets/pf2e/spellTemplate");
const { isValidRank } = require("../lib/rulesets/pf2e/spellFormulas");

const router = express.Router();

router.post("/generate-spell", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, requireCategoryAvailable("spells"), async (req, res) => {
  try {
    const ruleset = await getRuleset(req.worldId);
    if (ruleset === "pf2e") {
      return await handlePf2eSpellGenerate(req, res);
    }
    return await handle5eSpellGenerate(req, res);
  } catch (err) {
    console.error("Spell generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

async function handle5eSpellGenerate(req, res) {
  const worldId = req.worldId;
  const { name, level, school, fillExistingId } = req.body || {};

  let existingEntry = null;
  let isRegenerate = false;
  if (fillExistingId) {
    const manifest = await listEntries(worldId, "spells");
    const manifestEntry = manifest.find((m) => m.id === fillExistingId);
    if (!manifestEntry) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No existing spell entry found with id '${fillExistingId}'` });
    }
    const full = await getEntry(worldId, "spells", fillExistingId);
    existingEntry = { manifestEntry, raw: full && full.raw ? full.raw : null, bodyHtml: full ? full.bodyHtml : null };
    isRegenerate = !manifestEntry.locked;
  }

  if (level != null && !isValidSpellLevel(level)) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "Spell level must be an integer 0-9." });
  }

  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "spells" });
  const rosterEntries = await listEntries(worldId, "spells", { locked: false });
  const rosterContext = rosterEntries.length
    ? rosterEntries.map((e) => `- ${e.id} | ${e.name}: Level ${(e.level != null ? e.level : "?")}`).join("\n")
    : "No spells archived yet -- any concept is available.";

  const systemPrompt = buildHomebrewSpellSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, level, school });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the spell now.", maxTokens: 1500 });

  if (!isValidSpellLevel(proposed.level)) {
    // The model is instructed to only return 0-9, but a stray value
    // shouldn't corrupt a saved entry -- clamp rather than reject the
    // whole generation over a single out-of-range field.
    proposed.level = Math.max(0, Math.min(9, Math.round(Number(proposed.level) || 0)));
  }

  const spell = {
    ...proposed,
    id: fillExistingId || slugify(proposed.name),
    sourceMode: "homebrew"
  };
  if (existingEntry) spell.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildSpellBodyHtml(spell);
    return res.json({ preview: true, mode: "regenerate", category: "spells", id: spell.id, name: spell.name, entry: spell, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await save5eSpellEntry(worldId, spell);
  res.json({ preview: false, id: spell.id, name: spell.name, level: spell.level, summary: spell.designNotes });
}

// ============================================================
// PF2e path -- Homebrew tier only, see
// prompts/rulesets/pf2e/spellContentPrompt.js's header. "rank" is
// PF2e's term for spell level (1-10); a model response outside that
// range gets clamped rather than rejecting the whole generation, same
// defensive pattern as the 5e branch above.
// ============================================================
async function handlePf2eSpellGenerate(req, res) {
  const worldId = req.worldId;
  const { name, rank, fillExistingId } = req.body || {};

  let existingEntry = null;
  let isRegenerate = false;
  if (fillExistingId) {
    const manifest = await listEntries(worldId, "spells");
    const manifestEntry = manifest.find((m) => m.id === fillExistingId);
    if (!manifestEntry) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No existing spell entry found with id '${fillExistingId}'` });
    }
    const full = await getEntry(worldId, "spells", fillExistingId);
    existingEntry = { manifestEntry, raw: full && full.raw ? full.raw : null, bodyHtml: full ? full.bodyHtml : null };
    isRegenerate = !manifestEntry.locked;
  }

  if (rank != null && !isValidRank(rank)) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "Spell rank must be an integer 1-10." });
  }

  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "spells" });
  const rosterEntries = await listEntries(worldId, "spells", { locked: false });
  const rosterContext = rosterEntries.length
    ? rosterEntries.map((e) => `- ${e.id} | ${e.name}: Rank ${(e.rank != null ? e.rank : "?")}`).join("\n")
    : "No spells archived yet -- any concept is available.";

  const systemPrompt = buildHomebrewPf2eSpellSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, rank });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the spell now.", maxTokens: 1500 });

  if (!isValidRank(proposed.rank)) {
    proposed.rank = Math.max(1, Math.min(10, Math.round(Number(proposed.rank) || 1)));
  }

  const spell = {
    ...proposed,
    id: fillExistingId || slugifyPf2e(proposed.name),
    sourceMode: "homebrew"
  };
  if (existingEntry) spell.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildSpellBodyHtmlPf2e(spell);
    return res.json({ preview: true, mode: "regenerate", category: "spells", id: spell.id, name: spell.name, entry: spell, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await savePf2eSpellEntry(worldId, spell);
  res.json({ preview: false, id: spell.id, name: spell.name, rank: spell.rank, summary: spell.designNotes });
}

module.exports = router;
