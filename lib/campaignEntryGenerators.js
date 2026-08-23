// lib/campaignEntryGenerators.js
//
// Campaign Structure -- see session_addendum_campaign_structure_scope.md.
// Each of NPCs/Locations/Items/Logs already generates-and-saves a
// brand-new entry inline inside its own route handler (routes/generate.js,
// generateLocation.js, generateItem.js, generateLog.js) -- there was no
// reusable piece to call into. This file extracts exactly that "new
// entry" path (NOT the fillExistingId/regenerate path, which stays in
// each route since Campaign Module generation never targets an existing
// placeholder) into one function per category, so:
//
//   1. Each route's own "/generate-X" handler calls the extracted
//      function instead of duplicating the logic -- behavior for the
//      existing "Generate New Entry" buttons is UNCHANGED.
//   2. routes/campaignModule.js calls the same functions directly
//      in-process when a Campaign Module needs a brand-new entry to fill
//      an unmatched slot ("Generate one" in the preview).
//
// Every function here takes an optional `campaignContext` (free text,
// e.g. "a corrupt tower guard who demands a bribe") -- see the matching
// addition to each prompts/*ContentPrompt.js file, additive-only, empty
// string when absent so nothing else is affected.
//
// Each function costs exactly one generation call and is NOT itself
// cap-gated here -- the caller (either the route's own
// enforceGenerationCap middleware, or routes/campaignModule.js's own
// explicit cap check before calling in) is responsible for that, so the
// cap is deducted exactly once per real call regardless of which caller
// triggered it.

const { callClaudeExpectingJson } = require("./claude");
const { buildRosterContext, buildLocationRosterContext, buildItemRosterContext, buildLogRosterContext, buildEnemyRosterContext } = require("./roster");
const { buildNpcContentSystemPrompt } = require("../prompts/npcContentPrompt");
const { buildLocationContentSystemPrompt } = require("../prompts/locationContentPrompt");
const { buildItemContentSystemPrompt } = require("../prompts/itemContentPrompt");
const { buildLogContentSystemPrompt } = require("../prompts/logContentPrompt");
const { buildEnemyContentSystemPrompt } = require("../prompts/enemyContentPrompt");
const { saveNpcEntry, saveLocationEntry, saveItemEntry, saveLogEntry, saveEnemyEntry } = require("./fileWriter");
const { slugify: slugifyNpc } = require("./entryTemplate");
const { slugify: slugifyLocation } = require("./locationTemplate");
const { slugify: slugifyItem } = require("./itemTemplate");
const { slugify: slugifyLog } = require("./logTemplate");
const { slugify: slugifyEnemy } = require("./enemyTemplate");
const { clampDamageRange } = require("./itemFormulas");
const { attributeBudgetWarning } = require("./statFormulas");
const { getLoreContext } = require("./loreContext");
const { getRuleset, getCalendarConfig } = require("./worldConfigRepo");
const { formatCalendarContextForPrompt, resolveRegeneratedDate } = require("./calendar");
const { DEFAULT_NPC_COMBAT_PROFILE } = require("./rulesets/5e/npcCombatDefaults");
const { buildDefaultCombatProfile: buildDefaultGenericCombatProfile } = require("./rulesets/generic/npcCombatDefaults");
const { getGenericSystem } = require("./worldConfigRepo");
const { resolveReferencesForEntry, backfillReferencesFromNewEntry, ensureGhostPlaceholder } = require("./entryLinker");
const { buildKnownDatesContext } = require("./dateContext");
const { maybeCreateDateSuggestion, validateResolvedDateSubject } = require("./logDateSuggestions");

// Quest/Campaign Module slot-fill ruleset fix -- see
// session_addendum_quest_slot_fill_ruleset_and_background_equipment.md.
// createNewEnemy()/createNewItem() below used to unconditionally call the
// Echoes-only prompt/writer regardless of this world's actual ruleset
// (NPCs/Locations/Logs don't have this problem -- they're ruleset-
// agnostic by design, see world_forge_scope.md). These imports let both
// functions dispatch on getRuleset(worldId) exactly like
// routes/generateEnemy.js and routes/generateItem.js already do.
const { save5eEnemyEntry } = require("./rulesets/5e/enemyRepo");
const { saveGenericEnemyEntry } = require("./rulesets/generic/enemyRepo");
const { generateHomebrew5eEnemy, import5eEnemy, reflavor5eEnemy } = require("./rulesets/5e/homebrewEnemyGenerator");
const { generateHomebrewGenericEnemy } = require("./rulesets/generic/homebrewEnemyGenerator");
const { save5eItemEntry } = require("./rulesets/5e/itemRepo");
const { saveGenericItemEntry } = require("./rulesets/generic/itemRepo");
const { generateHomebrew5eItem, import5eItem, reflavor5eItem } = require("./rulesets/5e/homebrewItemGenerator");
const { generateHomebrewGenericItem } = require("./rulesets/generic/homebrewItemGenerator");
const { getSrdEntry, isAlreadyImported, recordImport } = require("./srdLibraryRepo");

