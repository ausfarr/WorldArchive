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
const { buildSpellRosterContext } = require("../lib/roster");

const { buildHomebrewSpellSystemPrompt, buildReflavorSpellSystemPrompt } = require("../prompts/rulesets/5e/spellContentPrompt");
const { save5eSpellEntry } = require("../lib/rulesets/5e/spellRepo");
const { slugify, buildSpellBodyHtml } = require("../lib/rulesets/5e/spellTemplate");
const { isValidSpellLevel } = require("../lib/rulesets/5e/spellFormulas");
const { mapSrdSpellMechanics } = require("../lib/rulesets/5e/srdSpellMapper");
const { getSrdEntry, getSrdEntryBySlug, recordImport, isAlreadyImported } = require("../lib/srdLibraryRepo");
const { POINTS_PER_GENERATION, POINTS_PER_FIELD_ASSIST } = require("../lib/worldConfigRepo");
const { resolveReferencesForEntry } = require("../lib/entryLinker");
const { afterEntrySave } = require("../lib/afterEntrySave");
const { requireSubscriptionToRegenerate } = require("../lib/regenerateGate");
// Spells attach only to this world's own classes -- see the header of
// lib/rulesets/5e/spellClasses.js for why and for the no-classes-yet rule.
const { getWorldClassNames, formatWorldClassesForPrompt, filterToWorldClasses, resolveSpellClasses } = require("../lib/rulesets/5e/spellClasses");

const router = express.Router();

