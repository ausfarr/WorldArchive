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
const { POINTS_PER_GENERATION, POINTS_PER_FIELD_ASSIST } = require("../lib/worldConfigRepo");
const { listEntries, getEntry } = require("../lib/entriesRepo");

// Multi-ruleset genericization, Phase 3 (Bestiary proof of concept) --
// see session_addendum_ruleset_genericization.md.
const { save5eEnemyEntry } = require("../lib/rulesets/5e/enemyRepo");
const { buildEnemyBodyHtml: buildEnemyBodyHtml5e } = require("../lib/rulesets/5e/enemyTemplate");
const { getSrdEntry, getSrdEntryBySlug, recordImport, isAlreadyImported } = require("../lib/srdLibraryRepo");
const { generateHomebrew5eEnemy, import5eEnemy, reflavor5eEnemy } = require("../lib/rulesets/5e/homebrewEnemyGenerator");

// Multi-ruleset genericization, Phase 10 (Generic ruleset).
const { saveGenericEnemyEntry } = require("../lib/rulesets/generic/enemyRepo");
const { buildEnemyBodyHtml: buildEnemyBodyHtmlGeneric } = require("../lib/rulesets/generic/enemyTemplate");
const { generateHomebrewGenericEnemy } = require("../lib/rulesets/generic/homebrewEnemyGenerator");
const { getGenericSystem } = require("../lib/worldConfigRepo");
const { resolveReferencesForEntry, backfillReferencesFromNewEntry, ensureGhostPlaceholder } = require("../lib/entryLinker");
const { requireSubscriptionToRegenerate } = require("../lib/regenerateGate");

const router = express.Router();

// Entry cross-linking (Phase 2) -- see lib/entryLinker.js.
async function afterSave(worldId, category, savedContent, unresolvedGhosts) {
  await backfillReferencesFromNewEntry(worldId, category, savedContent);
  for (const ghost of unresolvedGhosts || []) {
    await ensureGhostPlaceholder(worldId, ghost.category, ghost.name);
  }
}

