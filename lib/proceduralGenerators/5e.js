// lib/proceduralGenerators/5e.js
//
// Ruleset Recovery, Phase R3 -- procedural (non-AI) generation for a 5e
// world. Mirrors the SHAPE of lib/proceduralGenerators.js (Echoes' own
// procedural generation, untouched by this session -- see
// session_addendum_ruleset_recovery_plan.md) but produces real 5e-shaped
// entries, matching exactly what each category's save5eXEntry() writer
// (lib/rulesets/5e/*Repo.js) and *Template.js already expect -- read
// directly from those files before writing this one, not guessed.
//
// "Model writes narrative, code writes math" applies here even with no
// model in the loop at all: the DATA TABLES below play the role a model
// would in Homebrew tier (proposing raw stats/flavor), and every derived/
// authoritative number (Challenge Rating, hit points, proficiency bonus,
// spell slots, cantrip damage scaling, resolved weapon/armor stats) is
// computed by the SAME real formula modules AI generation already uses
// (lib/rulesets/5e/statFormulas.js, classFormulas.js, itemFormulas.js,
// survivorFormulas.js, spellFormulas.js) -- nothing here invents new 5e
// math, exactly the rule this whole project follows.
//
// No fetch/Claude call anywhere in this file.

const enemiesTable = require("../../data/proceduralTables/5e/enemies.json");
const classesTable = require("../../data/proceduralTables/5e/classes.json");
const itemsTable = require("../../data/proceduralTables/5e/items.json");
const spellsTable = require("../../data/proceduralTables/5e/spells.json");
const survivorsTable = require("../../data/proceduralTables/5e/survivors.json");

const { weightedPick, weightedValue, weightedPickN, fillTemplate, uniqueId, pickFaction } = require("./shared");
const { listEntries } = require("../entriesRepo");

const { CHALLENGE_THRESHOLDS, computeChallengeRating, averageDamageFromDice, XP_BY_CR } = require("../rulesets/5e/statFormulas");
const { PROFICIENCY_BONUS_BY_LEVEL, ABILITY_SCORE_IMPROVEMENT_LEVELS, subclassUnlockLevel, spellSlotsForLevel, proficiencyBonusForLevel } = require("../rulesets/5e/classFormulas");
const { WEAPONS, ARMOR, lookupWeapon, lookupArmor, rarityValueWarning } = require("../rulesets/5e/itemFormulas");
const { cantripDiceCountForLevel } = require("../rulesets/5e/spellFormulas");
const { computeHitPoints } = require("../rulesets/5e/survivorFormulas");
const { slugify: slugify5e } = require("../rulesets/5e/enemyTemplate");

function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}
function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

// ============================================================
// Enemies
// ============================================================

const HIT_DIE_BY_SIZE = { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 20 };

// Given a target average-damage-per-round, picks a dice notation string
// ("2d8+3") that averages close to it, using the die size appropriate for
// this creature's size (bigger creatures hit harder per swing) -- same
// "propose numbers, then verify through the real formula" flow Homebrew
// tier uses, just with a table roll standing in for the model's proposal.
function diceNotationForAverage(targetAvg, dieSize) {
  const dieAvg = (dieSize + 1) / 2;
  const diceCount = Math.max(1, Math.round(targetAvg / dieAvg));
  const modifier = Math.round(targetAvg - diceCount * dieAvg);
  return modifier !== 0 ? `${diceCount}d${dieSize}${modifier > 0 ? `+${modifier}` : modifier}` : `${diceCount}d${dieSize}`;
}

