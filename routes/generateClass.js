const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { callClaudeExpectingJson } = require("../lib/claude");
const { buildClassRosterContext, readClassManifest, readClassEntry, buildLocationRosterContext } = require("../lib/roster");
const { buildClassContentSystemPrompt } = require("../prompts/classContentPrompt");
const { saveClassEntry } = require("../lib/fileWriter");
const { slugify, buildClassBodyHtml } = require("../lib/classTemplate");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getStatLabels, formatStatLabelsForPrompt, getSkillSystem, formatFieldSkillsForPrompt, formatWeaponSkillsForPrompt, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");
const { requireCategoryAvailable } = require("../middleware/requireCategoryAvailable");
const { getRuleset } = require("../lib/worldConfigRepo");
const { listEntries, getEntry } = require("../lib/entriesRepo");

// Multi-ruleset genericization, Phase 5 (Classes -- "biggest single
// rework") -- see session_addendum_ruleset_genericization.md.
const { save5eClassEntry } = require("../lib/rulesets/5e/classRepo");
const { slugify: slugify5e, buildClassBodyHtml: buildClassBodyHtml5e } = require("../lib/rulesets/5e/classTemplate");
const { subclassUnlockLevel, matchCoreClassName, savingThrowProficienciesForClass } = require("../lib/rulesets/5e/classFormulas");
const { buildHomebrewClassSystemPrompt, buildReflavorClassSystemPrompt } = require("../prompts/rulesets/5e/classContentPrompt");
const { mapSrdClassMechanics } = require("../lib/rulesets/5e/srdClassMapper");
const { getSrdEntry, getSrdEntryBySlug, recordImport, isAlreadyImported } = require("../lib/srdLibraryRepo");
const { POINTS_PER_GENERATION, POINTS_PER_FIELD_ASSIST } = require("../lib/worldConfigRepo");

// Generic Classes (Homebrew only, narrative-first -- no leveling concept
// exists for a Generic world) -- see
// prompts/rulesets/generic/classContentPrompt.js and
// lib/rulesets/generic/classTemplate.js's header comments.
const { saveGenericClassEntry } = require("../lib/rulesets/generic/classRepo");
const { slugify: slugifyGeneric, buildClassBodyHtml: buildClassBodyHtmlGeneric } = require("../lib/rulesets/generic/classTemplate");
const { buildHomebrewClassSystemPrompt: buildHomebrewGenericClassSystemPrompt } = require("../prompts/rulesets/generic/classContentPrompt");
const { getGenericSystem } = require("../lib/worldConfigRepo");
const { resolveReferencesForEntry, backfillReferencesFromNewEntry, ensureGhostPlaceholder } = require("../lib/entryLinker");

const router = express.Router();

// Entry cross-linking (Phase 2) -- see lib/entryLinker.js.
async function afterSave(worldId, category, savedContent, unresolvedGhosts) {
  await backfillReferencesFromNewEntry(worldId, category, savedContent);
  for (const ghost of unresolvedGhosts || []) {
    await ensureGhostPlaceholder(worldId, ghost.category, ghost.name);
  }
}

