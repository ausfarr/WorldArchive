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
const { subclassUnlockLevel } = require("../lib/rulesets/5e/classFormulas");
const { buildHomebrewClassSystemPrompt } = require("../prompts/rulesets/5e/classContentPrompt");

// PF2e Classes (Homebrew tier only) -- see
// prompts/rulesets/pf2e/classContentPrompt.js and
// lib/rulesets/pf2e/classFormulas.js's header comments.
const { savePf2eClassEntry } = require("../lib/rulesets/pf2e/classRepo");
const { slugify: slugifyPf2e, buildClassBodyHtml: buildClassBodyHtmlPf2e } = require("../lib/rulesets/pf2e/classTemplate");
const { validateProficiencySchedule } = require("../lib/rulesets/pf2e/classFormulas");
const { buildHomebrewClassSystemPrompt: buildHomebrewPf2eClassSystemPrompt } = require("../prompts/rulesets/pf2e/classContentPrompt");

const router = express.Router();

router.post("/generate-class", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, requireCategoryAvailable("classes"), async (req, res) => {
  try {
    const ruleset = await getRuleset(req.worldId);
    if (ruleset === "5e") {
      return await handle5eClassGenerate(req, res);
    }
    if (ruleset === "pf2e") {
      return await handlePf2eClassGenerate(req, res);
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

  // Subclass-unlock level is a REAL 5e rule, not a model choice --
  // resolved by matching this class's name against the 12 core classes'
  // known unlock levels (a homebrew class inspired by "Wizard" or
  // "Warlock" in its name gets that class's real level); anything else
  // falls back to level 3, the shared default among 7 of the 12 core
  // classes (see classFormulas.js's subclassUnlockLevel()).
  const nameLower = String(proposed.name || "").toLowerCase();
  const matchedCoreClass = ["cleric", "sorcerer", "warlock", "druid", "wizard", "barbarian", "bard", "fighter", "monk", "paladin", "ranger", "rogue"].find((c) => nameLower.includes(c));
  const unlockLevel = subclassUnlockLevel(matchedCoreClass || "");

  const cls = {
    ...proposed,
    id: fillExistingId || slugify5e(proposed.name),
    faction: faction || null,
    subclassUnlockLevel: unlockLevel,
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
// PF2e path -- Homebrew tier only. The model proposes its OWN
// classDcSchedule and picks 2 of 3 "good" saves (see
// prompts/rulesets/pf2e/classContentPrompt.js's header for why that's a
// legitimate model choice here, unlike 5e's subclass-unlock level which
// IS a fixed rule). Code validates the schedule is legal and normalizes
// goodSaves rather than trusting the model's raw output outright --
// classTemplate.js's level table calls validateProficiencySchedule
// internally too and would throw on a malformed schedule, so a bad
// response here would otherwise 500 instead of falling back cleanly.
// ============================================================
const PF2E_SAVE_KEYS = ["fortitude", "reflex", "will"];
const FALLBACK_CLASS_DC_SCHEDULE = [{ level: 1, rank: "trained" }, { level: 7, rank: "expert" }, { level: 15, rank: "master" }];

async function handlePf2eClassGenerate(req, res) {
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

  const systemPrompt = buildHomebrewPf2eClassSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the class now.", maxTokens: 3500 });

  // goodSaves: keep only real save keys, dedupe, take exactly 2 --
  // backfill from the fixed key order if the model gave fewer than 2.
  let goodSaves = Array.from(new Set((proposed.goodSaves || []).filter((s) => PF2E_SAVE_KEYS.includes(s)))).slice(0, 2);
  if (goodSaves.length < 2) {
    for (const s of PF2E_SAVE_KEYS) {
      if (goodSaves.length >= 2) break;
      if (!goodSaves.includes(s)) goodSaves.push(s);
    }
  }

  const scheduleCheck = validateProficiencySchedule(proposed.classDcSchedule);
  const classDcSchedule = scheduleCheck.valid ? scheduleCheck.schedule : FALLBACK_CLASS_DC_SCHEDULE;

  const cls = {
    ...proposed,
    id: fillExistingId || slugifyPf2e(proposed.name),
    faction: faction || null,
    goodSaves,
    classDcSchedule,
    sourceMode: "homebrew"
  };
  if (existingEntry) cls.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildClassBodyHtmlPf2e(cls, null);
    return res.json({ preview: true, mode: "regenerate", category: "classes", id: cls.id, name: cls.name, entry: cls, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await savePf2eClassEntry(worldId, cls, null);
  res.json({ preview: false, id: cls.id, name: cls.name, faction: cls.faction, summary: cls.designNotes });
}

module.exports = router;
