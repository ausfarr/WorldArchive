const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { callClaudeExpectingJson } = require("../lib/claude");
const { buildItemRosterContext, readItemManifest, readItemEntry, buildLocationRosterContext } = require("../lib/roster");
const { buildItemContentSystemPrompt } = require("../prompts/itemContentPrompt");
const { saveItemEntry } = require("../lib/fileWriter");
const { slugify, buildItemBodyHtml } = require("../lib/itemTemplate");
const { clampDamageRange } = require("../lib/itemFormulas");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getStatLabels, formatStatLabelsForPrompt, getSkillSystem, formatWeaponSkillsForPrompt, resolveWeaponSkillLabel } = require("../lib/worldFlavor");
const { createNewItem } = require("../lib/campaignEntryGenerators");
const { requireCategoryAvailable } = require("../middleware/requireCategoryAvailable");
const { getRuleset } = require("../lib/worldConfigRepo");
const { listEntries, getEntry } = require("../lib/entriesRepo");

// Multi-ruleset genericization, Phase 6 (Items) -- see
// session_addendum_ruleset_genericization.md.
const { buildItemBodyHtml: buildItemBodyHtml5e } = require("../lib/rulesets/5e/itemTemplate");
const { getSrdEntry, getSrdEntryBySlug, recordImport, isAlreadyImported } = require("../lib/srdLibraryRepo");
const { POINTS_PER_GENERATION, POINTS_PER_FIELD_ASSIST } = require("../lib/worldConfigRepo");
const { generateHomebrew5eItem, import5eItem, reflavor5eItem } = require("../lib/rulesets/5e/homebrewItemGenerator");

// Generic Items (Homebrew only, narrative-first) -- see
// prompts/rulesets/generic/itemContentPrompt.js and
// lib/rulesets/generic/itemTemplate.js's header comments.
const { saveGenericItemEntry } = require("../lib/rulesets/generic/itemRepo");
const { buildItemBodyHtml: buildItemBodyHtmlGeneric } = require("../lib/rulesets/generic/itemTemplate");
const { getGenericSystem } = require("../lib/worldConfigRepo");
const { generateHomebrewGenericItem } = require("../lib/rulesets/generic/homebrewItemGenerator");
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

const RARITY_WORDS = ["Common", "Uncommon", "Rare", "Legendary"];
function parseSubtitleForItem(subtitle) {
  const words = (subtitle || "").split(/\s+/);
  const rarity = RARITY_WORDS.find((r) => words.includes(r)) || null;
  let category = null;
  if (/weapon/i.test(subtitle)) category = "Weapon";
  else if (/armor/i.test(subtitle)) category = "Armor";
  else if (/consumable/i.test(subtitle)) category = "Consumable";
  else if (/quest/i.test(subtitle)) category = "QuestItem";
  return { rarity, category };
}