// Entry cross-linking (Phase 2): each createNewX() below is the actual
// save point for the "Generate New Entry" path (and routes/campaignModule.js's
// reuse of the same functions), so the forward-resolve happens here right
// before the save, and backward-resolve + ghost creation right after --
// not duplicated back in each route, since the route just calls through.
async function afterSave(worldId, category, savedContent, unresolvedGhosts) {
  await backfillReferencesFromNewEntry(worldId, category, savedContent);
  for (const ghost of unresolvedGhosts) {
    await ensureGhostPlaceholder(worldId, ghost.category, ghost.name);
  }
}
const {
  getSettingContext,
  getFactionOptions,
  formatFactionOptionsForPrompt,
  getStatLabels,
  formatStatLabelsForPrompt,
  getSkillSystem,
  formatWeaponSkillsForPrompt,
  resolveWeaponSkillLabel
} = require("./worldFlavor");

async function createNewNpc(worldId, { name, role, faction, campaignContext } = {}) {
  const rosterContext = await buildRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "npcs", faction });
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const calendarConfig = await getCalendarConfig(worldId);

  const contentSystemPrompt = buildNpcContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, role, faction, existingContent: null, campaignContext, calendarContext: formatCalendarContextForPrompt(calendarConfig) });
  let npc = await callClaudeExpectingJson({ systemPrompt: contentSystemPrompt, userMessage: "Generate the NPC now.", maxTokens: 3000 });
  npc.id = npc.id || slugifyNpc(npc.name);
  if (faction) npc.faction = faction;
  // Session Prep Companion, Phase 3 -- model proposes, code validates.
  npc.birthDate = resolveRegeneratedDate(npc.birthDate, calendarConfig);
  npc.appointedDate = resolveRegeneratedDate(npc.appointedDate, calendarConfig);
  npc.deathDate = resolveRegeneratedDate(npc.deathDate, calendarConfig);

  // Multi-ruleset genericization, Phase 7: every NPC in a 5e-ruleset
  // world gets a lightweight default combat profile so it's never a hard
  // dead-end if players attack it -- see
  // lib/rulesets/<id>/npcCombatDefaults.js. NPCs stay ruleset-agnostic
  // narrative content otherwise (see world_forge_scope.md), so this is
  // the one place ruleset matters for this category, and it's additive
  // (lib/entryTemplate.js's buildBodyHtml only renders a Combat Profile
  // section when this field is present).
  const npcRuleset = await getRuleset(worldId);
  if (npcRuleset === "5e") {
    npc.combatProfile = DEFAULT_NPC_COMBAT_PROFILE;
  } else if (npcRuleset === "generic") {
    const genericSystem = await getGenericSystem(worldId);
    // Only attach a profile if this world has actually configured its
    // attribute system yet -- an empty/absent one would denormalize to
    // an empty attributes array, which is indistinguishable from "no
    // combat profile at all" and not worth attaching.
    if (genericSystem && Array.isArray(genericSystem.attributes) && genericSystem.attributes.length) {
      npc.combatProfile = buildDefaultGenericCombatProfile(genericSystem);
    }
  }

  const npcLinkResult = await resolveReferencesForEntry(worldId, "npcs", npc);
  npc = npcLinkResult.raw;

  await saveNpcEntry(worldId, npc, null);
  await afterSave(worldId, "npcs", npc, npcLinkResult.unresolvedGhosts);
  return { id: npc.id, name: npc.name, roleArchetype: npc.roleArchetype, faction: npc.faction, summary: npc.designNotes };
}

