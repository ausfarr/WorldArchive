// lib/rulesets/5e/homebrewItemGenerator.js
//
// Shared 5e Item generation across all three tiers, extracted out of
// routes/generateItem.js so lib/campaignEntryGenerators.js's
// createNewItem() (Quest/Campaign Module slot-fill) can dispatch through
// the exact same three tiers routes/generateItem.js's
// handle5eItemGenerate() already offers, instead of only ever calling
// the Echoes-only prompt -- see
// session_addendum_quest_slot_fill_ruleset_and_background_equipment.md.
// Mirrors lib/rulesets/5e/homebrewEnemyGenerator.js's shape and header
// comment: none of the three functions here save an entry, fetch/
// validate the srd_library row (import5eItem/reflavor5eItem take an
// already-fetched row), record an SRD import, or build HTML -- callers
// decide that.

const { callClaudeExpectingJson } = require("../../claude");
const { getLoreContext } = require("../../loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../../worldFlavor");
const { listEntries } = require("../../entriesRepo");
const { lookupWeapon, lookupArmor, rarityValueWarning } = require("./itemFormulas");
const { buildHomebrewItemSystemPrompt, buildReflavorItemSystemPrompt } = require("../../../prompts/rulesets/5e/itemContentPrompt");
const { mapSrdItemMechanics } = require("./srdItemMapper");
const { slugify } = require("./itemTemplate");

function resolveItemStats(item) {
  if (item.itemType === "weapon" && item.baseItem) {
    const base = lookupWeapon(item.baseItem);
    if (base) return { ...base };
  }
  if (item.itemType === "armor" && item.baseItem) {
    const base = lookupArmor(item.baseItem);
    if (base) return { ...base };
  }
  return null;
}

async function generateHomebrew5eItem(worldId, { name, rarity, itemType, campaignContext, rosterOverride } = {}) {
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "items" });

  let rosterContext = rosterOverride;
  if (!rosterContext) {
    const rosterEntries = await listEntries(worldId, "items", { locked: false });
    rosterContext = rosterEntries.length
      ? rosterEntries.map((e) => `- ${e.id} | ${e.name}`).join("\n")
      : "No items archived yet -- any concept is available.";
  }

  const systemPrompt = buildHomebrewItemSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, rarity, itemType, campaignContext });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the item now.", maxTokens: 1500 });

  return {
    ...proposed,
    id: slugify(proposed.name),
    resolvedStats: resolveItemStats(proposed),
    rarityValueWarning: rarityValueWarning(proposed.rarity, proposed.valueGp),
    sourceMode: "homebrew"
  };
}

// ---- Import: zero AI cost, direct copy from srd_library. Takes the
// already-fetched srd_library row rather than an id -- fetching + the
// missing-row 404 is the caller's job, same contract as
// lib/rulesets/5e/homebrewEnemyGenerator.js's import5eEnemy (see its own
// comment for why).
function import5eItem(srdRow, { fillExistingId } = {}) {
  // R6 Phase 4: rarity/requiresAttunement/attunementRequirement below are
  // the DEFAULT for mundane equipment (srd_library's 'items' category) --
  // for a real Magic Item ('magic-items' category), mechanics (spread
  // last) overrides them with the item's real rarity/attunement.
  const mechanics = mapSrdItemMechanics(srdRow.data_json);
  return {
    id: fillExistingId || slugify(srdRow.name),
    name: srdRow.name,
    rarity: null,
    requiresAttunement: false,
    attunementRequirement: null,
    baseItem: null,
    magicBonus: null,
    magicalProperties: [],
    flavor: null,
    designNotes: null,
    sourceMode: "import",
    srdSourceId: srdRow.srd_id,
    srdSourceCategory: srdRow.category,
    srdLicenseNote: srdRow.license_note,
    ...mechanics
  };
}

// ---- Reflavor: AI rewrites description only, mechanics untouched. Same
// already-fetched srdRow contract as import5eItem above.
async function reflavor5eItem(worldId, srdRow, { fillExistingId, campaignContext } = {}) {
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "items" });

  const systemPrompt = buildReflavorItemSystemPrompt({ settingContext, loreContext, factionOptionsText, sourceItem: srdRow.data_json, campaignContext });
  const reflavored = await callClaudeExpectingJson({ systemPrompt, userMessage: "Reflavor the item now.", maxTokens: 1200 });

  const mechanics = mapSrdItemMechanics(srdRow.data_json);
  const item = {
    id: fillExistingId || slugify(reflavored.name),
    name: reflavored.name,
    rarity: null,
    requiresAttunement: false,
    attunementRequirement: null,
    baseItem: null,
    magicBonus: null,
    magicalProperties: [],
    flavor: reflavored.flavor,
    designNotes: reflavored.designNotes,
    sourceMode: "reflavor",
    srdSourceId: srdRow.srd_id,
    srdSourceCategory: srdRow.category,
    srdLicenseNote: srdRow.license_note,
    ...mechanics,
    // Model's rewritten description overrides the mapper's raw-source
    // description text -- the mapper's mechanics above are NOT touched.
    description: reflavored.description || mechanics.description
  };
  return item;
}

module.exports = { generateHomebrew5eItem, import5eItem, reflavor5eItem, resolveItemStats };
