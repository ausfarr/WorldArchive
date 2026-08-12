const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { callClaudeExpectingJson } = require("../lib/claude");
const { buildEnemyRosterContext, readEnemyManifest, readEnemyEntry } = require("../lib/roster");
const { buildEnemyContentSystemPrompt } = require("../prompts/enemyContentPrompt");
const { saveEnemyEntry } = require("../lib/fileWriter");
const { slugify, buildEnemyBodyHtml } = require("../lib/enemyTemplate");
const { attributeBudgetWarning } = require("../lib/statFormulas");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt, getStatLabels, formatStatLabelsForPrompt } = require("../lib/worldFlavor");
const { createNewEnemy } = require("../lib/campaignEntryGenerators");
const { getRuleset } = require("../lib/worldConfigRepo");
const { listEntries, getEntry } = require("../lib/entriesRepo");

// Multi-ruleset genericization, Phase 3 (Bestiary proof of concept) --
// see session_addendum_ruleset_genericization.md.
const { save5eEnemyEntry } = require("../lib/rulesets/5e/enemyRepo");
const { slugify: slugify5e, buildEnemyBodyHtml: buildEnemyBodyHtml5e } = require("../lib/rulesets/5e/enemyTemplate");
const { XP_BY_CR } = require("../lib/rulesets/5e/statFormulas");
const { mapSrdMonsterMechanics } = require("../lib/rulesets/5e/srdMonsterMapper");
const { buildReflavorEnemySystemPrompt } = require("../prompts/rulesets/5e/enemyContentPrompt");
const { getSrdEntry, recordImport, isAlreadyImported } = require("../lib/srdLibraryRepo");
const { generateHomebrew5eEnemy } = require("../lib/rulesets/5e/homebrewEnemyGenerator");

// Multi-ruleset genericization, PF2e Bestiary (Homebrew tier only --
// see lib/rulesets/pf2e/statFormulas.js and
// prompts/rulesets/pf2e/enemyContentPrompt.js for why Import/Reflavor
// aren't available yet).
const { savePf2eEnemyEntry } = require("../lib/rulesets/pf2e/enemyRepo");
const { slugify: slugifyPf2e, buildEnemyBodyHtml: buildEnemyBodyHtmlPf2e } = require("../lib/rulesets/pf2e/enemyTemplate");
const { buildCreatureBudget, ROLE_TEMPLATES } = require("../lib/rulesets/pf2e/statFormulas");
const { buildHomebrewPf2eEnemySystemPrompt } = require("../prompts/rulesets/pf2e/enemyContentPrompt");

const router = express.Router();