async function generate5eEnemyProcedurally(worldId, opts = {}) {
  const crToken = weightedValue(enemiesTable.crWeights);
  const thresholdRow = CHALLENGE_THRESHOLDS.find((r) => r.cr === crToken) || CHALLENGE_THRESHOLDS[2];
  const sta = weightedValue(enemiesTable.sizeTypeAlignment);
  const abilityRow = weightedPick(enemiesTable.abilityScorePatterns);
  const archetype = abilityRow.archetype;
  const abilities = abilityRow.value;

  const targetHp = Math.round((thresholdRow.hpLow + thresholdRow.hpHigh) / 2);
  const targetDpr = Math.round((thresholdRow.dprLow + thresholdRow.dprHigh) / 2);
  const ac = thresholdRow.ac;
  const attackBonus = thresholdRow.atk;

  const dieSize = HIT_DIE_BY_SIZE[sta.size] || 8;
  const damageDice = diceNotationForAverage(targetDpr, dieSize);

  const damageTypePool = enemiesTable.damageTypesByArchetype[archetype] || ["bludgeoning"];
  const damageType = damageTypePool[Math.floor(Math.random() * damageTypePool.length)];
  const attackVerbPool = enemiesTable.attackVerbsByArchetype[archetype] || ["Strike"];
  const attackName = attackVerbPool[Math.floor(Math.random() * attackVerbPool.length)];

  // The single authoritative step: code computes the real CR from the
  // proposed hp/ac/damage/attack-bonus, exactly the way
  // homebrewEnemyGenerator.js does for an AI-proposed monster -- never
  // trusting the rolled crToken directly as the stored value.
  const crResult = computeChallengeRating({
    hp: targetHp,
    ac,
    damagePerRound: averageDamageFromDice(damageDice),
    attackBonus,
    saveDC: 0
  });

  const name = `${weightedValue(enemiesTable.nameEpithets)} ${weightedValue(enemiesTable.nameNouns)}`;
  const faction = await pickFaction(worldId);

  const conMod = abilityModifier(abilities.con);
  const dieAvg = (dieSize + 1) / 2;
  const hitDiceCount = Math.max(1, Math.round(targetHp / Math.max(1, dieAvg + conMod)));
  const hitDiceConBonus = conMod * hitDiceCount;
  const hitDice = `${hitDiceCount}d${dieSize}${hitDiceConBonus !== 0 ? (hitDiceConBonus > 0 ? `+${hitDiceConBonus}` : hitDiceConBonus) : ""}`;

  const eligibleTraits = enemiesTable.traitsPool.filter((t) => t.archetypes.includes(archetype));
  const traitCount = 1 + Math.floor(Math.random() * 2);
  const traitRows = weightedPickN(eligibleTraits.length ? eligibleTraits : enemiesTable.traitsPool, traitCount);

  const enemy = {
    name,
    size: sta.size,
    type: sta.type,
    alignment: sta.alignment,
    armorClass: ac,
    armorNote: null,
    hitPoints: targetHp,
    hitDice,
    speed: "30 ft.",
    abilities,
    savingThrows: [],
    skills: [],
    damageVulnerabilities: null,
    damageResistances: null,
    damageImmunities: null,
    conditionImmunities: null,
    senses: `passive Perception ${10 + abilityModifier(abilities.wis)}`,
    languages: "—",
    challengeRating: {
      cr: crResult.cr,
      xp: XP_BY_CR[crResult.cr] || null,
      defensiveCr: crResult.defensiveCr,
      offensiveCr: crResult.offensiveCr,
      estimated: true
    },
    traits: traitRows.map((t) => t.value),
    actions: [
      {
        name: attackName,
        description: `Melee Weapon Attack: ${formatModifier(attackBonus)} to hit, reach 5 ft., one target. Hit: ${Math.round(averageDamageFromDice(damageDice))} (${damageDice}) ${damageType} damage.`,
        toHit: attackBonus,
        damageDice
      }
    ],
    legendaryActions: [],
    flavor: fillTemplate(weightedValue(enemiesTable.flavorTemplates), { name }),
    designNotes: weightedValue(enemiesTable.designNotes),
    faction: faction.id === "unaligned" ? null : faction.id,
    sourceMode: "homebrew",
    srdSourceId: null,
    srdLicenseNote: null
  };
  enemy.id = opts.name ? slugify5e(opts.name) : await uniqueId(worldId, "enemies", name);
  if (opts.name) enemy.name = opts.name;
  return enemy;
}

// ============================================================
// Classes
// ============================================================

// Milestone levels for rolled features -- deliberately avoids the 5
// Ability Score Improvement levels (4/8/12/16/19, inserted automatically
// by classTemplate.js) and stays within the "6-10 meaningful levels"
// range prompts/rulesets/5e/classContentPrompt.js asks a model for.
const FEATURE_LEVELS = [1, 3, 6, 10, 14, 18];
const SUBCLASS_FEATURE_LEVELS = [3, 6, 10];