router.post("/generate-item", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, requireCategoryAvailable("items"), async (req, res) => {
  try {
    const ruleset = await getRuleset(req.worldId);
    if (ruleset === "5e") {
      return await handle5eItemGenerate(req, res);
    }
    if (ruleset === "generic") {
      return await handleGenericItemGenerate(req, res);
    }
    return await handleEchoesItemGenerate(req, res);
  } catch (err) {
    console.error("Item generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Echoes path -- UNCHANGED from before this project.
// ============================================================
async function handleEchoesItemGenerate(req, res) {
  const worldId = req.worldId;
  let { name, category, rarity, fillExistingId } = req.body || {};

  if (!fillExistingId) {
    const result = await createNewItem(worldId, { name, category, rarity });
    return res.json({ preview: false, ...result });
  }

  let existingEntry = null;
  let priorRaw = null;
  let priorBodyHtml = null;
  let mode = "new";

  if (fillExistingId) {
    const manifest = await readItemManifest(worldId);
    existingEntry = manifest.find((m) => m.id === fillExistingId);
    if (!existingEntry) {
      return res.status(404).json({ error: `No existing item entry found with id '${fillExistingId}'` });
    }
    mode = existingEntry.locked ? "fill" : "regenerate";
    if (mode === "regenerate") {
      const gate = await requireSubscriptionToRegenerate(req);
      if (!gate.allowed) {
        if (req.refundGeneration) await req.refundGeneration();
        return res.status(403).json(gate.body);
      }
      const prior = await readItemEntry(worldId, fillExistingId);
      priorRaw = prior && prior.raw ? prior.raw : null;
      priorBodyHtml = prior ? prior.bodyHtml : null;
    }
    name = existingEntry.name;
    const parsed = parseSubtitleForItem(existingEntry.subtitle);
    category = parsed.category || category;
    rarity = parsed.rarity || rarity;
  }

  const rosterContext = await buildItemRosterContext(worldId);
  const locationRosterText = await buildLocationRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "items" });
  const settingContext = await getSettingContext(worldId);
  const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));
  const skillSystem = await getSkillSystem(worldId);
  const weaponSkillsText = formatWeaponSkillsForPrompt(skillSystem);

  const contentSystemPrompt = buildItemContentSystemPrompt({ settingContext, loreContext, statLabelsText, weaponSkillsText, rosterContext, locationRosterText, name, category, rarity, existingContent: priorRaw });
  let item = await callClaudeExpectingJson({
    systemPrompt: contentSystemPrompt,
    userMessage: "Generate the item now.",
    maxTokens: 2000
  });
  item.id = fillExistingId || item.id || slugify(item.name);
  if (existingEntry) item.name = existingEntry.name;

  // Defensive clamp - model occasionally drifts slightly outside the stated range
  if (item.category === "Weapon" && item.weaponSkill && item.damageMin != null && item.damageMax != null) {
    const clamped = clampDamageRange(item.weaponSkill, item.damageMin, item.damageMax);
    item.damageMin = clamped.min;
    item.damageMax = clamped.max;
  }

  // item.weaponSkill stays the fixed canonical English key (needed for
  // the clamp above and any future regenerate) -- weaponSkillLabel is
  // this world's own display name, resolved once here and rendered
  // instead of the canonical key everywhere a person actually sees it
  // (see lib/fileWriter.js's item tags).
  if (item.category === "Weapon" && item.weaponSkill) {
    item.weaponSkillLabel = resolveWeaponSkillLabel(skillSystem, item.weaponSkill);
  }

  const echoesLinkResult = await resolveReferencesForEntry(worldId, "items", item);
  item = echoesLinkResult.raw;

  if (mode === "regenerate") {
    const newBodyHtmlPreview = buildItemBodyHtml(item);
    return res.json({
      preview: true,
      mode: "regenerate",
      category: "items",
      id: item.id,
      name: item.name,
      entry: item,
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
  await saveItemEntry(worldId, item, null);
  await afterSave(worldId, "items", item, echoesLinkResult.unresolvedGhosts);

  res.json({
    preview: false,
    id: item.id,
    name: item.name,
    category: item.category,
    rarity: item.rarity,
    summary: item.designNotes
  });
}

// ============================================================
// 5e path -- three tiers as of R5 Phase 5, dispatched by req.body.mode:
// 'import' (no AI, direct copy from srd_library), 'reflavor' (AI rewrites
// narrative only, mechanics untouched), 'homebrew' (AI invents fresh
// item, weapon/armor mechanical stats resolved from the real lookup
// tables in lib/rulesets/5e/itemFormulas.js, never trusted from the
// model directly). Same three-tier shape as routes/generateEnemy.js's
// handle5eEnemyGenerate.
// resolveItemStats() moved into
// lib/rulesets/5e/homebrewItemGenerator.js when the Homebrew branch
// below was extracted into a shared, reusable function (Quest/Campaign
// Module slot-fill ruleset fix needed the exact same pipeline -- "reuse
// it, don't fork it", same as routes/generateEnemy.js's
// homebrewEnemyGenerator.js extraction).
// ============================================================

async function handle5eItemGenerate(req, res) {
  const worldId = req.worldId;
  // No faction field for 5e Items -- Austin's call: mundane SRD equipment
  // (a plain Longsword) doesn't fit "assign this to a faction" the way
  // Import does for real content elsewhere, and it's cleaner to drop it
  // from all three tiers than keep it selectively. factionOptionsText
  // below is still passed to Reflavor/Homebrew as grounding CONTEXT for
  // the model's flavor text -- a different thing from a user-set field.
  const { name, fillExistingId, rarity, itemType, srdLibraryId } = req.body || {};
  const mode = req.body && req.body.mode;

  let existingEntry = null;
  let isRegenerate = false;
  if (fillExistingId) {
    const manifest = await listEntries(worldId, "items");
    const manifestEntry = manifest.find((m) => m.id === fillExistingId);
    if (!manifestEntry) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No existing item entry found with id '${fillExistingId}'` });
    }
    const full = await getEntry(worldId, "items", fillExistingId);
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

  const effectiveMode = mode || (existingEntry && existingEntry.raw && existingEntry.raw.sourceMode) || "homebrew";
  if (!["import", "reflavor", "homebrew"].includes(effectiveMode)) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "5e item generation requires a 'mode' of 'import', 'reflavor', or 'homebrew'." });
  }

  // The generic card "Regenerate" button only ever posts { fillExistingId
  // } -- recover srdLibraryId from the existing entry's saved srdSourceId
  // when it's missing, same fallback as routes/generateEnemy.js. R6 Phase
  // 4: srd_library now has TWO item categories ('items' for mundane
  // equipment, 'magic-items' for the real 260 Magic Items), and srd_id is
  // only unique WITHIN a category (migrations/020's own UNIQUE(ruleset,
  // category, srd_id) constraint) -- so recovery needs to know which
  // category the entry actually came from, not just assume 'items'.
  // srdSourceCategory is stamped onto the entry below at Import/Reflavor
  // time; entries saved before this phase existed have no such field and
  // correctly default to 'items', the only category that existed then.
  let resolvedSrdLibraryId = srdLibraryId;
  if (!resolvedSrdLibraryId && (effectiveMode === "import" || effectiveMode === "reflavor") && existingEntry && existingEntry.raw && existingEntry.raw.srdSourceId) {
    const sourceCategory = existingEntry.raw.srdSourceCategory || "items";
    const recovered = await getSrdEntryBySlug("5e", sourceCategory, existingEntry.raw.srdSourceId);
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
      return res.status(409).json({ error: `This SRD item was already imported into this world as '${alreadyImportedAs}'.` });
    }

    // Extracted to lib/rulesets/5e/homebrewItemGenerator.js's
    // import5eItem() so lib/campaignEntryGenerators.js's createNewItem()
    // (Quest/Campaign Module slot-fill) can dispatch through the exact
    // same tier instead of only ever calling the Echoes-only prompt.
    let item = import5eItem(srdRow, { fillExistingId });

    const importLinkResult = await resolveReferencesForEntry(worldId, "items", item);
    item = importLinkResult.raw;

    if (isRegenerate) {
      const newBodyHtmlPreview = buildItemBodyHtml5e(item, null);
      return res.json({ preview: true, mode: "regenerate", category: "items", id: item.id, name: item.name, entry: item, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
    }

    await save5eItemEntry(worldId, item, null);
    await recordImport(worldId, resolvedSrdLibraryId, item.id);
    await afterSave(worldId, "items", item, importLinkResult.unresolvedGhosts);
    return res.json({ preview: false, id: item.id, name: item.name, summary: `Imported from 5e SRD (${srdRow.source_edition}).` });
  }

  // ---- Reflavor / Homebrew both call Claude ----
  let item;

  if (effectiveMode === "reflavor") {
    // srdLibraryId is recovered above (resolvedSrdLibraryId) from either
    // the request body (first-time reflavor) or the existing entry's
    // saved srdSourceId (a regenerate).
    if (!resolvedSrdLibraryId) return res.status(400).json({ error: "Reflavor mode requires srdLibraryId." });
    const srdRow = await getSrdEntry(resolvedSrdLibraryId);
    if (!srdRow) return res.status(404).json({ error: `No SRD library entry found with id '${resolvedSrdLibraryId}'.` });

    // Extracted to homebrewItemGenerator.js's reflavor5eItem() -- same
    // "reuse it, don't fork it" reasoning as Import above.
    item = await reflavor5eItem(worldId, srdRow, { fillExistingId });

    // Same Differential Billing treatment as Enemies' Reflavor tier --
    // only the gap between a full generation's points and a field-assist's
    // points is refunded, not the whole spend.
    if (req.refundGeneration) await req.refundGeneration(POINTS_PER_GENERATION - POINTS_PER_FIELD_ASSIST);
  } else {
    // Homebrew -- extracted to homebrewItemGenerator.js's
    // generateHomebrew5eItem(), same reasoning as Import/Reflavor above.
    item = await generateHomebrew5eItem(worldId, { name, rarity, itemType });
    if (fillExistingId) item.id = fillExistingId;
  }

  if (existingEntry) item.id = existingEntry.manifestEntry.id;

  const linkResult = await resolveReferencesForEntry(worldId, "items", item);
  item = linkResult.raw;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildItemBodyHtml5e(item, null);
    return res.json({ preview: true, mode: "regenerate", category: "items", id: item.id, name: item.name, entry: item, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await save5eItemEntry(worldId, item, null);
  await afterSave(worldId, "items", item, linkResult.unresolvedGhosts);
  res.json({ preview: false, id: item.id, name: item.name, rarity: item.rarity, summary: item.designNotes });
}

// ============================================================
// Generic path -- Homebrew only, narrative-first. boostsAttribute is
// validated against this world's own attribute keys (cleared to null,
// along with boostAmount, if the model hallucinates one that doesn't
// exist) rather than trusted outright, same defensive pattern used
// throughout this ruleset's other categories.
// ============================================================
async function handleGenericItemGenerate(req, res) {
  const worldId = req.worldId;
  const { name, faction, fillExistingId } = req.body || {};

  const genericSystem = await getGenericSystem(worldId);
  if (!genericSystem || !Array.isArray(genericSystem.attributes) || !genericSystem.attributes.length) {
    if (req.refundGeneration) await req.refundGeneration();
    return res.status(400).json({ error: "This world hasn't configured its homebrew attribute system yet -- finish that setup before generating an item." });
  }

  let existingEntry = null;
  let isRegenerate = false;
  if (fillExistingId) {
    const manifest = await listEntries(worldId, "items");
    const manifestEntry = manifest.find((m) => m.id === fillExistingId);
    if (!manifestEntry) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No existing item entry found with id '${fillExistingId}'` });
    }
    const full = await getEntry(worldId, "items", fillExistingId);
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

  // Extracted to lib/rulesets/generic/homebrewItemGenerator.js's
  // generateHomebrewGenericItem() so
  // lib/campaignEntryGenerators.js's createNewItem() (Quest/Campaign
  // Module slot-fill) can call the exact same pipeline instead of only
  // ever calling the Echoes-only prompt.
  let item = await generateHomebrewGenericItem(worldId, genericSystem, { name, faction });
  if (fillExistingId) item.id = fillExistingId;
  if (existingEntry) item.id = existingEntry.manifestEntry.id;

  const linkResult = await resolveReferencesForEntry(worldId, "items", item);
  item = linkResult.raw;

  if (isRegenerate) {
    const newBodyHtmlPreview = buildItemBodyHtmlGeneric(item, genericSystem, null);
    return res.json({ preview: true, mode: "regenerate", category: "items", id: item.id, name: item.name, entry: item, newBodyHtmlPreview, oldBodyHtmlPreview: existingEntry.bodyHtml });
  }

  await saveGenericItemEntry(worldId, item, genericSystem, null);
  await afterSave(worldId, "items", item, linkResult.unresolvedGhosts);
  res.json({ preview: false, id: item.id, name: item.name, faction: item.faction, summary: item.designNotes });
}

module.exports = router;
