// lib/rulesets/5e/homebrewEnemyGenerator.js
//
// Shared Homebrew-tier 5e monster generation, extracted out of
// routes/generateEnemy.js so Phase 7 (NPCs' "Combatant" upgrade) can
// reuse the exact same pipeline instead of forking it -- the project
// spec's own instruction: "invoking the Phase 3 monster-generation
// pipeline (reuse it, don't fork it)". Returns the assembled enemy
// object; does NOT save an entry or build HTML -- callers decide what
// to do with the result (routes/generateEnemy.js saves it as a new
// `enemies` entry; routes/generate.js's Combatant upgrade attaches it to
// an existing NPC's own `combatProfile` field instead).

const { callClaudeExpectingJson } = require("../../claude");
const { getLoreContext } = require("../../loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../../worldFlavor");
const { listEntries } = require("../../entriesRepo");
const { computeChallengeRating, averageDamageFromDice, XP_BY_CR } = require("./statFormulas");
const { buildHomebrewEnemySystemPrompt } = require("../../../prompts/rulesets/5e/enemyContentPrompt");
const { slugify } = require("./enemyTemplate");

function extractOffenseForCr(enemy) {
  const actions = Array.isArray(enemy.actions) ? enemy.actions : [];
  let best = { avg: 0, toHit: 0 };
  for (const action of actions) {
    if (!action.damageDice) continue;
    const avg = averageDamageFromDice(action.damageDice);
    if (avg > best.avg) best = { avg, toHit: Number(action.toHit) || 0 };
  }
  return best;
}

function looksLikeBroadResistanceOrImmunity(text) {
  if (!text) return false;
  const items = String(text).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return items.length >= 3 || /\ball\b/i.test(text);
}

async function generateHomebrew5eEnemy(worldId, { name, faction, targetCr, campaignContext, rosterOverride } = {}) {
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "enemies", faction });

  let rosterContext = rosterOverride;
  if (!rosterContext) {
    const rosterEntries = await listEntries(worldId, "enemies", { locked: false });
    rosterContext = rosterEntries.length
      ? rosterEntries.map((e) => `- ${e.id} | ${e.name}: CR ${(e.challengeRating && e.challengeRating.cr) || "?"}`).join("\n")
      : "No enemies archived yet -- any concept is available.";
  }

  const { findNearestCrMonsters } = require("../../srdLibraryRepo");
  const referenceMonsters = await findNearestCrMonsters("5e", targetCr ? parseFloat(targetCr) || null : null, { limit: 2 });

  const systemPrompt = buildHomebrewEnemySystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, faction, targetCr, referenceMonsters, campaignContext });
  const proposed = await callClaudeExpectingJson({ systemPrompt, userMessage: "Design the monster now.", maxTokens: 2500 });

  const offense = extractOffenseForCr(proposed);
  const crResult = computeChallengeRating({
    hp: proposed.hitPoints,
    ac: proposed.armorClass,
    damagePerRound: offense.avg,
    attackBonus: offense.toHit,
    saveDC: 0,
    resistantToCommonDamage: looksLikeBroadResistanceOrImmunity(proposed.damageResistances),
    immuneToCommonDamage: looksLikeBroadResistanceOrImmunity(proposed.damageImmunities)
  });

  delete proposed.targetChallengeRating;
  return {
    ...proposed,
    id: slugify(proposed.name),
    faction: faction || proposed.faction || null,
    sourceMode: "homebrew",
    srdSourceId: null,
    srdLicenseNote: null,
    challengeRating: {
      cr: crResult.cr,
      xp: XP_BY_CR[crResult.cr] || null,
      defensiveCr: crResult.defensiveCr,
      offensiveCr: crResult.offensiveCr,
      estimated: true
    }
  };
}

module.exports = { generateHomebrew5eEnemy, extractOffenseForCr, looksLikeBroadResistanceOrImmunity };
