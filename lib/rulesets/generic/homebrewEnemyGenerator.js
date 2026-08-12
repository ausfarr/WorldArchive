// lib/rulesets/generic/homebrewEnemyGenerator.js
//
// Extracted from routes/generateEnemy.js's Generic Homebrew branch so
// both Bestiary AND the NPC "Combatant" upgrade (routes/npcCombatant.js)
// can call the exact same pipeline -- "reuse it, don't fork it," the
// same reasoning behind the 5e/pf2e versions of this file.
//
// genericSystem is a required parameter (not fetched internally) since
// every caller already needs it themselves first, to give a clear 400
// if this world hasn't configured its attribute system yet -- fetching
// it twice would be wasted work, not extra safety.
const { callClaudeExpectingJson } = require("../../claude");
const { getLoreContext } = require("../../loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../../worldFlavor");
const { listEntries } = require("../../entriesRepo");
const { computeDerivedStats } = require("./statFormulas");
const { buildHomebrewGenericEnemySystemPrompt } = require("../../../prompts/rulesets/generic/enemyContentPrompt");
const { slugify } = require("./enemyTemplate");

async function generateHomebrewGenericEnemy(worldId, genericSystem, { name, faction, campaignContext } = {}) {
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "enemies", faction });
  const rosterEntries = await listEntries(worldId, "enemies", { locked: false });
  const rosterContext = rosterEntries.length
    ? rosterEntries.map((e) => `- ${e.id} | ${e.name}`).join("\n")
    : "No enemies archived yet -- any concept is available.";

  const systemPrompt = buildHomebrewGenericEnemySystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, genericSystem, campaignContext });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the monster now.", maxTokens: 2000 });

  return {
    ...proposed,
    id: slugify(proposed.name),
    faction: faction || null,
    derivedStats: genericSystem.useFormula ? computeDerivedStats(genericSystem, proposed.attributes) : null,
    sourceMode: "homebrew"
  };
}

module.exports = { generateHomebrewGenericEnemy };
