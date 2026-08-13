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
const { computeMulticlassHitPoints, proficiencyBonusForLevel, passivePerception, initiativeBonus, applyAbilityScoreIncrease } = require("../lib/rulesets/5e/survivorFormulas");
const { matchCoreClassName, savingThrowProficienciesForClass, SKILLS, ABILITY_SCORE_IMPROVEMENT_LEVELS, multiclassSpellSlots } = require("../lib/rulesets/5e/classFormulas");
const { buildHomebrewSurvivorSystemPrompt } = require("../prompts/rulesets/5e/survivorContentPrompt");
const { getRaceSystem } = require("../lib/worldConfigRepo");
const { STARTER_5E_RACES } = require("../lib/rulesets/5e/starterRaces");
const { CORE_BACKGROUNDS, CORE_FEATS } = require("../lib/rulesets/5e/backgroundsAndFeats");

const VALID_SKILL_KEYS = new Set(SKILLS.map((s) => s.key));
const FIRST_ASI_LEVEL = Math.min(...ABILITY_SCORE_IMPROVEMENT_LEVELS);

// R4 Phase 3: resolves an optional raceKey against this world's own
// saved race list, falling back to the hand-authored starter list for a
// world that hasn't explicitly saved one yet -- same fallback
// GET /api/wizard/race-system already returns to the frontend, so a
// raceKey submitted from that dropdown always resolves here too.
async function resolveRace(worldId, raceKey) {
  if (!raceKey) return null;
  const saved = await getRaceSystem(worldId);
  const pool = saved && saved.length ? saved : STARTER_5E_RACES;
  return pool.find((r) => r.key === raceKey) || null;
}

// Generic Player Characters (Homebrew only) -- see
// prompts/rulesets/generic/survivorContentPrompt.js and
// lib/rulesets/generic/survivorTemplate.js's header comments.
const { saveGenericSurvivorEntry } = require("../lib/rulesets/generic/survivorRepo");
const { slugify: slugifyGeneric, buildSurvivorBodyHtml: buildSurvivorBodyHtmlGeneric } = require("../lib/rulesets/generic/survivorTemplate");
const { computeDerivedStats } = require("../lib/rulesets/generic/statFormulas");
const { buildHomebrewSurvivorSystemPrompt: buildHomebrewGenericSurvivorSystemPrompt } = require("../prompts/rulesets/generic/survivorContentPrompt");
const { getGenericSystem } = require("../lib/worldConfigRepo");

const router = express.Router();

