// routes/generateSpell.js
//
// Multi-ruleset genericization, Phase 4 (Spells). Brand-new category --
// no Echoes equivalent, so unlike routes/generateEnemy.js there's no
// "existing code path to preserve" branch here: this route is 5e-only
// (Homebrew tier only, see prompts/rulesets/5e/spellContentPrompt.js's
// header) and requireCategoryAvailable("spells") turns away every other
// ruleset with a clean 501, including 'echoes' (which has no `spells`
// registry entry at all -- see lib/rulesets/index.js).

const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { requireCategoryAvailable } = require("../middleware/requireCategoryAvailable");
const { callClaudeExpectingJson } = require("../lib/claude");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");
const { listEntries, getEntry } = require("../lib/entriesRepo");
const { buildHomebrewSpellSystemPrompt } = require("../prompts/rulesets/5e/spellContentPrompt");
const { save5eSpellEntry } = require("../lib/rulesets/5e/spellRepo");
const { slugify, buildSpellBodyHtml } = require("../lib/rulesets/5e/spellTemplate");
const { isValidSpellLevel } = require("../lib/rulesets/5e/spellFormulas");

const router = express.Router();

router.post("/generate-spell", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, requireCategoryAvailable("spells"), async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Spell generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
