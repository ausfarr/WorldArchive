// lib/rulesets/5e/homebrewEnemyGenerator.js
//
// Shared 5e monster generation across all three tiers, extracted out of
// routes/generateEnemy.js so any caller that needs the ruleset-aware
// pipeline can reuse it instead of forking it -- the project spec's own
// instruction: "invoking the Phase 3 monster-generation pipeline (reuse
// it, don't fork it)". generateHomebrew5eEnemy() was extracted first
// (Phase 7, for NPCs' "Combatant" upgrade); import5eEnemy()/
// reflavor5eEnemy() were added alongside it (Quest/Campaign Module
// slot-fill ruleset fix -- see
// session_addendum_quest_slot_fill_ruleset_and_background_equipment.md)
// so lib/campaignEntryGenerators.js's createNewEnemy() can dispatch
// through the exact same three tiers routes/generateEnemy.js's
// handle5eEnemyGenerate() already offers, instead of only ever calling
// the Echoes-only prompt. None of the three functions here save an
// entry, fetch/validate the srd_library row (import5eEnemy/
// reflavor5eEnemy take an already-fetched row -- see their own comments
// for why), record an SRD import, or build HTML -- callers decide what
// to do with the returned object (routes/generateEnemy.js saves it as a
// new `enemies` entry and, for Import, records the import;
// routes/generate.js's Combatant upgrade attaches Homebrew's result to
// an existing NPC's own `combatProfile` field instead).

const { callClaudeExpectingJson } = require("../../claude");
const { getLoreContext } = require("../../loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt } = require("../../worldFlavor");
const { listEntries } = require("../../entriesRepo");
const { computeChallengeRating, averageDamageFromDice, XP_BY_CR } = require("./statFormulas");
const { buildHomebrewEnemySystemPrompt, buildReflavorEnemySystemPrompt } = require("../../../prompts/rulesets/5e/enemyContentPrompt");
const { mapSrdMonsterMechanics } = require("./srdMonsterMapper");
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

// ---- Import: zero AI cost, direct copy from srd_library. Takes the
// already-fetched srd_library row rather than an id -- fetching + the
// missing-row 404 is the caller's job (routes/generateEnemy.js and
// lib/campaignEntryGenerators.js both already need the row themselves
// for dedup checks / recordImport() / the "Imported from..." message,
// so resolving it twice would be wasted work, not extra safety).
function import5eEnemy(srdRow, { faction, fillExistingId } = {}) {
  const mechanics = mapSrdMonsterMechanics(srdRow.data_json);
  mechanics.challengeRating.xp = XP_BY_CR[mechanics.challengeRating.cr] || null;
  return {
    id: fillExistingId || slugify(srdRow.name),
    name: srdRow.name,
    faction: faction || null,
    flavor: null,
    designNotes: null,
    sourceMode: "import",
    srdSourceId: srdRow.srd_id,
    srdLicenseNote: srdRow.license_note,
    ...mechanics
  };
}

// ---- Reflavor: AI rewrites narrative only, mechanics untouched (see
// the comment inline below on `traits`/`actions`). Same already-fetched
// srdRow contract as import5eEnemy above.
async function reflavor5eEnemy(worldId, srdRow, { faction, fillExistingId, campaignContext } = {}) {
  const settingContext = await getSettingContext(worldId);
  const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
  const loreContext = await getLoreContext(worldId, { category: "enemies", faction });

  const systemPrompt = buildReflavorEnemySystemPrompt({ settingContext, loreContext, factionOptionsText, sourceMonster: srdRow.data_json, faction, campaignContext });
  const reflavored = await callClaudeExpectingJson({ systemPrompt, userMessage: "Reflavor the monster now.", maxTokens: 2000 });

  const mechanics = mapSrdMonsterMechanics(srdRow.data_json);
  mechanics.challengeRating.xp = XP_BY_CR[mechanics.challengeRating.cr] || null;
  const enemy = {
    id: fillExistingId || slugify(reflavored.name),
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
  return enemy;
}

module.exports = { generateHomebrew5eEnemy, import5eEnemy, reflavor5eEnemy, extractOffenseForCr, looksLikeBroadResistanceOrImmunity };
