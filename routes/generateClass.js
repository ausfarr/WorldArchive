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
const { buildHomebrewClassSystemPrompt } = require("../prompts/rulesets/5e/classContentPrompt");

// Generic Classes (Homebrew only, narrative-first -- no leveling concept
// exists for a Generic world) -- see
// prompts/rulesets/generic/classContentPrompt.js and
// lib/rulesets/generic/classTemplate.js's header comments.
const { saveGenericClassEntry } = require("../lib/rulesets/generic/classRepo");
const { slugify: slugifyGeneric, buildClassBodyHtml: buildClassBodyHtmlGeneric } = require("../lib/rulesets/generic/classTemplate");
const { buildHomebrewClassSystemPrompt: buildHomebrewGenericClassSystemPrompt } = require("../prompts/rulesets/generic/classContentPrompt");
const { getGenericSystem } = require("../lib/worldConfigRepo");

const router = express.Router();

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
  const cls = await callClaudeExpectingJson({
    systemPrompt: contentSystemPrompt,
    userMessage: "Generate the class now.",
    maxTokens: 8000
  });
  cls.id = fillExistingId || cls.id || slugify(cls.baseName);
  if (existingBaseName) cls.baseName = existingBaseName;

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

  res.json({
    preview: false,
    id: cls.id,
    name: `${cls.baseName} → ${cls.evolvedName}`,
    archetype: cls.archetype,
    summary: cls.designNotes
  });
}

// ============================================================
// 5e path -- Homebrew tier only (no canonical class data to import --
// see prompts/rulesets/5e/classContentPrompt.js's header). Code
// determines the subclass-unlock level from the class's OWN name
// against the real 5e table where it matches a core class, falling back
// to the shared default (level 3, the most common) for anything else --
// never trusts the model's proposed subclass features' levels as
// authoritative for the unlock point itself.
// ============================================================
async function handle5eClassGenerate(req, res) {
  const worldId = req.worldId;
  const { name, faction, fillExistingId } = req.body || {};

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

  const cls = {
    ...proposed,
    id: fillExistingId || slugify5e(proposed.name),
    faction: faction || null,
    subclassUnlockLevel: unlockLevel,
    savingThrowProficiencies,
    sourceMode: "homebrew"
  };
  if (existingEntry) cls.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildClassBodyHtml5e(cls, null);
    return res.json({ preview: true, mode: "regenerate", category: "classes", id: cls.id, name: cls.name, entry: cls, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await save5eClassEntry(worldId, cls, null);
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
  const cls = {
    ...proposed,
    id: fillExistingId || slugifyGeneric(proposed.name),
    faction: faction || null,
    keyAttribute: validAttributeKeys.has(proposed.keyAttribute) ? proposed.keyAttribute : null,
    sourceMode: "homebrew"
  };
  if (existingEntry) cls.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildClassBodyHtmlGeneric(cls, genericSystem, null);
    return res.json({ preview: true, mode: "regenerate", category: "classes", id: cls.id, name: cls.name, entry: cls, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await saveGenericClassEntry(worldId, cls, genericSystem, null);
  res.json({ preview: false, id: cls.id, name: cls.name, faction: cls.faction, summary: cls.designNotes });
}

module.exports = router;