async function generate5eClassProcedurally(worldId, opts = {}) {
  const archetype = weightedPick(classesTable.archetypes).value;
  const name = opts.name || archetype.name;
  const slots = { name };

  const features = FEATURE_LEVELS.map((level, i) => ({
    level,
    name: fillTemplate(archetype.features[i % archetype.features.length].name, slots),
    description: fillTemplate(archetype.features[i % archetype.features.length].description, slots)
  }));

  const subclasses = archetype.subclasses.map((sc) => ({
    name: sc.name,
    flavor: fillTemplate(sc.flavor, slots),
    features: SUBCLASS_FEATURE_LEVELS.map((level, i) => ({
      level,
      name: sc.features[i % sc.features.length].name,
      description: sc.features[i % sc.features.length].description
    }))
  }));

  const nameLower = name.toLowerCase();
  const matchedCoreClass = ["cleric", "sorcerer", "warlock", "druid", "wizard", "barbarian", "bard", "fighter", "monk", "paladin", "ranger", "rogue"].find((c) => nameLower.includes(c));
  const unlockLevel = subclassUnlockLevel(matchedCoreClass || "");

  const faction = await pickFaction(worldId);
  const cls = {
    name,
    hitDie: archetype.hitDie,
    primaryAbility: archetype.primaryAbility,
    savingThrowProficiencies: archetype.savingThrowProficiencies,
    casterType: archetype.casterType,
    spellcastingAbility: archetype.spellcastingAbility,
    features,
    subclassName: archetype.subclassName,
    subclassUnlockLevel: unlockLevel,
    subclasses,
    flavor: fillTemplate(archetype.flavor, slots),
    designNotes: weightedValue(classesTable.designNotes),
    faction: faction.id === "unaligned" ? null : faction.id,
    sourceMode: "homebrew"
  };
  cls.id = await uniqueId(worldId, "classes", name);
  return cls;
}

// ============================================================
// Items
// ============================================================

const RARITY_WEIGHTS = [
  { value: "Common", weight: 5 },
  { value: "Uncommon", weight: 4 },
  { value: "Rare", weight: 2 },
  { value: "Very Rare", weight: 1 }
];
const MAGIC_BONUS_BY_RARITY = { Common: null, Uncommon: 1, Rare: 2, "Very Rare": 3, Legendary: 3 };
const VALUE_MIDPOINT_BY_RARITY = { Common: 75, Uncommon: 300, Rare: 2500, "Very Rare": 25000, Legendary: 100000 };

async function generate5eItemProcedurally(worldId, opts = {}) {
  const itemType = weightedValue(itemsTable.itemTypeWeights);
  const isMundane = Math.random() < 0.35; // roughly a third of rolls are ordinary, non-magical gear
  const rarity = isMundane ? null : weightedValue(RARITY_WEIGHTS);

  let baseItem = null;
  let resolvedStats = null;
  let name;
  let magicBonus = null;

  if (itemType === "weapon") {
    const row = weightedPick(itemsTable.weaponFlavors).value;
    baseItem = row.baseItem;
    resolvedStats = lookupWeapon(baseItem);
    magicBonus = rarity ? MAGIC_BONUS_BY_RARITY[rarity] : null;
    name = magicBonus ? `${row.flavorName} +${magicBonus}` : row.flavorName;
  } else if (itemType === "armor") {
    const row = weightedPick(itemsTable.armorFlavors).value;
    baseItem = row.baseItem;
    resolvedStats = lookupArmor(baseItem);
    magicBonus = rarity ? MAGIC_BONUS_BY_RARITY[rarity] : null;
    name = magicBonus ? `${row.flavorName} +${magicBonus}` : row.flavorName;
  } else {
    const row = weightedPick(itemsTable.wondrousItems).value;
    name = row.name;
  }

  const magicalProperties = rarity ? weightedPickN(itemsTable.magicalPropertiesByRarity[rarity] || itemsTable.magicalPropertiesByRarity.Uncommon, 1 + Math.floor(Math.random() * 2)).map((r) => r.value) : [];
  const valueGp = rarity ? Math.round(VALUE_MIDPOINT_BY_RARITY[rarity] * (0.7 + Math.random() * 0.6)) : Math.round(5 + Math.random() * 45);

  const item = {
    name,
    itemType,
    rarity,
    requiresAttunement: rarity === "Rare" || rarity === "Very Rare" || rarity === "Legendary",
    attunementRequirement: null,
    baseItem,
    magicBonus,
    description: fillTemplate(weightedValue(itemsTable.descriptionTemplates), { name }),
    magicalProperties,
    valueGp,
    weightLb: resolvedStats && resolvedStats.weightLb != null ? resolvedStats.weightLb : Math.round(1 + Math.random() * 5),
    flavor: fillTemplate(weightedValue(itemsTable.flavorTemplates), { name }),
    designNotes: weightedValue(itemsTable.designNotes),
    faction: null,
    sourceMode: "homebrew",
    resolvedStats,
    rarityValueWarning: rarityValueWarning(rarity, valueGp)
  };
  item.id = await uniqueId(worldId, "items", name);
  return item;
}

