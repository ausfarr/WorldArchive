// lib/rulesets/generic/homebrewItemGenerator.js
//
// Extracted from routes/generateItem.js's Generic Homebrew branch so
// both Items AND lib/campaignEntryGenerators.js's createNewItem() (Quest/
// Campaign Module slot-fill) can call the exact same pipeline -- same
// "reuse it, don't fork it" pattern as
// lib/rulesets/generic/homebrewEnemyGenerator.js. Generic has no
// Import/Reflavor tier anywhere else in this codebase, so this file only
// has the one function, unlike its 5e counterpart.
//
// genericSystem is a required parameter (not fetched internally) since
// every caller already needs it themselves first, to give a clear 400
// if this world hasn't configured its attribute system yet.

const { callClaudeExpectingJson } = require("../../claude");
const { getLoreContext } = require("../../loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../../worldFlavor");
const { listEntries } = require("../../entriesRepo");
const { buildHomebrewItemSystemPrompt } = require("../../../prompts/rulesets/generic/itemContentPrompt");
const { slugify } = require("./itemTemplate");

async function generateHomebrewGenericItem(worldId, genericSystem, { name, faction, campaignContext } = {}) {
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "items" });
  const rosterEntries = await listEntries(worldId, "items", { locked: false });
  const rosterContext = rosterEntries.length
    ? rosterEntries.map((e) => `- ${e.id} | ${e.name}`).join("\n")
    : "No items archived yet -- any concept is available.";

  const systemPrompt = buildHomebrewItemSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, genericSystem, campaignContext });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the item now.", maxTokens: 1500 });

  const validAttributeKeys = new Set(genericSystem.attributes.map((a) => a.key));
  const boostsAttribute = validAttributeKeys.has(proposed.boostsAttribute) ? proposed.boostsAttribute : null;
  return {
    ...proposed,
    id: slugify(proposed.name),
    faction: faction || null,
    boostsAttribute,
    boostAmount: boostsAttribute ? (Number(proposed.boostAmount) || 0) : null,
    sourceMode: "homebrew"
  };
}

module.exports = { generateHomebrewGenericItem };