async function createNewLocation(worldId, { name, regionBiome, faction, campaignContext } = {}) {
  const rosterContext = await buildLocationRosterContext(worldId);
  const npcRosterText = await buildRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "locations", faction });
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

  const contentSystemPrompt = buildLocationContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, npcRosterText, name, regionBiome, faction, existingContent: null, campaignContext });
  let location = await callClaudeExpectingJson({ systemPrompt: contentSystemPrompt, userMessage: "Generate the Location now.", maxTokens: 2500 });
  location.id = location.id || slugifyLocation(location.name);
  if (faction) location.faction = faction;

  const locationLinkResult = await resolveReferencesForEntry(worldId, "locations", location);
  location = locationLinkResult.raw;

  await saveLocationEntry(worldId, location, null);
  await afterSave(worldId, "locations", location, locationLinkResult.unresolvedGhosts);
  return { id: location.id, name: location.name, regionBiome: location.regionBiome, faction: location.faction, summary: location.designNotes };
}

const RARITY_WORDS = ["Common", "Uncommon", "Rare", "Legendary"];

// Quest/Campaign Module slot-fill ruleset fix -- createNewItem() now
// dispatches on this world's ruleset exactly like
// routes/generateItem.js's own POST /generate-item handler does, instead
// of unconditionally calling the Echoes-only prompt/writer regardless of
// ruleset. `mode` ("import" | "reflavor" | "homebrew", default
// "homebrew") and `srdLibraryId` mirror that route's request shape --
// see lib/rulesets/5e/homebrewItemGenerator.js for the three tiers this
// dispatches into.
async function createNewItem(worldId, { name, category, rarity, campaignContext, mode, srdLibraryId } = {}) {
  const ruleset = await getRuleset(worldId);

  if (ruleset === "5e") {
    return await createNewItem5e(worldId, { name, rarity, itemType: category, campaignContext, mode: mode || "homebrew", srdLibraryId });
  }
  if (ruleset === "generic") {
    return await createNewItemGeneric(worldId, { name, campaignContext });
  }
  return await createNewItemEchoes(worldId, { name, category, rarity, campaignContext });
}

async function createNewItemEchoes(worldId, { name, category, rarity, campaignContext } = {}) {
  const rosterContext = await buildItemRosterContext(worldId);
  const locationRosterText = await buildLocationRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "items" });
  const settingContext = await getSettingContext(worldId);
  const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));
  const skillSystem = await getSkillSystem(worldId);
  const weaponSkillsText = formatWeaponSkillsForPrompt(skillSystem);
  const calendarConfig = await getCalendarConfig(worldId);

  const contentSystemPrompt = buildItemContentSystemPrompt({ settingContext, loreContext, statLabelsText, weaponSkillsText, rosterContext, locationRosterText, name, category, rarity, existingContent: null, campaignContext, calendarContext: formatCalendarContextForPrompt(calendarConfig) });
  let item = await callClaudeExpectingJson({ systemPrompt: contentSystemPrompt, userMessage: "Generate the item now.", maxTokens: 2000 });
  item.id = item.id || slugifyItem(item.name);
  // Session Prep Companion, Phase 3 -- QuestItem sub-type only.
  if (item.category === "QuestItem") {
    item.createdDate = resolveRegeneratedDate(item.createdDate, calendarConfig);
    item.discoveredDate = resolveRegeneratedDate(item.discoveredDate, calendarConfig);
  } else {
    item.createdDate = null;
    item.discoveredDate = null;
  }

  if (item.category === "Weapon" && item.weaponSkill && item.damageMin != null && item.damageMax != null) {
    const clamped = clampDamageRange(item.weaponSkill, item.damageMin, item.damageMax);
    item.damageMin = clamped.min;
    item.damageMax = clamped.max;
  }
  if (item.category === "Weapon" && item.weaponSkill) {
    item.weaponSkillLabel = resolveWeaponSkillLabel(skillSystem, item.weaponSkill);
  }

  const itemLinkResult = await resolveReferencesForEntry(worldId, "items", item);
  item = itemLinkResult.raw;

  await saveItemEntry(worldId, item, null);
  await afterSave(worldId, "items", item, itemLinkResult.unresolvedGhosts);
  return { id: item.id, name: item.name, category: item.category, rarity: item.rarity, summary: item.designNotes };
}

