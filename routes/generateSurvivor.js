// routes/generateSurvivor.js
//
// Multi-ruleset genericization, Phase 8: the category slug stays
// "survivors" (renaming it across every route/table/frontend reference
// would be a large, purely-cosmetic, risk-heavy sweep for a proof-of-
// concept phase -- deferred, see SESSION_LOG.md) but the 5e content is
// conceptually a Player Character, not a Colony recruit: "a Class
// instance with a name/background" per the project's scope doc, built
// on a REAL class entry from this world's own archive (Phase 5), not a
// separate mechanical model.
const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { callClaudeExpectingJson } = require("../lib/claude");
const { buildSurvivorRosterContext, buildAvailableClassesText, readSurvivorManifest, readSurvivorEntry } = require("../lib/roster");
const { buildSurvivorContentSystemPrompt } = require("../prompts/survivorContentPrompt");
const { saveSurvivorEntry } = require("../lib/fileWriter");
const { slugify, buildSurvivorBodyHtml } = require("../lib/survivorTemplate");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getStatLabels, formatStatLabelsForPrompt, getSkillSystem, formatFieldSkillsForPrompt, getFactionOptions, formatFactionOptionsForPrompt } = require("../lib/worldFlavor");
const { requireCategoryAvailable } = require("../middleware/requireCategoryAvailable");
const { getRuleset } = require("../lib/worldConfigRepo");
const { listEntries, getEntry } = require("../lib/entriesRepo");

// Multi-ruleset genericization, Phase 8.
const { save5eSurvivorEntry } = require("../lib/rulesets/5e/survivorRepo");
const { slugify: slugify5e, buildSurvivorBodyHtml: buildSurvivorBodyHtml5e } = require("../lib/rulesets/5e/survivorTemplate");
const { computeHitPoints, proficiencyBonusForLevel, spellSlotsForLevel } = require("../lib/rulesets/5e/survivorFormulas");
const { buildHomebrewSurvivorSystemPrompt } = require("../prompts/rulesets/5e/survivorContentPrompt");

const router = express.Router();

