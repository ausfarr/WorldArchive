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

  const contentSystemPrompt = buildNpcContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, role, faction, existingContent: null, campaignContext });
  const npc = await callClaudeExpectingJson({ systemPrompt: contentSystemPrompt, userMessage: "Generate the NPC now.", maxTokens: 3000 });
  npc.id = npc.id || slugifyNpc(npc.name);
  if (faction) npc.faction = faction;

  await saveNpcEntry(worldId, npc, null);
  return { id: npc.id, name: npc.name, roleArchetype: npc.roleArchetype, faction: npc.faction, summary: npc.designNotes };
}

async function createNewLocation(worldId, { name, regionBiome, faction, campaignContext } = {}) {
  const rosterContext = await buildLocationRosterContext(worldId);
  const npcRosterText = await buildRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "locations", faction });
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

  const contentSystemPrompt = buildLocationContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, npcRosterText, name, regionBiome, faction, existingContent: null, campaignContext });
  const location = await callClaudeExpectingJson({ systemPrompt: contentSystemPrompt, userMessage: "Generate the Location now.", maxTokens: 2500 });
  location.id = location.id || slugifyLocation(location.name);
  if (faction) location.faction = faction;

  await saveLocationEntry(worldId, location, null);
  return { id: location.id, name: location.name, regionBiome: location.regionBiome, faction: location.faction, summary: location.designNotes };
}

const RARITY_WORDS = ["Common", "Uncommon", "Rare", "Legendary"];

async function createNewItem(worldId, { name, category, rarity, campaignContext } = {}) {
  const rosterContext = await buildItemRosterContext(worldId);
  const locationRosterText = await buildLocationRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "items" });
  const settingContext = await getSettingContext(worldId);
  const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));
  const skillSystem = await getSkillSystem(worldId);
  const weaponSkillsText = formatWeaponSkillsForPrompt(skillSystem);

  const contentSystemPrompt = buildItemContentSystemPrompt({ settingContext, loreContext, statLabelsText, weaponSkillsText, rosterContext, locationRosterText, name, category, rarity, existingContent: null, campaignContext });
  const item = await callClaudeExpectingJson({ systemPrompt: contentSystemPrompt, userMessage: "Generate the item now.", maxTokens: 2000 });
  item.id = item.id || slugifyItem(item.name);

  if (item.category === "Weapon" && item.weaponSkill && item.damageMin != null && item.damageMax != null) {
    const clamped = clampDamageRange(item.weaponSkill, item.damageMin, item.damageMax);
    item.damageMin = clamped.min;
    item.damageMax = clamped.max;
  }
  if (item.category === "Weapon" && item.weaponSkill) {
    item.weaponSkillLabel = resolveWeaponSkillLabel(skillSystem, item.weaponSkill);
  }

  await saveItemEntry(worldId, item, null);
  return { id: item.id, name: item.name, category: item.category, rarity: item.rarity, summary: item.designNotes };
}

async function createNewLog(worldId, { name, logType, campaignContext } = {}) {
  const rosterContext = await buildLogRosterContext(worldId);
  const locationRosterText = await buildLocationRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "logs" });
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

  const contentSystemPrompt = buildLogContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, locationRosterText, name, logType, existingContent: null, campaignContext });
  const log = await callClaudeExpectingJson({ systemPrompt: contentSystemPrompt, userMessage: "Generate the log now.", maxTokens: 1500 });
  log.id = log.id || slugifyLog(log.name);

  await saveLogEntry(worldId, log);
  return { id: log.id, name: log.name, logType: log.logType, hasHexTongue: !!log.hexTongue, summary: log.designNotes };
}

async function createNewEnemy(worldId, { name, faction, tier, campaignContext } = {}) {
  const rosterContext = await buildEnemyRosterContext(worldId);
  const loreContext = await getLoreContext(worldId, { category: "enemies", faction });
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const statLabelsText = formatStatLabelsForPrompt(await getStatLabels(worldId));

  const contentSystemPrompt = buildEnemyContentSystemPrompt({ settingContext, loreContext, factionOptionsText, statLabelsText, rosterContext, name, faction, tier, existingContent: null, campaignContext });
  const enemy = await callClaudeExpectingJson({ systemPrompt: contentSystemPrompt, userMessage: "Generate the enemy now.", maxTokens: 3000 });
  enemy.id = enemy.id || slugifyEnemy(enemy.name);
  if (faction) enemy.faction = faction;

  const warning = attributeBudgetWarning(enemy.attributes, enemy.tier);
  if (warning) console.warn("Attribute budget check (campaign slot-fill enemy):", warning);

  await saveEnemyEntry(worldId, enemy, null);
  return { id: enemy.id, name: enemy.name, tier: enemy.tier, faction: enemy.faction, summary: enemy.designNotes, attributeBudgetWarning: warning };
}

module.exports = { createNewNpc, createNewLocation, createNewItem, createNewLog, createNewEnemy };