async function createNewItem5e(worldId, { name, rarity, itemType, campaignContext, mode, srdLibraryId } = {}) {
  let item;

  if (mode === "import") {
    if (!srdLibraryId) throw new Error("Import mode requires srdLibraryId.");
    const srdRow = await getSrdEntry(srdLibraryId);
    if (!srdRow) throw new Error(`No SRD library entry found with id '${srdLibraryId}'.`);
    const alreadyImportedAs = await isAlreadyImported(worldId, srdLibraryId);
    if (alreadyImportedAs) throw new Error(`This SRD item was already imported into this world as '${alreadyImportedAs}'.`);

    item = import5eItem(srdRow, {});
    const linkResult = await resolveReferencesForEntry(worldId, "items", item);
    item = linkResult.raw;
    await save5eItemEntry(worldId, item, null);
    await recordImport(worldId, srdLibraryId, item.id);
    await afterSave(worldId, "items", item, linkResult.unresolvedGhosts);
    return { id: item.id, name: item.name, summary: `Imported from 5e SRD (${srdRow.source_edition}).` };
  }

  if (mode === "reflavor") {
    if (!srdLibraryId) throw new Error("Reflavor mode requires srdLibraryId.");
    const srdRow = await getSrdEntry(srdLibraryId);
    if (!srdRow) throw new Error(`No SRD library entry found with id '${srdLibraryId}'.`);
    item = await reflavor5eItem(worldId, srdRow, { campaignContext });
  } else {
    item = await generateHomebrew5eItem(worldId, { name, rarity, itemType, campaignContext });
  }

  const linkResult = await resolveReferencesForEntry(worldId, "items", item);
  item = linkResult.raw;
  await save5eItemEntry(worldId, item, null);
  await afterSave(worldId, "items", item, linkResult.unresolvedGhosts);
  return { id: item.id, name: item.name, rarity: item.rarity, summary: item.designNotes };
}

async function createNewItemGeneric(worldId, { name, campaignContext } = {}) {
  const genericSystem = await getGenericSystem(worldId);
  if (!genericSystem || !Array.isArray(genericSystem.attributes) || !genericSystem.attributes.length) {
    throw new Error("This world hasn't configured its homebrew attribute system yet -- finish that setup before generating an item.");
  }

  let item = await generateHomebrewGenericItem(worldId, genericSystem, { name, campaignContext });
  const linkResult = await resolveReferencesForEntry(worldId, "items", item);
  item = linkResult.raw;
  await saveGenericItemEntry(worldId, item, genericSystem, null);
  await afterSave(worldId, "items", item, linkResult.unresolvedGhosts);
  return { id: item.id, name: item.name, faction: item.faction, summary: item.designNotes };
}

async function createNewLog(worldId, { name, logType, campaignContext } = {}) {
  const rosterContext = await buildLogRosterContext(worldId);
  const locationRosterText = await buildLocationRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "logs" });
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const calendarConfig = await getCalendarConfig(worldId);
  const knownDatesContext = await buildKnownDatesContext(worldId, calendarConfig);

  const contentSystemPrompt = buildLogContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, locationRosterText, name, logType, existingContent: null, campaignContext, calendarContext: formatCalendarContextForPrompt(calendarConfig), knownDatesContext });
  let log = await callClaudeExpectingJson({ systemPrompt: contentSystemPrompt, userMessage: "Generate the log now.", maxTokens: 1500 });
  log.id = log.id || slugifyLog(log.name);
  // Session Prep Companion, Phase 3 -- model proposes, code validates.
  log.resolvedDate = resolveRegeneratedDate(log.resolvedDate, calendarConfig);
  log.resolvedDateSubject = log.resolvedDate ? (await validateResolvedDateSubject(worldId, log.resolvedDateSubject) ? log.resolvedDateSubject : null) : null;

  const logLinkResult = await resolveReferencesForEntry(worldId, "logs", log);
  log = logLinkResult.raw;

  await saveLogEntry(worldId, log);
  await afterSave(worldId, "logs", log, logLinkResult.unresolvedGhosts);
  await maybeCreateDateSuggestion(worldId, log, calendarConfig);
  return { id: log.id, name: log.name, logType: log.logType, hasHexTongue: !!log.hexTongue, summary: log.designNotes };
}

// Quest/Campaign Module slot-fill ruleset fix -- createNewEnemy() now
// dispatches on this world's ruleset exactly like
// routes/generateEnemy.js's own POST /generate-enemy handler does,
// instead of unconditionally calling the Echoes-only prompt/writer
// regardless of ruleset. `mode` ("import" | "reflavor" | "homebrew",
// default "homebrew") and `srdLibraryId` mirror that route's request
// shape -- see lib/rulesets/5e/homebrewEnemyGenerator.js for the three
// tiers this dispatches into.
async function createNewEnemy(worldId, { name, faction, tier, campaignContext, mode, srdLibraryId } = {}) {
  const ruleset = await getRuleset(worldId);

  if (ruleset === "5e") {
    return await createNewEnemy5e(worldId, { name, faction, campaignContext, mode: mode || "homebrew", srdLibraryId });
  }
  if (ruleset === "generic") {
    return await createNewEnemyGeneric(worldId, { name, faction, campaignContext });
  }
  return await createNewEnemyEchoes(worldId, { name, faction, tier, campaignContext });
}

