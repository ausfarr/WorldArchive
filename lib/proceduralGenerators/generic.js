// lib/proceduralGenerators/generic.js
//
// Ruleset Recovery, Phase R3 -- procedural (non-AI) generation for a
// Generic (fully custom homebrew) world. Mirrors
// lib/rulesets/generic/homebrewEnemyGenerator.js's own pattern: there's
// no official system to hardcode, so this file plays the same role the
// model plays in Homebrew tier (proposing attribute values within this
// world's own defined attribute list) while
// lib/rulesets/generic/statFormulas.js's computeDerivedStats() remains
// the ONLY thing that ever computes a derived number -- never invented
// here, never invented by a table row.
//
// Every generator takes `genericSystem` as an explicit parameter (not
// fetched internally), matching lib/rulesets/generic/homebrewEnemyGenerator.js's
// own documented reasoning: callers already need it themselves first (to
// give a clear 400 if a world hasn't configured its attribute system
// yet), so fetching it twice would be wasted work.

const enemiesTable = require("../../data/proceduralTables/generic/enemies.json");
const classesTable = require("../../data/proceduralTables/generic/classes.json");
const itemsTable = require("../../data/proceduralTables/generic/items.json");
const survivorsTable = require("../../data/proceduralTables/generic/survivors.json");

const { weightedPick, weightedValue, weightedPickN, fillTemplate, uniqueId, pickFaction } = require("./shared");
const { listEntries } = require("../entriesRepo");
const { computeDerivedStats } = require("../rulesets/generic/statFormulas");

// Rolls a value for each of this world's own defined attributes, in the
// 1-20 range the AI Homebrew prompts already suggest as a typical
// default (prompts/rulesets/generic/enemyContentPrompt.js's own
// instruction text) -- never invents an attribute key beyond what
// genericSystem.attributes actually lists.
function rollAttributes(genericSystem) {
  const attrs = {};
  const defs = (genericSystem && genericSystem.attributes) || [];
  defs.forEach((def) => {
    attrs[def.key] = 6 + Math.floor(Math.random() * 10); // 6-15, a plausible mid-range spread
  });
  return attrs;
}

function pickAttributeKey(genericSystem) {
  const defs = (genericSystem && genericSystem.attributes) || [];
  if (!defs.length) return null;
  return defs[Math.floor(Math.random() * defs.length)].key;
}

// ============================================================
// Enemies
// ============================================================

async function generateGenericEnemyProcedurally(worldId, genericSystem, opts = {}) {
  const useFormula = !!(genericSystem && genericSystem.useFormula);
  const name = opts.name || `${weightedValue(enemiesTable.nameEpithets)} ${weightedValue(enemiesTable.nameNouns)}`;
  const attributes = rollAttributes(genericSystem);
  const faction = await pickFaction(worldId);

  const traitCount = 1 + Math.floor(Math.random() * 2);
  const traits = weightedPickN(enemiesTable.traitsPool, traitCount).map((t) => t.value);
  const actionCount = 1 + Math.floor(Math.random() * 2);
  const actions = weightedPickN(enemiesTable.actionsPool, actionCount).map((a) => a.value);

  const enemy = {
    name,
    attributes,
    derivedStats: useFormula ? computeDerivedStats(genericSystem, attributes) : null,
    flavorStats: useFormula ? undefined : weightedValue(enemiesTable.flavorStatsTemplates),
    traits,
    actions,
    flavor: fillTemplate(weightedValue(enemiesTable.flavorTemplates), { name }),
    designNotes: weightedValue(enemiesTable.designNotes),
    faction: faction.id === "unaligned" ? null : faction.id,
    sourceMode: "homebrew"
  };
  enemy.id = await uniqueId(worldId, "enemies", name);
  return enemy;
}

// ============================================================
// Classes -- narrative-first by design, no leveling/numeric system (see
// lib/rulesets/generic/classTemplate.js's header for why).
// ============================================================