router.post("/generate-class", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, requireCategoryAvailable("classes"), async (req, res) => {
  try {
    const ruleset = await getRuleset(req.worldId);
    if (ruleset === "5e") {
      return await handle5eClassGenerate(req, res);
    }
    if (ruleset === "generic") {
      return await handleGenericClassGenerate(req, res);
    }
    return await handleEchoesClassGenerate(req, res);
  } catch (err) {
    console.error("Class generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Echoes path -- UNCHANGED from before this project (moved into its own
// function so the ruleset branch above can dispatch to it).
// ============================================================
async function handleEchoesClassGenerate(req, res) {
  const worldId = req.worldId;
  let { name, fillExistingId } = req.body || {};
  let existingEntry = null;
  let existingBaseName = null;
  let priorRaw = null;
  let priorBodyHtml = null;
  let mode = "new";

  if (fillExistingId) {
    const manifest = await readClassManifest(worldId);
    existingEntry = manifest.find((m) => m.id === fillExistingId);
    if (!existingEntry) {
      return res.status(404).json({ error: `No existing class entry found with id '${fillExistingId}'` });
    }
    mode = existingEntry.locked ? "fill" : "regenerate";
    if (mode === "regenerate") {
      const prior = await readClassEntry(worldId, fillExistingId);
      priorRaw = prior && prior.raw ? prior.raw : null;
      priorBodyHtml = prior ? prior.bodyHtml : null;
    }
    // Manifest name is stored as "The Courier → The Slipstream" - the
    // base name (pre-evolution) is what we tell the model to build around.
    existingBaseName = existingEntry.name.split("→")[0].trim();
    name = existingBaseName;
  }

  const rosterContext = await buildClassRosterContext(worldId);
  const locationRosterText = await buildLocationRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "classes" });
  const settingContext = await getSettingContext(worldId);
  const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));
  const skillSystem = await getSkillSystem(worldId);
  const fieldSkillsText = formatFieldSkillsForPrompt(skillSystem);
  const weaponSkillsText = formatWeaponSkillsForPrompt(skillSystem);

  const contentSystemPrompt = buildClassContentSystemPrompt({ settingContext, loreContext, statLabelsText, fieldSkillsText, weaponSkillsText, rosterContext, locationRosterText, name, existingContent: priorRaw });
  // Generous budget - a full 1-99 tree with ~21 abilities across 4 tiers
  // is genuinely long content, not a truncation risk we're guessing at.
  let cls = await callClaudeExpectingJson({
    systemPrompt: contentSystemPrompt,
    userMessage: "Generate the class now.",
    maxTokens: 8000
  });
  cls.id = fillExistingId || cls.id || slugify(cls.baseName);
  if (existingBaseName) cls.baseName = existingBaseName;

  const echoesLinkResult = await resolveReferencesForEntry(worldId, "classes", cls);
  cls = echoesLinkResult.raw;

  if (mode === "regenerate") {
    const newBodyHtmlPreview = buildClassBodyHtml(cls);
    return res.json({
      preview: true,
      mode: "regenerate",
      category: "classes",
      id: cls.id,
      name: `${cls.baseName} → ${cls.evolvedName}`,
      entry: cls,
      newBodyHtmlPreview,
      oldBodyHtmlPreview: priorBodyHtml
    });
  }

  // Portrait generation is no longer bundled into entry creation --
  // saved immediately with imageUrl: null, and the dossier page offers
  // Generate/Upload actions via archive/js/portraitActions.js +
  // routes/generateEntryImage.js instead. (This decoupling was
  // originally done in a separate chat session in this project; being
  // restored here after it was accidentally reverted by an unrelated
  // later delivery that touched this same file.)
  await saveClassEntry(worldId, cls, null);
  await afterSave(worldId, "classes", cls, echoesLinkResult.unresolvedGhosts);

  res.json({
    preview: false,
    id: cls.id,
    name: `${cls.baseName} → ${cls.evolvedName}`,
    archetype: cls.archetype,
    summary: cls.designNotes
  });
}