// Entry cross-linking (Phase 2) -- see lib/entryLinker.js.
// Bug batch 1, Phase 4: this used to be a local copy of the linking
// steps with no Timeline step, so a directly-saved entry's founding/birth/
// created dates never reached the Timeline. Now the one shared hook
// (lib/afterEntrySave.js) every non-confirm save path calls.
const afterSave = afterEntrySave;

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
  let { name, level, school, fillExistingId, srdLibraryId } = req.body || {};
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
    // Filling a LOCKED placeholder (a ghost created by entry
    // cross-linking, or a spell's class stub) must build the entry the
    // placeholder names -- the Fill In button only posts { fillExistingId },
    // so without this the model invented an unrelated entry saved under the
    // placeholder's id (e.g. a "Wizard" ghost filled as "Neon Hacker").
    // Same behavior every Echoes handler already had.
    if (!name && manifestEntry.locked) name = manifestEntry.name;
    // Every other generate route gates regenerate behind a subscription
    // (lib/regenerateGate.js); spells were the one route that forgot to.
    if (isRegenerate) {
      const gate = await requireSubscriptionToRegenerate(req);
      if (!gate.allowed) {
        if (req.refundGeneration) await req.refundGeneration();
        return res.status(403).json(gate.body);
      }
    }
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
    // No AI here to map the SRD's Wizard/Cleric/... onto this world's
    // classes, so keep only exact matches (no class stub either).
    mechanics.classes = filterToWorldClasses(mechanics.classes, await getWorldClassNames(worldId));
    let spell = {
      id: fillExistingId || slugify(srdRow.name),
      name: srdRow.name,
      flavor: null,
      designNotes: null,
      sourceMode: "import",
      srdSourceId: srdRow.srd_id,
      srdLicenseNote: srdRow.license_note,
      ...mechanics
    };

    const importLinkResult = await resolveReferencesForEntry(worldId, "spells", spell);
    spell = importLinkResult.raw;

    if (isRegenerate) {
      const newBodyHtmlPreview = buildSpellBodyHtml(spell);
      return res.json({ preview: true, mode: "regenerate", category: "spells", id: spell.id, name: spell.name, entry: spell, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
    }

    await save5eSpellEntry(worldId, spell);
    await recordImport(worldId, resolvedSrdLibraryId, spell.id);
    await afterSave(worldId, "spells", spell, importLinkResult.unresolvedGhosts);
    return res.json({ preview: false, id: spell.id, name: spell.name, level: spell.level, summary: `Imported from 5e SRD (${srdRow.source_edition}).` });
  }

  // ---- Reflavor / Homebrew both call Claude ----
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "spells" });
  const worldClassesText = formatWorldClassesForPrompt(await getWorldClassNames(worldId));

  let spell;

  if (effectiveMode === "reflavor") {
    // srdLibraryId is recovered above (resolvedSrdLibraryId) from either
    // the request body (first-time reflavor) or the existing entry's
    // saved srdSourceId (a regenerate).
    // Nothing was generated -- give back the points enforceGenerationCap
    // already spent (idempotent, so the catch block can't double-refund).
    if (!resolvedSrdLibraryId) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(400).json({ error: "Reflavor mode requires srdLibraryId." });
    }
    const srdRow = await getSrdEntry(resolvedSrdLibraryId);
    if (!srdRow) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No SRD library entry found with id '${resolvedSrdLibraryId}'.` });
    }

    const systemPrompt = buildReflavorSpellSystemPrompt({ settingContext, loreContext, factionOptionsText, worldClassesText, sourceSpell: srdRow.data_json });
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
      description: reflavored.description || mechanics.description,
      classes: await resolveSpellClasses(worldId, { proposedClasses: reflavored.classes, newClass: reflavored.newClass })
    };

    // Same Differential Billing treatment as Enemies' Reflavor tier.
    if (req.refundGeneration) await req.refundGeneration(POINTS_PER_GENERATION - POINTS_PER_FIELD_ASSIST);
  } else {
    if (level != null && !isValidSpellLevel(level)) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(400).json({ error: "Spell level must be an integer 0-9." });
    }

    // lib/roster.js applies the same MAX_FULL_ROSTER_LINES cap every other
    // category's roster context gets -- this used to be a raw, uncapped
    // listEntries() map/join here, which meant a world's homebrew Spell
    // generation cost grew unboundedly with its spell count instead of
    // being bounded like every sibling category (see roster.js's header
    // comment on why that cap exists).
    const rosterContext = await buildSpellRosterContext(worldId);

    const systemPrompt = buildHomebrewSpellSystemPrompt({ settingContext, loreContext, factionOptionsText, worldClassesText, rosterContext, name, level, school });
    const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the spell now.", maxTokens: 1500 });

    if (!isValidSpellLevel(proposed.level)) {
      // The model is instructed to only return 0-9, but a stray value
      // shouldn't corrupt a saved entry -- clamp rather than reject the
      // whole generation over a single out-of-range field.
      proposed.level = Math.max(0, Math.min(9, Math.round(Number(proposed.level) || 0)));
    }

    const classes = await resolveSpellClasses(worldId, { proposedClasses: proposed.classes, newClass: proposed.newClass });
    delete proposed.newClass; // consumed above; not part of a saved spell
    spell = {
      ...proposed,
      classes,
      id: fillExistingId || slugify(proposed.name),
      sourceMode: "homebrew"
    };
  }

  if (existingEntry) spell.id = existingEntry.manifestEntry.id;
  // A homebrew Fill keeps the placeholder's name even if the model drifted
  // from it -- other entries already link to this entry by that name.
  if (existingEntry && existingEntry.manifestEntry.locked && effectiveMode === "homebrew") spell.name = existingEntry.manifestEntry.name;

  const linkResult = await resolveReferencesForEntry(worldId, "spells", spell);
  spell = linkResult.raw;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildSpellBodyHtml(spell);
    return res.json({ preview: true, mode: "regenerate", category: "spells", id: spell.id, name: spell.name, entry: spell, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await save5eSpellEntry(worldId, spell);
  await afterSave(worldId, "spells", spell, linkResult.unresolvedGhosts);
  res.json({ preview: false, id: spell.id, name: spell.name, level: spell.level, summary: spell.designNotes });
}

module.exports = router;