router.post("/generate-enemy", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const ruleset = await getRuleset(req.worldId);

    if (ruleset === "5e") {
      return await handle5eEnemyGenerate(req, res);
    }
    if (ruleset === "pf2e") {
      return await handlePf2eEnemyGenerate(req, res);
    }
    if (ruleset !== "echoes") {
      // This category isn't built for this ruleset yet (pf2e/generic --
      // later phases). The generation cap was already spent by
      // enforceGenerationCap before we knew that, so refund it rather
      // than charging a world for an error response.
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(501).json({ error: `Bestiary generation isn't available yet for the '${ruleset}' ruleset.` });
    }

    return await handleEchoesEnemyGenerate(req, res);
  } catch (err) {
    console.error("Enemy generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Echoes path -- UNCHANGED from before this project (moved into its own
// function so the ruleset branch above can dispatch to it; the body
// below is byte-for-byte the same logic that used to be the whole route
// handler). See this project's hard constraint: every existing Echoes
// world must keep generating exactly as it did before.
// ============================================================
async function handleEchoesEnemyGenerate(req, res) {
  const worldId = req.worldId;
  let { name, faction, tier, fillExistingId } = req.body || {};

  if (!fillExistingId) {
    const result = await createNewEnemy(worldId, { name, faction, tier });
    return res.json({ preview: false, ...result });
  }

  let existingEntry = null;
  let priorRaw = null;
  let priorBodyHtml = null;
  let mode = "new";

  if (fillExistingId) {
    const manifest = await readEnemyManifest(worldId);
    existingEntry = manifest.find((m) => m.id === fillExistingId);
    if (!existingEntry) {
      return res.status(404).json({ error: `No existing enemy entry found with id '${fillExistingId}'` });
    }
    mode = existingEntry.locked ? "fill" : "regenerate";
    if (mode === "regenerate") {
      const prior = await readEnemyEntry(worldId, fillExistingId);
      priorRaw = prior && prior.raw ? prior.raw : null;
      priorBodyHtml = prior ? prior.bodyHtml : null;
    }
    name = existingEntry.name;
    faction = existingEntry.faction || faction;
    // existingEntry.tier is already a real, structured field (see
    // fileWriter.js's saveEnemyEntry) reliably present via raw_json
    // spread -- dropped the subtitle-parsing fallback this used to
    // fall through to, since it depended on subtitle formatting never
    // changing and never actually fires for a real entry.
    tier = existingEntry.tier || tier;
  }

  const rosterContext = await buildEnemyRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "enemies", faction });
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const statLabels = await getStatLabels(worldId);
  const statLabelsText = formatStatLabelsForPrompt(statLabels);

  const contentSystemPrompt = buildEnemyContentSystemPrompt({ settingContext, loreContext, factionOptionsText, statLabelsText, rosterContext, name, faction, tier, existingContent: priorRaw });
  const enemy = await callClaudeExpectingJson({
    systemPrompt: contentSystemPrompt,
    userMessage: "Generate the enemy now.",
    maxTokens: 3000
  });
  enemy.id = fillExistingId || enemy.id || slugify(enemy.name);
  if (existingEntry) enemy.name = existingEntry.name;

  // Same fix as routes/generate.js — a user-selected faction is a known
  // fact, not a suggestion, so it overrides whatever the model output.
  if (faction) enemy.faction = faction;

  const warning = attributeBudgetWarning(enemy.attributes, enemy.tier);
  if (warning) console.warn("Attribute budget check:", warning);

  if (mode === "regenerate") {
    const newBodyHtmlPreview = buildEnemyBodyHtml(enemy, null, statLabels);
    return res.json({
      preview: true,
      mode: "regenerate",
      category: "enemies",
      id: enemy.id,
      name: enemy.name,
      entry: enemy,
      newBodyHtmlPreview,
      oldBodyHtmlPreview: priorBodyHtml,
      attributeBudgetWarning: warning
    });
  }

  // Portrait generation is no longer bundled into entry creation --
  // saved immediately with imageUrl: null, and the dossier page offers
  // Generate/Upload actions via archive/js/portraitActions.js +
  // routes/generateEntryImage.js instead. (This decoupling was
  // originally done in a separate chat session in this project; being
  // restored here after it was accidentally reverted by an unrelated
  // later delivery that touched this same file.)
  await saveEnemyEntry(worldId, enemy, null);

  res.json({
    preview: false,
    id: enemy.id,
    name: enemy.name,
    tier: enemy.tier,
    faction: enemy.faction,
    summary: enemy.designNotes,
    attributeBudgetWarning: warning
  });
}

// ============================================================
// 5e path -- Phase 3 proof of concept for the whole ruleset pattern.
// Three tiers dispatched by req.body.mode: 'import' (no AI), 'reflavor'
// (AI rewrites narrative only, mechanics untouched), 'homebrew' (AI
// invents fresh stats, code computes the real CR).
// ============================================================
// extractOffenseForCr / looksLikeBroadResistanceOrImmunity moved into
// lib/rulesets/5e/homebrewEnemyGenerator.js when the Homebrew branch
// below was extracted into a shared, reusable function (Phase 7 needed
// the exact same pipeline for NPCs' "Combatant" upgrade -- "reuse it,
// don't fork it").

async function findExistingEnemyEntry(worldId, fillExistingId) {
  const manifest = await listEntries(worldId, "enemies");
  const existingEntry = manifest.find((m) => m.id === fillExistingId);
  if (!existingEntry) return null;
  const full = await getEntry(worldId, "enemies", fillExistingId);
  return { manifestEntry: existingEntry, raw: full && full.raw ? full.raw : null, bodyHtml: full ? full.bodyHtml : null };
}