// ============================================================
// 5e path -- three tiers as of R5 Phase 5, dispatched by req.body.mode:
// 'import' (no AI, direct copy from srd_library), 'reflavor' (AI
// rewrites narrative only, mechanics untouched), 'homebrew' (AI invents
// fresh class -- unchanged from before this phase). Same three-tier
// shape as routes/generateEnemy.js's handle5eEnemyGenerate. Code
// determines the subclass-unlock level and saving throw proficiencies
// from the real 5e table where a class name matches a core class (see
// classFormulas.js's savingThrowProficienciesForClass()) -- for Import/
// Reflavor this always matches, since the source class name IS one of
// the 12 core classes exactly (see lib/rulesets/5e/srdClassMapper.js).
// ============================================================
async function handle5eClassGenerate(req, res) {
  const worldId = req.worldId;
  const { name, faction, fillExistingId, srdLibraryId } = req.body || {};
  const mode = req.body && req.body.mode;

  let existingEntry = null;
  let isRegenerate = false;
  if (fillExistingId) {
    const manifest = await listEntries(worldId, "classes");
    const manifestEntry = manifest.find((m) => m.id === fillExistingId);
    if (!manifestEntry) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No existing class entry found with id '${fillExistingId}'` });
    }
    const full = await getEntry(worldId, "classes", fillExistingId);
    existingEntry = { manifestEntry, raw: full && full.raw ? full.raw : null, bodyHtml: full ? full.bodyHtml : null };
    isRegenerate = !manifestEntry.locked;
  }

  const effectiveMode = mode || (existingEntry && existingEntry.raw && existingEntry.raw.sourceMode) || "homebrew";
  if (!["import", "reflavor", "homebrew"].includes(effectiveMode)) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "5e class generation requires a 'mode' of 'import', 'reflavor', or 'homebrew'." });
  }

  // The generic card "Regenerate" button only ever posts { fillExistingId
  // } -- recover srdLibraryId from the existing entry's saved srdSourceId
  // when it's missing, same fallback as routes/generateEnemy.js.
  let resolvedSrdLibraryId = srdLibraryId;
  if (!resolvedSrdLibraryId && (effectiveMode === "import" || effectiveMode === "reflavor") && existingEntry && existingEntry.raw && existingEntry.raw.srdSourceId) {
    const recovered = await getSrdEntryBySlug("5e", "classes", existingEntry.raw.srdSourceId);
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
      return res.status(409).json({ error: `This SRD class was already imported into this world as '${alreadyImportedAs}'.` });
    }

    const mechanics = mapSrdClassMechanics(srdRow.data_json);
    let cls = {
      id: fillExistingId || slugify5e(srdRow.name),
      name: srdRow.name,
      faction: faction || (existingEntry && existingEntry.raw && existingEntry.raw.faction) || null,
      flavor: null,
      designNotes: null,
      sourceMode: "import",
      srdSourceId: srdRow.srd_id,
      srdLicenseNote: srdRow.license_note,
      ...mechanics
    };

    const importLinkResult = await resolveReferencesForEntry(worldId, "classes", cls);
    cls = importLinkResult.raw;

    if (isRegenerate) {
      const newBodyHtmlPreview = buildClassBodyHtml5e(cls, null);
      return res.json({ preview: true, mode: "regenerate", category: "classes", id: cls.id, name: cls.name, entry: cls, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
    }

    await save5eClassEntry(worldId, cls, null);
    await recordImport(worldId, resolvedSrdLibraryId, cls.id);
    await afterSave(worldId, "classes", cls, importLinkResult.unresolvedGhosts);
    return res.json({ preview: false, id: cls.id, name: cls.name, summary: `Imported from 5e SRD (${srdRow.source_edition}).` });
  }

  // ---- Reflavor / Homebrew both call Claude ----
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "classes" });

  let cls;

  if (effectiveMode === "reflavor") {
    // srdLibraryId is recovered above (resolvedSrdLibraryId) from either
    // the request body (first-time reflavor) or the existing entry's
    // saved srdSourceId (a regenerate).
    if (!resolvedSrdLibraryId) return res.status(400).json({ error: "Reflavor mode requires srdLibraryId." });
    const srdRow = await getSrdEntry(resolvedSrdLibraryId);
    if (!srdRow) return res.status(404).json({ error: `No SRD library entry found with id '${resolvedSrdLibraryId}'.` });

    const mechanics = mapSrdClassMechanics(srdRow.data_json);
    const systemPrompt = buildReflavorClassSystemPrompt({ settingContext, loreContext, factionOptionsText, sourceClass: srdRow.data_json });
    const reflavored = await callClaudeExpectingJson({ systemPrompt, userMessage: "Reflavor the class now.", maxTokens: 3000 });

    // Model's rewritten features override the mapper's raw-source
    // features only if it returned the same count -- same defensive
    // "length must match" guard Enemies' Reflavor uses for traits/actions,
    // since a mismatched count would silently break the level table.
    const features = Array.isArray(reflavored.features) && reflavored.features.length === mechanics.features.length
      ? reflavored.features
      : mechanics.features;
    const subclasses = mechanics.subclasses.length
      ? [{ ...mechanics.subclasses[0], flavor: reflavored.subclassFlavor || mechanics.subclasses[0].flavor }]
      : mechanics.subclasses;

    cls = {
      id: fillExistingId || slugify5e(srdRow.name),
      name: srdRow.name,
      faction: faction || null,
      flavor: reflavored.flavor,
      designNotes: reflavored.designNotes,
      sourceMode: "reflavor",
      srdSourceId: srdRow.srd_id,
      srdLicenseNote: srdRow.license_note,
      ...mechanics,
      features,
      subclasses
    };

    // Same Differential Billing treatment as Enemies' Reflavor tier.
    if (req.refundGeneration) await req.refundGeneration(POINTS_PER_GENERATION - POINTS_PER_FIELD_ASSIST);
  } else {
    const rosterEntries = await listEntries(worldId, "classes", { locked: false });
    const rosterContext = rosterEntries.length
      ? rosterEntries.map((e) => `- ${e.id} | ${e.name}`).join("\n")
      : "No classes archived yet -- any concept is available.";

    const systemPrompt = buildHomebrewClassSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name });
    const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the class now.", maxTokens: 3500 });

    // Subclass-unlock level AND saving throw proficiencies are REAL 5e
    // rules, not model choices -- both resolved by matching this class's
    // name against the 12 core classes' known values (a homebrew class
    // inspired by "Wizard" or "Warlock" in its name gets that class's real
    // level/saves); anything else falls back to level 3 (the shared
    // default among 7 of the 12 core classes) for the unlock level, and
    // keeps the model's own proposed save pair for a genuinely original
    // homebrew concept with no rules-book answer to look up (see
    // classFormulas.js's savingThrowProficienciesForClass()).
    const matchedCoreClass = matchCoreClassName(proposed.name);
    const unlockLevel = subclassUnlockLevel(matchedCoreClass || "");
    const savingThrowProficiencies = savingThrowProficienciesForClass(matchedCoreClass, proposed.savingThrowProficiencies);

    cls = {
      ...proposed,
      id: fillExistingId || slugify5e(proposed.name),
      faction: faction || null,
      subclassUnlockLevel: unlockLevel,
      savingThrowProficiencies,
      sourceMode: "homebrew"
    };
  }

  if (existingEntry) cls.id = existingEntry.manifestEntry.id;

  const linkResult = await resolveReferencesForEntry(worldId, "classes", cls);
  cls = linkResult.raw;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildClassBodyHtml5e(cls, null);
    return res.json({ preview: true, mode: "regenerate", category: "classes", id: cls.id, name: cls.name, entry: cls, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await save5eClassEntry(worldId, cls, null);
  await afterSave(worldId, "classes", cls, linkResult.unresolvedGhosts);
  res.json({ preview: false, id: cls.id, name: cls.name, faction: cls.faction, summary: cls.designNotes });
}

// ============================================================
// Generic path -- Homebrew only, narrative-first. keyAttribute is
// validated against this world's own attribute keys (cleared to null
// if the model hallucinates one that doesn't exist) rather than trusted
// outright.
// ============================================================
async function handleGenericClassGenerate(req, res) {
  const worldId = req.worldId;
  const { name, faction, fillExistingId } = req.body || {};

  const genericSystem = await getGenericSystem(worldId);
  if (!genericSystem || !Array.isArray(genericSystem.attributes) || !genericSystem.attributes.length) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "This world hasn't configured its homebrew attribute system yet -- finish that setup before generating a class." });
  }

  let existingEntry = null;
  let isRegenerate = false;
  if (fillExistingId) {
    const manifest = await listEntries(worldId, "classes");
    const manifestEntry = manifest.find((m) => m.id === fillExistingId);
    if (!manifestEntry) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No existing class entry found with id '${fillExistingId}'` });
    }
    const full = await getEntry(worldId, "classes", fillExistingId);
    existingEntry = { manifestEntry, raw: full && full.raw ? full.raw : null, bodyHtml: full ? full.bodyHtml : null };
    isRegenerate = !manifestEntry.locked;
  }

  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "classes" });
  const rosterEntries = await listEntries(worldId, "classes", { locked: false });
  const rosterContext = rosterEntries.length
    ? rosterEntries.map((e) => `- ${e.id} | ${e.name}`).join("\n")
    : "No classes archived yet -- any concept is available.";

  const systemPrompt = buildHomebrewGenericClassSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, genericSystem });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the class now.", maxTokens: 2000 });

  const validAttributeKeys = new Set(genericSystem.attributes.map((a) => a.key));
  let cls = {
    ...proposed,
    id: fillExistingId || slugifyGeneric(proposed.name),
    faction: faction || null,
    keyAttribute: validAttributeKeys.has(proposed.keyAttribute) ? proposed.keyAttribute : null,
    sourceMode: "homebrew"
  };
  if (existingEntry) cls.id = existingEntry.manifestEntry.id;

  const linkResult = await resolveReferencesForEntry(worldId, "classes", cls);
  cls = linkResult.raw;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildClassBodyHtmlGeneric(cls, genericSystem, null);
    return res.json({ preview: true, mode: "regenerate", category: "classes", id: cls.id, name: cls.name, entry: cls, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await saveGenericClassEntry(worldId, cls, genericSystem, null);
  await afterSave(worldId, "classes", cls, linkResult.unresolvedGhosts);
  res.json({ preview: false, id: cls.id, name: cls.name, faction: cls.faction, summary: cls.designNotes });
}

module.exports = router;