// ============================================================
// Spells
// ============================================================

async function generate5eSpellProcedurally(worldId, opts = {}) {
  const row = weightedPick(spellsTable.spellSeeds);
  const name = opts.name || row.name;
  const level = row.level;
  const school = row.school;

  const cantripBaseDamage = level === 0 && row.cantripBaseDamage ? { ...row.cantripBaseDamage } : null;

  const spell = {
    name,
    level,
    school,
    ritual: !!row.ritual,
    concentration: !!row.concentration,
    castingTime: row.castingTime,
    range: row.range,
    components: row.components,
    materialComponent: row.materialComponent || null,
    duration: row.duration,
    classes: row.classes,
    description: fillTemplate(row.description, { name }),
    atHigherLevels: level > 0 ? row.atHigherLevels : null,
    cantripBaseDamage,
    flavor: fillTemplate(weightedValue(spellsTable.flavorTemplates), { name }),
    designNotes: weightedValue(spellsTable.designNotes),
    faction: null,
    sourceMode: "homebrew"
  };
  spell.id = await uniqueId(worldId, "spells", name);
  return spell;
}

// ============================================================
// Survivors (Player Characters) -- built on a real Class entry from this
// world's own archive, per Phase 8's "a PC is a Class instance" rule.
// Same requirement AI Homebrew generation enforces: a clear error if the
// world has no Classes yet, rather than inventing a fake one.
// ============================================================

async function generate5eSurvivorProcedurally(worldId, opts = {}) {
  const classEntries = await listEntries(worldId, "classes", { locked: false });
  if (!classEntries.length) {
    throw new Error("This world has no Classes yet -- generate or roll at least one Class before creating a Player Character.");
  }
  const chosenClass = classEntries[Math.floor(Math.random() * classEntries.length)];

  const name = opts.name || `${weightedValue(survivorsTable.firstNames)} ${weightedValue(survivorsTable.lastNames)}`;
  const faction = await pickFaction(worldId);
  const level = 1 + Math.floor(Math.random() * 5); // levels 1-5, same "reasonable default" range the Homebrew prompt suggests

  const abilityRow = weightedPick(survivorsTable.abilityScorePatterns).value;
  const abilities = { ...abilityRow };

  const hitPoints = computeHitPoints(chosenClass.hitDie || "d8", level, abilities.con);
  const proficiencyBonus = proficiencyBonusForLevel(level);
  const spellSlots = chosenClass.casterType && chosenClass.casterType !== "none" ? spellSlotsForLevel(chosenClass.casterType, level) : null;

  const armorRow = weightedPick(survivorsTable.armorNotes);
  const armorClass = 10 + abilityModifier(abilities.dex) + armorRow.acBonus;

  const pc = {
    name,
    classId: chosenClass.id,
    className: chosenClass.name,
    classLevel: level,
    abilities,
    armorClass,
    armorNote: armorRow.value,
    equipment: weightedValue(survivorsTable.equipmentTemplates),
    background: fillTemplate(weightedValue(survivorsTable.backgroundTemplates), { name }),
    ideals: weightedValue(survivorsTable.ideals),
    bonds: weightedValue(survivorsTable.bonds),
    flaws: weightedValue(survivorsTable.flaws),
    backstory: fillTemplate(weightedValue(survivorsTable.backstoryTemplates), { name, className: chosenClass.name }),
    designNotes: weightedValue(survivorsTable.designNotes),
    faction: faction.id === "unaligned" ? null : faction.id,
    hitPoints,
    proficiencyBonus,
    spellSlots,
    sourceMode: "homebrew"
  };
  pc.id = await uniqueId(worldId, "survivors", name);
  return pc;
}

const GENERATORS_5E = {
  enemies: generate5eEnemyProcedurally,
  classes: generate5eClassProcedurally,
  items: generate5eItemProcedurally,
  spells: generate5eSpellProcedurally,
  survivors: generate5eSurvivorProcedurally
};

module.exports = {
  GENERATORS_5E,
  generate5eEnemyProcedurally,
  generate5eClassProcedurally,
  generate5eItemProcedurally,
  generate5eSpellProcedurally,
  generate5eSurvivorProcedurally
};