async function handle5eEnemyGenerate(req, res) {
  const worldId = req.worldId;
  const { name, faction, fillExistingId, srdLibraryId, targetCr } = req.body || {};
  const mode = req.body && req.body.mode;

  let existingEntry = null;
  let isFill = false;
  let isRegenerate = false;
  if (fillExistingId) {
    existingEntry = await findExistingEnemyEntry(worldId, fillExistingId);
    if (!existingEntry) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No existing enemy entry found with id '${fillExistingId}'` });
    }
    isFill = existingEntry.manifestEntry.locked;
    isRegenerate = !isFill;
  }

  const effectiveMode = mode || (existingEntry && existingEntry.raw && existingEntry.raw.sourceMode) || "homebrew";
  if (!["import", "reflavor", "homebrew"].includes(effectiveMode)) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "5e enemy generation requires a 'mode' of 'import', 'reflavor', or 'homebrew'." });
  }

  // ---- Import: zero AI cost, direct copy from srd_library ----
  if (effectiveMode === "import") {
    if (req.refundGeneration) await req.refundGeneration(); // Phase 12 scope is a full 0-point billing path; refunding here gets the same result today without a bigger enforceGenerationCap rework.
    if (!srdLibraryId) return res.status(400).json({ error: "Import mode requires srdLibraryId." });
    const srdRow = await getSrdEntry(srdLibraryId);
    if (!srdRow) return res.status(404).json({ error: `No SRD library entry found with id '${srdLibraryId}'.` });

    const alreadyImportedAs = await isAlreadyImported(worldId, srdLibraryId);
    if (alreadyImportedAs && alreadyImportedAs !== fillExistingId) {
      return res.status(409).json({ error: `This SRD monster was already imported into this world as '${alreadyImportedAs}'.` });
    }

    const mechanics = mapSrdMonsterMechanics(srdRow.data_json);
    mechanics.challengeRating.xp = XP_BY_CR[mechanics.challengeRating.cr] || null;
    const enemy = {
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

    if (isRegenerate) {
      const newBodyHtmlPreview = buildEnemyBodyHtml5e(enemy, null);
      return res.json({ preview: true, mode: "regenerate", category: "enemies", id: enemy.id, name: enemy.name, entry: enemy, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
    }

    await save5eEnemyEntry(worldId, enemy, null);
    await recordImport(worldId, srdLibraryId, enemy.id);
    return res.json({ preview: false, id: enemy.id, name: enemy.name, summary: `Imported from 5e SRD (${srdRow.source_edition}).` });
  }

  // ---- Reflavor / Homebrew both call Claude ----
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "enemies", faction });

  let enemy;

  if (effectiveMode === "reflavor") {
    // srdLibraryId (the srd_library row's UUID primary key) must be
    // passed explicitly on every call, including a regenerate -- an
    // existing reflavored entry only stores srdSourceId (the human
    // slug, e.g. "goblin", kept for display) on its raw_json, not the
    // UUID getSrdEntry() needs, and re-resolving slug -> UUID isn't
    // worth a second lookup helper for this proof-of-concept phase. The
    // frontend already has srdLibraryId on hand for a regenerate (it's
    // how the reflavor was requested the first time), so this is a
    // reasonable contract, not a real limitation.
    if (!srdLibraryId) return res.status(400).json({ error: "Reflavor mode requires srdLibraryId." });
    const srdRow = await getSrdEntry(srdLibraryId);
    if (!srdRow) return res.status(404).json({ error: `No SRD library entry found with id '${srdLibraryId}'.` });

    const systemPrompt = buildReflavorEnemySystemPrompt({ settingContext, loreContext, factionOptionsText, sourceMonster: srdRow.data_json, faction });
    const reflavored = await callClaudeExpectingJson({ systemPrompt, userMessage: "Reflavor the monster now.", maxTokens: 2000 });

    const mechanics = mapSrdMonsterMechanics(srdRow.data_json);
    mechanics.challengeRating.xp = XP_BY_CR[mechanics.challengeRating.cr] || null;
    enemy = {
      id: fillExistingId || slugify5e(reflavored.name),
      name: reflavored.name,
      faction: faction || null,
      flavor: reflavored.flavor,
      designNotes: reflavored.designNotes,
      sourceMode: "reflavor",
      srdSourceId: srdRow.srd_id,
      srdLicenseNote: srdRow.license_note,
      ...mechanics,
      // Model's rewritten narrative overrides the mapper's raw-source
      // traits/actions -- but only the name/description text; the
      // mapper's mechanics (AC/HP/abilities/resistances/etc.) above are
      // NOT touched by the model at all.
      traits: reflavored.traits || mechanics.traits,
      actions: reflavored.actions && reflavored.actions.length === mechanics.actions.length ? reflavored.actions : mechanics.actions
    };
  } else {
    // Homebrew -- shared with Phase 7's NPC "Combatant" upgrade, see
    // lib/rulesets/5e/homebrewEnemyGenerator.js's header comment for why
    // this is a real extracted function and not inline logic anymore.
    enemy = await generateHomebrew5eEnemy(worldId, { name, faction, targetCr });
    if (fillExistingId) enemy.id = fillExistingId;
  }

  if (existingEntry) enemy.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildEnemyBodyHtml5e(enemy, null);
    return res.json({ preview: true, mode: "regenerate", category: "enemies", id: enemy.id, name: enemy.name, entry: enemy, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await save5eEnemyEntry(worldId, enemy, null);
  res.json({ preview: false, id: enemy.id, name: enemy.name, faction: enemy.faction, summary: enemy.designNotes });
}

// ============================================================
// PF2e path -- Homebrew tier only (see this file's top comment). No
// `mode` branching the way 5e has: every generation is a Homebrew
// build, so a request that explicitly asks for import/reflavor gets a
// clear 501 rather than silently treating it as Homebrew.
// ============================================================
async function handlePf2eEnemyGenerate(req, res) {
  const worldId = req.worldId;
  const { name, faction, fillExistingId, level, role } = req.body || {};
  const requestedMode = req.body && req.body.mode;

  if (requestedMode && requestedMode !== "homebrew") {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(501).json({ error: `Bestiary '${requestedMode}' mode isn't available for the pf2e ruleset yet -- only Homebrew generation is supported (no verified ORC-licensed monster dataset exists to import/reflavor from).` });
  }

  let existingEntry = null;
  let isFill = false;
  let isRegenerate = false;
  if (fillExistingId) {
    existingEntry = await findExistingEnemyEntry(worldId, fillExistingId);
    if (!existingEntry) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No existing enemy entry found with id '${fillExistingId}'` });
    }
    isFill = existingEntry.manifestEntry.locked;
    isRegenerate = !isFill;
  }

  const targetLevel = level != null ? level : (existingEntry && existingEntry.raw && existingEntry.raw.level) || 1;
  const targetRole = role || (existingEntry && existingEntry.raw && existingEntry.raw.role) || null;
  const roleTemplate = (targetRole && ROLE_TEMPLATES[targetRole]) || {};
  const budget = buildCreatureBudget(targetLevel, roleTemplate);

  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "enemies", faction });
  const rosterEntries = await listEntries(worldId, "enemies", { locked: false });
  const rosterContext = rosterEntries.length
    ? rosterEntries.map((e) => `- ${e.id} | ${e.name}: Level ${(e.level != null ? e.level : "?")}`).join("\n")
    : "No enemies archived yet -- any concept is available.";

  const systemPrompt = buildHomebrewPf2eEnemySystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, faction, level: targetLevel, role: targetRole, budget });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the creature now.", maxTokens: 2000 });

  // Strike "bonus" is code-authoritative (from the pre-computed budget),
  // never model-proposed -- same "model writes narrative, code writes
  // math" split as every other ruleset here. The model only supplies
  // name/traits/damage flavor text per Strike (see the prompt's schema).
  const attachBonus = (strikes) => (strikes || []).map((s) => ({ ...s, bonus: budget.strikeBonus, description: s.damageDescription || s.description }));

  const enemy = {
    ...proposed,
    id: fillExistingId || slugifyPf2e(proposed.name),
    faction: faction || null,
    level: budget.level,
    rarity: proposed.rarity || "Common",
    abilities: budget.abilities,
    armorClass: budget.armorClass,
    hitPoints: budget.hitPoints,
    perception: budget.perception,
    savingThrows: budget.savingThrows,
    melee: attachBonus(proposed.melee),
    ranged: attachBonus(proposed.ranged),
    role: targetRole,
    sourceMode: "homebrew"
  };

  if (existingEntry) enemy.id = existingEntry.manifestEntry.id;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildEnemyBodyHtmlPf2e(enemy, null);
    return res.json({ preview: true, mode: "regenerate", category: "enemies", id: enemy.id, name: enemy.name, entry: enemy, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await savePf2eEnemyEntry(worldId, enemy, null);
  res.json({ preview: false, id: enemy.id, name: enemy.name, faction: enemy.faction, summary: enemy.designNotes });
}

module.exports = router;