async function createNewEnemyEchoes(worldId, { name, faction, tier, campaignContext } = {}) {
  const rosterContext = await buildEnemyRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "enemies", faction });
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));

  const contentSystemPrompt = buildEnemyContentSystemPrompt({ settingContext, loreContext, factionOptionsText, statLabelsText, rosterContext, name, faction, tier, existingContent: null, campaignContext });
  let enemy = await callClaudeExpectingJson({ systemPrompt: contentSystemPrompt, userMessage: "Generate the enemy now.", maxTokens: 3000 });
  enemy.id = enemy.id || slugifyEnemy(enemy.name);
  if (faction) enemy.faction = faction;

  const warning = attributeBudgetWarning(enemy.attributes, enemy.tier);
  if (warning) console.warn("Attribute budget check (campaign slot-fill enemy):", warning);

  const enemyLinkResult = await resolveReferencesForEntry(worldId, "enemies", enemy);
  enemy = enemyLinkResult.raw;

  await saveEnemyEntry(worldId, enemy, null);
  await afterSave(worldId, "enemies", enemy, enemyLinkResult.unresolvedGhosts);
  return { id: enemy.id, name: enemy.name, tier: enemy.tier, faction: enemy.faction, summary: enemy.designNotes, attributeBudgetWarning: warning };
}

async function createNewEnemy5e(worldId, { name, faction, campaignContext, mode, srdLibraryId } = {}) {
  let enemy;

  if (mode === "import") {
    if (!srdLibraryId) throw new Error("Import mode requires srdLibraryId.");
    const srdRow = await getSrdEntry(srdLibraryId);
    if (!srdRow) throw new Error(`No SRD library entry found with id '${srdLibraryId}'.`);
    const alreadyImportedAs = await isAlreadyImported(worldId, srdLibraryId);
    if (alreadyImportedAs) throw new Error(`This SRD monster was already imported into this world as '${alreadyImportedAs}'.`);

    enemy = import5eEnemy(srdRow, { faction });
    const linkResult = await resolveReferencesForEntry(worldId, "enemies", enemy);
    enemy = linkResult.raw;
    await save5eEnemyEntry(worldId, enemy, null);
    await recordImport(worldId, srdLibraryId, enemy.id);
    await afterSave(worldId, "enemies", enemy, linkResult.unresolvedGhosts);
    return { id: enemy.id, name: enemy.name, faction: enemy.faction, summary: `Imported from 5e SRD (${srdRow.source_edition}).` };
  }

  if (mode === "reflavor") {
    if (!srdLibraryId) throw new Error("Reflavor mode requires srdLibraryId.");
    const srdRow = await getSrdEntry(srdLibraryId);
    if (!srdRow) throw new Error(`No SRD library entry found with id '${srdLibraryId}'.`);
    enemy = await reflavor5eEnemy(worldId, srdRow, { faction, campaignContext });
  } else {
    enemy = await generateHomebrew5eEnemy(worldId, { name, faction, campaignContext });
  }

  const linkResult = await resolveReferencesForEntry(worldId, "enemies", enemy);
  enemy = linkResult.raw;
  await save5eEnemyEntry(worldId, enemy, null);
  await afterSave(worldId, "enemies", enemy, linkResult.unresolvedGhosts);
  return { id: enemy.id, name: enemy.name, faction: enemy.faction, summary: enemy.designNotes };
}

async function createNewEnemyGeneric(worldId, { name, faction, campaignContext } = {}) {
  const genericSystem = await getGenericSystem(worldId);
  if (!genericSystem || !Array.isArray(genericSystem.attributes) || !genericSystem.attributes.length) {
    throw new Error("This world hasn't configured its homebrew attribute system yet -- finish that setup before generating a monster.");
  }

  let enemy = await generateHomebrewGenericEnemy(worldId, genericSystem, { name, faction, campaignContext });
  const linkResult = await resolveReferencesForEntry(worldId, "enemies", enemy);
  enemy = linkResult.raw;
  await saveGenericEnemyEntry(worldId, enemy, genericSystem, null);
  await afterSave(worldId, "enemies", enemy, linkResult.unresolvedGhosts);
  return { id: enemy.id, name: enemy.name, faction: enemy.faction, summary: enemy.designNotes };
}

module.exports = { createNewNpc, createNewLocation, createNewItem, createNewLog, createNewEnemy };