router.post("/generate-survivor", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, requireCategoryAvailable("survivors"), async (req, res) => {
  try {
    const ruleset = await getRuleset(req.worldId);
    if (ruleset === "5e") {
      return await handle5eSurvivorGenerate(req, res);
    }
    return await handleEchoesSurvivorGenerate(req, res);
  } catch (err) {
    console.error("PC generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Echoes path -- UNCHANGED from before this project.
// ============================================================
async function handleEchoesSurvivorGenerate(req, res) {
  const worldId = req.worldId;
  let { name, className, faction, fillExistingId, importText } = req.body || {};
  let existingEntry = null;
  let priorRaw = null;
  let priorBodyHtml = null;
  let mode = "new";

  if (fillExistingId) {
    const manifest = await readSurvivorManifest(worldId);
    existingEntry = manifest.find((m) => m.id === fillExistingId);
    if (!existingEntry) {
      return res.status(404).json({ error: `No existing PC entry found with id '${fillExistingId}'` });
    }
    // PCs have no locked placeholders by design (roster only grows via
    // fresh generation, per scope doc) — so any existing id here is
    // always a regenerate, never a "fill."
    mode = "regenerate";
    const prior = await readSurvivorEntry(worldId, fillExistingId);
    priorRaw = prior && prior.raw ? prior.raw : null;
    priorBodyHtml = prior ? prior.bodyHtml : null;
    name = existingEntry.name;
    className = priorRaw ? priorRaw.className : className;
    faction = priorRaw ? priorRaw.faction : faction;
  }

  const rosterContext = await buildSurvivorRosterContext(worldId);
  const availableClasses = await buildAvailableClassesText(worldId);
  const loreContext = await getLoreContext(worldId, { category: "survivors", faction });
  const settingContext = await getSettingContext(worldId);
  const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));
  const fieldSkillsText = formatFieldSkillsForPrompt(await getSkillSystem(worldId));
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

  const contentSystemPrompt = buildSurvivorContentSystemPrompt({
    settingContext, loreContext, statLabelsText, fieldSkillsText, factionOptionsText,
    rosterContext, availableClasses, name, className, faction,
    existingContent: priorRaw,
    importSourceText: (!fillExistingId && importText && importText.trim()) ? importText.trim() : undefined
  });
  const survivor = await callClaudeExpectingJson({
    systemPrompt: contentSystemPrompt,
    userMessage: importText ? "Import and structure this character now." : "Generate the PC now.",
    maxTokens: 2000
  });
  if (!survivor.id) survivor.id = slugify(survivor.name);
  if (fillExistingId) survivor.id = fillExistingId;
  if (existingEntry) survivor.name = existingEntry.name;
  if (faction) survivor.faction = faction;

  if (mode === "regenerate") {
    const statLabels = await getStatLabels(worldId);
    const newBodyHtmlPreview = buildSurvivorBodyHtml(survivor, null, null, statLabels);
    return res.json({
      preview: true,
      mode: "regenerate",
      category: "survivors",
      id: survivor.id,
      name: survivor.name,
      entry: survivor,
      newBodyHtmlPreview,
      oldBodyHtmlPreview: priorBodyHtml
    });
  }

  await saveSurvivorEntry(worldId, survivor, null);

  res.json({
    preview: false,
    id: survivor.id,
    name: survivor.name,
    className: survivor.className,
    faction: survivor.faction,
    summary: survivor.designNotes
  });
}

// ============================================================
// 5e path -- Homebrew tier only. classId must reference a real Class
// entry this world already generated (Phase 5); HP/proficiency bonus/
// spell slots are computed from THAT class's real hitDie/casterType,
// never model-stated.
// ============================================================
async function handle5eSurvivorGenerate(req, res) {
  const worldId = req.worldId;
  const { name, faction, fillExistingId, classLevel } = req.body || {};

  let existingEntry = null;
  let isRegenerate = false;
  if (fillExistingId) {
    const manifest = await listEntries(worldId, "survivors");
    const manifestEntry = manifest.find((m) => m.id === fillExistingId);
    if (!manifestEntry) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No existing PC entry found with id '${fillExistingId}'` });
    }
    const full = await getEntry(worldId, "survivors", fillExistingId);
    existingEntry = { manifestEntry, raw: full && full.raw ? full.raw : null, bodyHtml: full ? full.bodyHtml : null };
    isRegenerate = true; // PCs have no locked placeholders, same as Echoes -- any existing id is always a regenerate
  }

  const classEntries = await listEntries(worldId, "classes", { locked: false });
  if (!classEntries.length) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "This world has no Classes yet -- generate at least one Class before creating a Player Character." });
  }
  const availableClassesText = classEntries.map((c) => `- id: ${c.id} | ${c.name}`).join("\n");

  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "survivors", faction });
  const rosterEntries = await listEntries(worldId, "survivors", { locked: false });
  const rosterContext = rosterEntries.length
    ? rosterEntries.map((e) => `- ${e.id} | ${e.name}: ${e.subtitle || ""}`).join("\n")
    : "No Player Characters archived yet -- any concept is available.";

  const systemPrompt = buildHomebrewSurvivorSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, availableClassesText, name, faction, classLevel });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Create the Player Character now.", maxTokens: 1800 });

  const chosenClass = classEntries.find((c) => c.id === proposed.classId) || classEntries[0];
  const chosenClassFull = await getEntry(worldId, "classes", chosenClass.id);
  const classContent = chosenClassFull && chosenClassFull.raw ? chosenClassFull.raw : {};

  const level = Math.max(1, Math.min(20, Math.round(Number(proposed.classLevel) || 1)));
  const hitPoints = computeHitPoints(classContent.hitDie || "d8", level, (proposed.abilities && proposed.abilities.con) || 10);
  const proficiencyBonus = proficiencyBonusForLevel(level);
  const spellSlots = classContent.casterType && classContent.casterType !== "none" ? spellSlotsForLevel(classContent.casterType, level) : null;

  const pc = {
    ...proposed,
    id: fillExistingId || slugify5e(proposed.name),
    faction: faction || null,
    classId: chosenClass.id,
    className: chosenClass.name,
    classLevel: level,
    hitPoints,
    proficiencyBonus,
    spellSlots,
    sourceMode: "homebrew"
  };
  if (existingEntry) pc.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildSurvivorBodyHtml5e(pc, null);
    return res.json({ preview: true, mode: "regenerate", category: "survivors", id: pc.id, name: pc.name, entry: pc, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await save5eSurvivorEntry(worldId, pc, null);
  res.json({ preview: false, id: pc.id, name: pc.name, className: pc.className, faction: pc.faction, summary: pc.designNotes });
}

module.exports = router;