router.post("/generate-enemy", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const ruleset = await getRuleset(req.worldId);

    if (ruleset === "5e") {
      return await handle5eEnemyGenerate(req, res);
    }
    if (ruleset === "generic") {
      return await handleGenericEnemyGenerate(req, res);
    }
    if (ruleset !== "echoes") {
      // This category isn't built for this ruleset yet. The generation
      // cap was already spent by
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
      const gate = await requireSubscriptionToRegenerate(req);
      if (!gate.allowed) {
        if (req.refundGeneration) await req.refundGeneration();
        return res.status(403).json(gate.body);
      }
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
  let enemy = await callClaudeExpectingJson({
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

  const echoesLinkResult = await resolveReferencesForEntry(worldId, "enemies", enemy);
  enemy = echoesLinkResult.raw;

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
  await afterSave(worldId, "enemies", enemy, echoesLinkResult.unresolvedGhosts);

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
    return res.status(400).json({ error: "5e enemy generation requires a 'mode' of 'import', 'reflavor', or 'homebrew'." });
  }

  // The generic card "Regenerate" button (archive/js/render.js's
  // regenerateEntry()) only ever posts { fillExistingId } -- it has no
  // way to resupply srdLibraryId for an import/reflavor entry, so recover
  // it from what's already saved (srdSourceId, the human slug) rather
  // than erroring on every regenerate of an imported/reflavored entry.
  // See lib/srdLibraryRepo.js's getSrdEntryBySlug() for why this is safe.
  let resolvedSrdLibraryId = srdLibraryId;
  if (!resolvedSrdLibraryId && (effectiveMode === "import" || effectiveMode === "reflavor") && existingEntry && existingEntry.raw && existingEntry.raw.srdSourceId) {
    const recovered = await getSrdEntryBySlug("5e", "monsters", existingEntry.raw.srdSourceId);
    if (recovered) resolvedSrdLibraryId = recovered.id;
  }

  // ---- Import: zero AI cost, direct copy from srd_library ----
  if (effectiveMode === "import") {
    if (req.refundGeneration) await req.refundGeneration(); // Phase 12 scope is a full 0-point billing path; refunding here gets the same result today without a bigger enforceGenerationCap rework.
    if (!resolvedSrdLibraryId) return res.status(400).json({ error: "Import mode requires srdLibraryId." });
    const srdRow = await getSrdEntry(resolvedSrdLibraryId);
    if (!srdRow) return res.status(404).json({ error: `No SRD library entry found with id '${resolvedSrdLibraryId}'.` });

    const alreadyImportedAs = await isAlreadyImported(worldId, resolvedSrdLibraryId);
    if (alreadyImportedAs && alreadyImportedAs !== fillExistingId) {
      return res.status(409).json({ error: `This SRD monster was already imported into this world as '${alreadyImportedAs}'.` });
    }

    // Extracted to lib/rulesets/5e/homebrewEnemyGenerator.js's
    // import5eEnemy() so lib/campaignEntryGenerators.js's createNewEnemy()
    // (Quest/Campaign Module slot-fill) can dispatch through the exact
    // same tier instead of only ever calling the Echoes-only prompt.
    let enemy = import5eEnemy(srdRow, { faction: faction || (existingEntry && existingEntry.raw && existingEntry.raw.faction) || null, fillExistingId });

    const importLinkResult = await resolveReferencesForEntry(worldId, "enemies", enemy);
    enemy = importLinkResult.raw;

    if (isRegenerate) {
      const newBodyHtmlPreview = buildEnemyBodyHtml5e(enemy, null);
      return res.json({ preview: true, mode: "regenerate", category: "enemies", id: enemy.id, name: enemy.name, entry: enemy, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
    }

    await save5eEnemyEntry(worldId, enemy, null);
    await recordImport(worldId, resolvedSrdLibraryId, enemy.id);
    await afterSave(worldId, "enemies", enemy, importLinkResult.unresolvedGhosts);
    return res.json({ preview: false, id: enemy.id, name: enemy.name, summary: `Imported from 5e SRD (${srdRow.source_edition}).` });
  }

  // ---- Reflavor / Homebrew both call Claude ----
  let enemy;

  if (effectiveMode === "reflavor") {
    // srdLibraryId is recovered above (resolvedSrdLibraryId) from either
    // the request body (first-time reflavor) or the existing entry's
    // saved srdSourceId (a regenerate).
    if (!resolvedSrdLibraryId) return res.status(400).json({ error: "Reflavor mode requires srdLibraryId." });
    const srdRow = await getSrdEntry(resolvedSrdLibraryId);
    if (!srdRow) return res.status(404).json({ error: `No SRD library entry found with id '${resolvedSrdLibraryId}'.` });

    // Extracted to homebrewEnemyGenerator.js's reflavor5eEnemy() -- same
    // "reuse it, don't fork it" reasoning as Import above.
    enemy = await reflavor5eEnemy(worldId, srdRow, { faction, fillExistingId });

    // Phase 12 (Differential Billing): Reflavor only asks the model to
    // rewrite wording -- every mechanically-relevant number is carried
    // through untouched from the SRD source. That's much closer to a
    // field-assist ("help me reword this") than a full from-scratch
    // generation, so once the reflavor has actually succeeded, refund the
    // gap between what enforceGenerationCap already spent up front (a
    // full generation's points, since mode isn't known until this
    // handler runs) and the field-assist rate this tier should really
    // cost. Only the difference is refunded -- not the whole spend,
    // unlike Import above -- so Reflavor still costs something, just
    // less than Homebrew.
    if (req.refundGeneration) await req.refundGeneration(POINTS_PER_GENERATION - POINTS_PER_FIELD_ASSIST);
  } else {
    // Homebrew -- shared with Phase 7's NPC "Combatant" upgrade, see
    // lib/rulesets/5e/homebrewEnemyGenerator.js's header comment for why
    // this is a real extracted function and not inline logic anymore.
    enemy = await generateHomebrew5eEnemy(worldId, { name, faction, targetCr });
    if (fillExistingId) enemy.id = fillExistingId;
  }

  if (existingEntry) enemy.id = existingEntry.manifestEntry.id;

  const linkResult = await resolveReferencesForEntry(worldId, "enemies", enemy);
  enemy = linkResult.raw;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildEnemyBodyHtml5e(enemy, null);
    return res.json({ preview: true, mode: "regenerate", category: "enemies", id: enemy.id, name: enemy.name, entry: enemy, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await save5eEnemyEntry(worldId, enemy, null);
  await afterSave(worldId, "enemies", enemy, linkResult.unresolvedGhosts);
  res.json({ preview: false, id: enemy.id, name: enemy.name, faction: enemy.faction, summary: enemy.designNotes });
}

// ============================================================
// Generic ruleset path -- Homebrew only, by definition. Adapts to
// whatever this world configured in generic_system_json (Phase 10):
// world-defined attributes, and derived stats computed by code ONLY if
// this world opted into a formula layer -- never fabricated otherwise.
// ============================================================
async function handleGenericEnemyGenerate(req, res) {
  const worldId = req.worldId;
  const { name, faction, fillExistingId } = req.body || {};

  const genericSystem = await getGenericSystem(worldId);
  if (!genericSystem || !Array.isArray(genericSystem.attributes) || !genericSystem.attributes.length) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "This world hasn't configured its homebrew attribute system yet -- finish that setup before generating a monster." });
  }

  let existingEntry = null;
  let isRegenerate = false;
  if (fillExistingId) {
    const manifest = await listEntries(worldId, "enemies");
    const manifestEntry = manifest.find((m) => m.id === fillExistingId);
    if (!manifestEntry) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No existing enemy entry found with id '${fillExistingId}'` });
    }
    const full = await getEntry(worldId, "enemies", fillExistingId);
    existingEntry = { manifestEntry, raw: full && full.raw ? full.raw : null, bodyHtml: full ? full.bodyHtml : null };
    isRegenerate = !manifestEntry.locked;
    if (isRegenerate) {
      const gate = await requireSubscriptionToRegenerate(req);
      if (!gate.allowed) {
        if (req.refundGeneration) await req.refundGeneration();
        return res.status(403).json(gate.body);
      }
    }
  }

  // Shared with the NPC "Combatant" upgrade
  // (lib/rulesets/generic/homebrewEnemyGenerator.js) -- same "reuse it,
  // don't fork it" pattern the 5e version already established.
  let enemy = await generateHomebrewGenericEnemy(worldId, genericSystem, { name, faction });
  if (fillExistingId) enemy.id = fillExistingId;
  if (existingEntry) enemy.id = existingEntry.manifestEntry.id;

  const linkResult = await resolveReferencesForEntry(worldId, "enemies", enemy);
  enemy = linkResult.raw;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildEnemyBodyHtmlGeneric(enemy, genericSystem, null);
    return res.json({ preview: true, mode: "regenerate", category: "enemies", id: enemy.id, name: enemy.name, entry: enemy, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await saveGenericEnemyEntry(worldId, enemy, genericSystem, null);
  await afterSave(worldId, "enemies", enemy, linkResult.unresolvedGhosts);
  res.json({ preview: false, id: enemy.id, name: enemy.name, faction: enemy.faction, summary: enemy.designNotes });
}

module.exports = router;