async function generateGenericClassProcedurally(worldId, genericSystem, opts = {}) {
  const archetype = weightedPick(classesTable.archetypes).value;
  const name = opts.name || archetype.name;
  const slots = { name };
  const faction = await pickFaction(worldId);

  const cls = {
    name,
    keyAttribute: pickAttributeKey(genericSystem),
    flavor: fillTemplate(archetype.flavorTemplate, slots),
    description: archetype.descriptionTemplate,
    features: archetype.features,
    designNotes: weightedValue(classesTable.designNotes),
    faction: faction.id === "unaligned" ? null : faction.id,
    sourceMode: "homebrew"
  };
  cls.id = await uniqueId(worldId, "classes", name);
  return cls;
}

// ============================================================
// Items -- narrative-first, optional single attribute-tied bonus (see
// lib/rulesets/generic/itemTemplate.js's header for why there's no
// rarity/pricing system to hang numbers off of).
// ============================================================

async function generateGenericItemProcedurally(worldId, genericSystem, opts = {}) {
  const name = opts.name || weightedValue(itemsTable.names);
  const hasBoost = Math.random() < 0.3; // most items should stay plain, per the Homebrew prompt's own guidance
  const boostsAttribute = hasBoost ? pickAttributeKey(genericSystem) : null;
  const boostAmount = boostsAttribute ? 1 + Math.floor(Math.random() * 2) : null;

  const item = {
    name,
    boostsAttribute,
    boostAmount,
    flavor: fillTemplate(weightedValue(itemsTable.flavorTemplates), { name }),
    description: weightedValue(itemsTable.descriptionTemplates),
    designNotes: weightedValue(itemsTable.designNotes),
    faction: null,
    sourceMode: "homebrew"
  };
  item.id = await uniqueId(worldId, "items", name);
  return item;
}

// ============================================================
// Survivors (Player Characters) -- built on a real Generic Class entry
// from this world's own archive, same "PC is a Class instance" rule
// every ruleset's Phase 8 followed.
// ============================================================

async function generateGenericSurvivorProcedurally(worldId, genericSystem, opts = {}) {
  if (!genericSystem || !Array.isArray(genericSystem.attributes) || !genericSystem.attributes.length) {
    throw new Error("This world hasn't configured its homebrew attribute system yet -- finish that setup before creating a Player Character.");
  }
  const classEntries = await listEntries(worldId, "classes", { locked: false });
  if (!classEntries.length) {
    throw new Error("This world has no Classes yet -- generate or roll at least one Class before creating a Player Character.");
  }
  const chosenClass = classEntries[Math.floor(Math.random() * classEntries.length)];

  const useFormula = !!genericSystem.useFormula;
  const name = opts.name || `${weightedValue(survivorsTable.firstNames)} ${weightedValue(survivorsTable.lastNames)}`;
  const faction = await pickFaction(worldId);
  const attributes = rollAttributes(genericSystem);

  const pc = {
    name,
    classId: chosenClass.id,
    className: chosenClass.name,
    attributes,
    derivedStats: useFormula ? computeDerivedStats(genericSystem, attributes) : null,
    flavorStats: useFormula ? undefined : weightedValue(survivorsTable.flavorStatsTemplates),
    equipment: weightedValue(survivorsTable.equipmentTemplates),
    background: fillTemplate(weightedValue(survivorsTable.backgroundTemplates), { name }),
    backstory: fillTemplate(weightedValue(survivorsTable.backstoryTemplates), { name, className: chosenClass.name }),
    designNotes: weightedValue(survivorsTable.designNotes),
    faction: faction.id === "unaligned" ? null : faction.id,
    sourceMode: "homebrew"
  };
  pc.id = await uniqueId(worldId, "survivors", name);
  return pc;
}

const GENERATORS_GENERIC = {
  enemies: generateGenericEnemyProcedurally,
  classes: generateGenericClassProcedurally,
  items: generateGenericItemProcedurally,
  survivors: generateGenericSurvivorProcedurally
};

module.exports = {
  GENERATORS_GENERIC,
  generateGenericEnemyProcedurally,
  generateGenericClassProcedurally,
  generateGenericItemProcedurally,
  generateGenericSurvivorProcedurally
};
