// lib/rulesets/pf2e/homebrewEnemyGenerator.js
//
// Extracted from routes/generateEnemy.js's pf2e Homebrew branch so both
// Bestiary AND the NPC "Combatant" upgrade (routes/npcCombatant.js) can
// call the exact same pipeline -- "reuse it, don't fork it," the same
// reasoning Phase 7 used for lib/rulesets/5e/homebrewEnemyGenerator.js.
//
// Returns a full pf2e enemy object with id/name already set from the
// model's proposed name -- a caller that wants a different id (a
// fillExistingId regenerate, or an NPC's embedded combatProfile which
// doesn't need an id/name at all) overwrites/deletes those fields
// afterward, same contract as the 5e version.
const { callClaudeExpectingJson } = require("../../claude");
const { getLoreContext } = require("../../loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../../worldFlavor");
const { listEntries } = require("../../entriesRepo");
const { buildCreatureBudget, ROLE_TEMPLATES } = require("./statFormulas");
const { buildHomebrewPf2eEnemySystemPrompt } = require("../../../prompts/rulesets/pf2e/enemyContentPrompt");
const { slugify } = require("./enemyTemplate");

async function generateHomebrewPf2eEnemy(worldId, { name, faction, level, role, campaignContext } = {}) {
  const targetLevel = level != null ? level : 1;
  const targetRole = role || null;
  const roleTemplate = (targetRole && ROLE_TEMPLATES[targetRole]) || {};
  const budget = buildCreatureBudget(targetLevel, roleTemplate);

  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "enemies", faction });
  const rosterEntries = await listEntries(worldId, "enemies", { locked: false });
  const rosterContext = rosterEntries.length
    ? rosterEntries.map((e) => `- ${e.id} | ${e.name}: Level ${(e.level != null ? e.level : "?")}`).join("\n")
    : "No enemies archived yet -- any concept is available.";

  const systemPrompt = buildHomebrewPf2eEnemySystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, faction, level: targetLevel, role: targetRole, budget, campaignContext });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the creature now.", maxTokens: 2000 });

  // Strike "bonus" is code-authoritative (from the pre-computed budget),
  // never model-proposed -- same "model writes narrative, code writes
  // math" split as every other ruleset here.
  const attachBonus = (strikes) => (strikes || []).map((s) => ({ ...s, bonus: budget.strikeBonus, description: s.damageDescription || s.description }));

  return {
    ...proposed,
    id: slugify(proposed.name),
    ruleset: "pf2e", // lib/entryTemplate.js's combatProfileBlock() reads this when this result is used as an NPC's embedded Combatant profile, to pick the right renderer.
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
}

module.exports = { generateHomebrewPf2eEnemy };