router.post("/generate-survivor", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, requireCategoryAvailable("survivors"), async (req, res) => {
  try {
    const ruleset = await getRuleset(req.worldId);
    if (ruleset === "5e") {
      return await handle5eSurvivorGenerate(req, res);
    }
    if (ruleset === "generic") {
      return await handleGenericSurvivorGenerate(req, res);
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
  const { name, faction, fillExistingId, classLevel, raceKey } = req.body || {};

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

  // R4 Phase 6: resolve every proposed {classId, classLevel} entry against
  // this world's real Class roster -- invalid/duplicate classIds are
  // dropped rather than trusted, capped at 2 entries (this project's
  // "almost always one class" rule from the prompt), and falls back to a
  // single entry in the world's first available class if the model
  // returned nothing usable at all (matches the old single-class route's
  // own fallback-to-classEntries[0] behavior).
  const proposedClasses = Array.isArray(proposed.classes) ? proposed.classes : [];
  const seenClassIds = new Set();
  const resolvedClassRefs = [];
  for (const entry of proposedClasses) {
    if (resolvedClassRefs.length >= 2) break;
    const match = classEntries.find((c) => c.id === entry.classId);
    if (!match || seenClassIds.has(match.id)) continue;
    seenClassIds.add(match.id);
    resolvedClassRefs.push({ manifestEntry: match, level: Math.max(1, Math.min(20, Math.round(Number(entry.classLevel) || 1))) });
  }
  if (!resolvedClassRefs.length) {
    resolvedClassRefs.push({ manifestEntry: classEntries[0], level: 1 });
  }

  const resolvedClasses = await Promise.all(resolvedClassRefs.map(async (ref) => {
    const full = await getEntry(worldId, "classes", ref.manifestEntry.id);
    const content = full && full.raw ? full.raw : {};
    return {
      classId: ref.manifestEntry.id,
      className: ref.manifestEntry.name,
      classLevel: ref.level,
      hitDie: content.hitDie || "d8",
      casterType: content.casterType || "none",
      savingThrowProficiencies: content.savingThrowProficiencies
    };
  }));
  const totalLevel = resolvedClasses.reduce((sum, c) => sum + c.classLevel, 0);

  const race = await resolveRace(worldId, raceKey);
  // Race's ability score increase is applied to the model's proposed base
  // scores here, code-side, so it always shows up in the final numbers
  // (HP/passive Perception/initiative all derive from these) rather than
  // depending on the model to remember to add it in.
  const abilities = applyAbilityScoreIncrease(proposed.abilities || {}, race && race.abilityScoreIncrease);
  const hitPoints = computeMulticlassHitPoints(resolvedClasses.map((c) => ({ hitDie: c.hitDie, level: c.classLevel })), abilities.con || 10);
  const proficiencyBonus = proficiencyBonusForLevel(totalLevel);
  const { sharedSlots, pactMagic } = multiclassSpellSlots(resolvedClasses.map((c) => ({ casterType: c.casterType, level: c.classLevel })));

  // R4 Phase 2: skill proficiencies are genuinely the player's choice in
  // real 5e, so the model's proposal is trusted -- but only after
  // filtering to the real 18 skill keys, same defensive validation every
  // other ruleset-aware route already applies to model-proposed
  // enum-shaped fields. Saving throws, by contrast, are a fixed rule with
  // no creative room -- and, per the real multiclassing rule, come ONLY
  // from the character's FIRST class (resolvedClasses[0]); multiclassing
  // into a second class never adds its saves.
  const skillProficiencies = Array.isArray(proposed.skillProficiencies)
    ? [...new Set(proposed.skillProficiencies.filter((k) => VALID_SKILL_KEYS.has(k)))]
    : [];
  const startingClass = resolvedClasses[0];
  const matchedCoreClass = matchCoreClassName(startingClass.className);
  const savingThrowProficiencies = savingThrowProficienciesForClass(matchedCoreClass, startingClass.savingThrowProficiencies);
  const isPerceptionProficient = skillProficiencies.includes("perception");

  // R4 Phase 5: Background is validated against the real 13-entry core
  // list (hand-authored fallback -- see backgroundsAndFeats.js's header
  // for why) rather than trusted verbatim from the model; a Feat only
  // applies once the character has reached its first real ASI level
  // (checked against TOTAL level, not any single class's level).
  const background = CORE_BACKGROUNDS.find((b) => b.key === proposed.backgroundKey) || null;
  const eligibleForFeat = totalLevel >= FIRST_ASI_LEVEL;
  const feat = eligibleForFeat ? CORE_FEATS.find((f) => f.key === proposed.featKey) || null : null;

  const pc = {
    ...proposed,
    id: fillExistingId || slugify5e(proposed.name),
    faction: faction || null,
    classes: resolvedClasses.map((c) => ({ classId: c.classId, className: c.className, classLevel: c.classLevel })),
    totalLevel,
    abilities,
    raceKey: race ? race.key : null,
    raceName: race ? race.name : null,
    hitPoints,
    proficiencyBonus,
    spellSlots: sharedSlots,
    pactMagic,
    skillProficiencies,
    savingThrowProficiencies,
    passivePerception: passivePerception(abilities.wis || 10, proficiencyBonus, isPerceptionProficient),
    initiativeBonus: initiativeBonus(abilities.dex || 10, 0),
    backgroundKey: background ? background.key : null,
    backgroundDetail: background,
    featKey: feat ? feat.key : null,
    featDetail: feat,
    sourceMode: "homebrew"
  };
  if (existingEntry) pc.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildSurvivorBodyHtml5e(pc, null);
    return res.json({ preview: true, mode: "regenerate", category: "survivors", id: pc.id, name: pc.name, entry: pc, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await save5eSurvivorEntry(worldId, pc, null);
  res.json({ preview: false, id: pc.id, name: pc.name, className: pc.classes.map((c) => `${c.className} ${c.classLevel}`).join(" / "), faction: pc.faction, summary: pc.designNotes });
}

// ============================================================
// Generic path -- Homebrew only. classId must reference a real Generic
// Class entry this world already generated; attributes are validated
// against this world's own attribute keys and derived stats are
// code-computed (never model-stated) when this world uses a formula
// layer, same "model writes narrative, code writes math" split
// Bestiary's Generic Homebrew tier already established.
// ============================================================
async function handleGenericSurvivorGenerate(req, res) {
  const worldId = req.worldId;
  const { name, faction, fillExistingId } = req.body || {};

  const genericSystem = await getGenericSystem(worldId);
  if (!genericSystem || !Array.isArray(genericSystem.attributes) || !genericSystem.attributes.length) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "This world hasn't configured its homebrew attribute system yet -- finish that setup before creating a Player Character." });
  }

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
    isRegenerate = true; // PCs have no locked placeholders, same as every other ruleset
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

  const systemPrompt = buildHomebrewGenericSurvivorSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, availableClassesText, name, faction, genericSystem });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Create the Player Character now.", maxTokens: 1800 });

  const chosenClass = classEntries.find((c) => c.id === proposed.classId) || classEntries[0];

  const pc = {
    ...proposed,
    id: fillExistingId || slugifyGeneric(proposed.name),
    faction: faction || null,
    classId: chosenClass.id,
    className: chosenClass.name,
    derivedStats: genericSystem.useFormula ? computeDerivedStats(genericSystem, proposed.attributes) : null,
    sourceMode: "homebrew"
  };
  if (existingEntry) pc.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildSurvivorBodyHtmlGeneric(pc, genericSystem, null);
    return res.json({ preview: true, mode: "regenerate", category: "survivors", id: pc.id, name: pc.name, entry: pc, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await saveGenericSurvivorEntry(worldId, pc, genericSystem, null);
  res.json({ preview: false, id: pc.id, name: pc.name, className: pc.className, faction: pc.faction, summary: pc.designNotes });
}

module.exports = router;
