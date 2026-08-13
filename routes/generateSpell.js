// routes/generateSpell.js
//
// Multi-ruleset genericization, Phase 4 (Spells). Brand-new category --
// no Echoes equivalent, so unlike routes/generateEnemy.js there's no
// "existing code path to preserve" branch here.
// requireCategoryAvailable("spells") turns away any ruleset without a
// `spells` registry entry with a clean 501 -- currently that's 'echoes'
// (no spell system at all) and 'generic' (no fixed system to hang a
// spell category off of).

const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { requireCategoryAvailable } = require("../middleware/requireCategoryAvailable");
const { callClaudeExpectingJson } = require("../lib/claude");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");
const { listEntries, getEntry } = require("../lib/entriesRepo");

const { buildHomebrewSpellSystemPrompt, buildReflavorSpellSystemPrompt } = require("../prompts/rulesets/5e/spellContentPrompt");
const { save5eSpellEntry } = require("../lib/rulesets/5e/spellRepo");
const { slugify, buildSpellBodyHtml } = require("../lib/rulesets/5e/spellTemplate");
const { isValidSpellLevel } = require("../lib/rulesets/5e/spellFormulas");
const { mapSrdSpellMechanics } = require("../lib/rulesets/5e/srdSpellMapper");
const { getSrdEntry, getSrdEntryBySlug, recordImport, isAlreadyImported } = require("../lib/srdLibraryRepo");
const { POINTS_PER_GENERATION, POINTS_PER_FIELD_ASSIST } = require("../lib/worldConfigRepo");

const router = express.Router();

router.post("/generate-spell", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, requireCategoryAvailable("spells"), async (req, res) => {
  try {
    return await handle5eSpellGenerate(req, res);
  } catch (err) {
    console.error("Spell generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

// Three tiers, dispatched by req.body.mode: 'import' (no AI, direct copy
// from srd_library), 'reflavor' (AI rewrites narrative only, mechanics
// untouched), 'homebrew' (AI invents fresh spell -- unchanged from
// before this work). Same three-tier shape as routes/generateEnemy.js's
// handle5eEnemyGenerate.
async function handle5eSpellGenerate(req, res) {
  const worldId = req.worldId;
  const { name, level, school, fillExistingId, srdLibraryId } = req.body || {};
  const mode = req.body && req.body.mode;

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

  const effectiveMode = mode || (existingEntry && existingEntry.raw && existingEntry.raw.sourceMode) || "homebrew";
  if (!["import", "reflavor", "homebrew"].includes(effectiveMode)) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "5e spell generation requires a 'mode' of 'import', 'reflavor', or 'homebrew'." });
  }

  // The generic card "Regenerate" button only ever posts { fillExistingId
  // } -- recover srdLibraryId from the existing entry's saved srdSourceId
  // when it's missing, same fallback as routes/generateEnemy.js.
  let resolvedSrdLibraryId = srdLibraryId;
  if (!resolvedSrdLibraryId && (effectiveMode === "import" || effectiveMode === "reflavor") && existingEntry && existingEntry.raw && existingEntry.raw.srdSourceId) {
    const recovered = await getSrdEntryBySlug("5e", "spells", existingEntry.raw.srdSourceId);
    if (recovered) resolvedSrdLibraryId = recovered.id;
  }

  // ---- Import: zero AI cost, direct copy from srd_library ----
  if (effectiveMode === "import") {
    if (req.refundGeneration) await req.refundGeneration();
    if (!resolvedSrdLibraryId) return res.status(400).json({ error: "Import mode requires srdLibraryId." });
    const srdRow = await getSrdEntry(resolvedSrdLibraryId);
    if (!srdRow) return res.status(404).json({ error: `No SRD library entry found with id '${resolvedSrdLibraryId}'.` });

    const alreadyImportedAs = await isAlreadyImported(worldId, resolvedSrdLibraryId);
    if (alreadyImportedAs && alreadyImportedAs !== fillExistingId) {
      return res.status(409).json({ error: `This SRD spell was already imported into this world as '${alreadyImportedAs}'.` });
    }

    const mechanics = mapSrdSpellMechanics(srdRow.data_json);
    const spell = {
      id: fillExistingId || slugify(srdRow.name),
      name: srdRow.name,
      flavor: null,
      designNotes: null,
      sourceMode: "import",
      srdSourceId: srdRow.srd_id,
      srdLicenseNote: srdRow.license_note,
      ...mechanics
    };

    if (isRegenerate) {
      const newBodyHtmlPreview = buildSpellBodyHtml(spell);
      return res.json({ preview: true, mode: "regenerate", category: "spells", id: spell.id, name: spell.name, entry: spell, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
    }

    await save5eSpellEntry(worldId, spell);
    await recordImport(worldId, resolvedSrdLibraryId, spell.id);
    return res.json({ preview: false, id: spell.id, name: spell.name, level: spell.level, summary: `Imported from 5e SRD (${srdRow.source_edition}).` });
  }

  // ---- Reflavor / Homebrew both call Claude ----
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "spells" });

  let spell;

  if (effectiveMode === "reflavor") {
    // srdLibraryId is recovered above (resolvedSrdLibraryId) from either
    // the request body (first-time reflavor) or the existing entry's
    // saved srdSourceId (a regenerate).
    if (!resolvedSrdLibraryId) return res.status(400).json({ error: "Reflavor mode requires srdLibraryId." });
    const srdRow = await getSrdEntry(resolvedSrdLibraryId);
    if (!srdRow) return res.status(404).json({ error: `No SRD library entry found with id '${resolvedSrdLibraryId}'.` });

    const systemPrompt = buildReflavorSpellSystemPrompt({ settingContext, loreContext, factionOptionsText, sourceSpell: srdRow.data_json });
    const reflavored = await callClaudeExpectingJson({ systemPrompt, userMessage: "Reflavor the spell now.", maxTokens: 1200 });

    const mechanics = mapSrdSpellMechanics(srdRow.data_json);
    spell = {
      id: fillExistingId || slugify(reflavored.name),
      name: reflavored.name,
      flavor: reflavored.flavor,
      designNotes: reflavored.designNotes,
      sourceMode: "reflavor",
      srdSourceId: srdRow.srd_id,
      srdLicenseNote: srdRow.license_note,
      ...mechanics,
      description: reflavored.description || mechanics.description
    };

    // Same Differential Billing treatment as Enemies' Reflavor tier.
    if (req.refundGeneration) await req.refundGeneration(POINTS_PER_GENERATION - POINTS_PER_FIELD_ASSIST);
  } else {
    if (level != null && !isValidSpellLevel(level)) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(400).json({ error: "Spell level must be an integer 0-9." });
    }

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

    spell = {
      ...proposed,
      id: fillExistingId || slugify(proposed.name),
      sourceMode: "homebrew"
    };
  }

  if (existingEntry) spell.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildSpellBodyHtml(spell);
    return res.json({ preview: true, mode: "regenerate", category: "spells", id: spell.id, name: spell.name, entry: spell, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await save5eSpellEntry(worldId, spell);
  res.json({ preview: false, id: spell.id, name: spell.name, level: spell.level, summary: spell.designNotes });
}

module.exports = router;
