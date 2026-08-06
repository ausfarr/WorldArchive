// lib/proceduralGenerators.js
//
// Procedural (non-AI) entry generation -- see procedural_generation_scope_
// proposal.md for the full design rationale and session_addendum_
// procedural_generation_shipped.md for what shipped. One dispatcher,
// generateProcedurally(worldId, category, opts), mirroring the *shape* of
// routes/generateX.js (reads world context, returns an entry-shaped
// object) but with no fetch/Claude call anywhere in this file -- every
// value comes from a weighted pick against data/proceduralTables/<category>.json
// or a pure formula call. Callers (routes/generateProcedural.js) POST the
// returned entry through the EXISTING /api/confirm-entry route -- this
// file never writes to the database itself.
//
// Numeric fields for Items/Enemies route through the SAME formula
// modules AI generation already uses (lib/itemFormulas.js,
// lib/statFormulas.js) rather than inventing new math, per the
// proposal's #0 finding that those two modules are the only genuinely
// deterministic precedent already proven in this codebase.

const itemsTable = require("../data/proceduralTables/items.json");
const enemiesTable = require("../data/proceduralTables/enemies.json");
const classesTable = require("../data/proceduralTables/classes.json");
const survivorsTable = require("../data/proceduralTables/survivors.json");
const npcsTable = require("../data/proceduralTables/npcs.json");
const locationsTable = require("../data/proceduralTables/locations.json");
const factionsTable = require("../data/proceduralTables/factions.json");
const logsTable = require("../data/proceduralTables/logs.json");

const { clampDamageRange, WEAPON_ROLL_RANGES } = require("./itemFormulas");
const { TIER_BUDGET } = require("./statFormulas");
const { getFactionOptions, getStatLabels, getSkillSystem, resolveWeaponSkillLabel } = require("./worldFlavor");
const {
  readItemManifest, readEnemyManifest, readClassManifest, buildAvailableClassesText,
  readSurvivorManifest, readNpcManifest, readLocationManifest, readFactionManifest, readLogManifest
} = require("./roster");

// ============================================================
// Shared utilities -- weighted-pick / template-fill / id dedupe. Small
// and shared across all 8 categories rather than duplicated per file,
// same reasoning the proposal's #3.1 gives for one module over eight.
// ============================================================

function weightedPick(pool) {
  if (!pool || pool.length === 0) return null;
  const total = pool.reduce((sum, row) => sum + (row.weight != null ? row.weight : 1), 0);
  let roll = Math.random() * total;
  for (const row of pool) {
    roll -= row.weight != null ? row.weight : 1;
    if (roll <= 0) return row;
  }
  return pool[pool.length - 1];
}

// Convenience for pools shaped [{value, weight}] where only the value matters.
function weightedValue(pool) {
  const row = weightedPick(pool);
  return row ? row.value : null;
}

// Picks n DISTINCT rows (by reference) from a weighted pool, without
// replacement -- used for traits[]/dangerTags[] where a repeated pick
// would read as an obvious bug rather than a coincidence.
function weightedPickN(pool, n) {
  const remaining = pool.slice();
  const picked = [];
  const count = Math.min(n, remaining.length);
  for (let i = 0; i < count; i++) {
    const row = weightedPick(remaining);
    picked.push(row);
    remaining.splice(remaining.indexOf(row), 1);
  }
  return picked;
}

function fillTemplate(str, slots) {
  if (str == null) return str;
  return String(str).replace(/\{(\w+)\}/g, (match, key) => (slots[key] != null ? slots[key] : match));
}

// Replaces bare canonical attribute words (BODY/REFLEX/...) in table text
// with this world's own Stat Labels, mirroring how enemyTemplate.js/
// survivorTemplate.js already world-flavor these at render time -- so a
// procedurally-generated ability's effect/scaling text reads in this
// world's own vocabulary, not hardcoded English.
const CANONICAL_ATTR_WORDS = { BODY: "body", REFLEX: "reflex", KNOWLEDGE: "knowledge", PRESENCE: "presence", SANITY: "sanity", FATE: "fate" };
function applyStatLabels(text, statLabels) {
  if (text == null) return text;
  return String(text).replace(/\b(BODY|REFLEX|KNOWLEDGE|PRESENCE|SANITY|FATE)\b/g, (word) => {
    const key = CANONICAL_ATTR_WORDS[word];
    const label = statLabels && statLabels[key] && statLabels[key].label;
    return label ? label.toUpperCase() : word;
  });
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const RAND_SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function randomSuffix(len = 4) {
  let out = "";
  for (let i = 0; i < len; i++) out += RAND_SUFFIX_CHARS[Math.floor(Math.random() * RAND_SUFFIX_CHARS.length)];
  return out;
}

// Dedupes a candidate id against a category's real existing ids -- an id
// collision would silently overwrite an existing entry via upsertEntry's
// onConflict, same failure mode createNewFaction() already guards
// against for AI-generated factions (lib/factionDeepLore.js).
function dedupeId(existingIds, base) {
  const idSet = new Set(existingIds);
  let candidate = base;
  if (!idSet.has(candidate)) return candidate;
  let suffix = 2;
  while (idSet.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

const MANIFEST_READERS = {
  items: readItemManifest,
  enemies: readEnemyManifest,
  classes: readClassManifest,
  survivors: readSurvivorManifest,
  npcs: readNpcManifest,
  locations: readLocationManifest,
  factions: readFactionManifest,
  logs: readLogManifest
};

async function uniqueId(worldId, category, name) {
  const manifest = await MANIFEST_READERS[category](worldId);
  const existingIds = manifest.map((m) => m.id);
  return dedupeId(existingIds, slugify(name) || `${category}-${randomSuffix(6)}`);
}

// Picks a faction from THIS world's own live faction roster (never
// invents one) -- same source AI generation prompts are grounded in, per
// lib/worldFlavor.js's own header comment on why it reads the live
// archive rather than world_config. Returns { id: "unaligned", name:
// "Unaligned" } if the world has no factions yet, or if the 15% "no
// faction" roll hits. excludeUnaligned forces a real pick when the caller
// already knows unaligned wouldn't make sense (e.g. an NPC rolled as
// "Faction Leader").
async function pickFaction(worldId, { excludeUnaligned = false } = {}) {
  const options = await getFactionOptions(worldId);
  if (options.length === 0) return { id: "unaligned", name: "Unaligned" };
  if (!excludeUnaligned && Math.random() < 0.15) return { id: "unaligned", name: "Unaligned" };
  const pick = options[Math.floor(Math.random() * options.length)];
  return pick;
}

// verbs carries "they" needing the plural conjugation while she/he take
// the standard third-person -s form -- a real bug found during this
// session's own screenshot testing ("They carries their weight..."),
// fixed by conjugating per-pronoun here rather than hardcoding a verb
// form in the templates themselves.
const PRONOUN_SETS = [
  { cap: "They", subj: "they", pos: "their", carries: "carry", dresses: "dress", has: "have", seems: "seem" },
  { cap: "She", subj: "she", pos: "her", carries: "carries", dresses: "dresses", has: "has", seems: "seems" },
  { cap: "He", subj: "he", pos: "his", carries: "carries", dresses: "dresses", has: "has", seems: "seems" }
];
function pickPronouns() {
  const roll = Math.random();
  if (roll < 0.5) return PRONOUN_SETS[0];
  if (roll < 0.75) return PRONOUN_SETS[1];
  return PRONOUN_SETS[2];
}

// ============================================================
// Items
// ============================================================

const ITEM_CATEGORY_WEIGHTS = [
  { value: "Weapon", weight: 45 },
  { value: "Armor", weight: 20 },
  { value: "Consumable", weight: 25 },
  { value: "QuestItem", weight: 10 }
];

// Which attribute a weapon's damage "feels" grounded in, for relevantStat
// -- a flavor field only (see prompts/itemContentPrompt.js), not fed back
// into any formula.
const WEAPON_SKILL_ATTR = {
  "Heavy Weapons": "body", "Polearm": "body", "Unarmed": "body",
  "Light Weapons": "reflex", "Archery": "reflex", "Ballistics": "reflex",
  "Catalysts": "knowledge"
};

function rollDamageForSkill(weaponSkill, rarity) {
  const range = WEAPON_ROLL_RANGES[weaponSkill] || [5, 10];
  const [rangeMin, rangeMax] = range;
  const spreadBonus = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 4 }[rarity] || 0;
  const min = rangeMin + Math.floor(Math.random() * Math.max(1, Math.round((rangeMax - rangeMin) / 2)));
  const max = min + 1 + Math.floor(Math.random() * 3) + spreadBonus;
  return clampDamageRange(weaponSkill, min, max);
}

async function generateItemProcedurally(worldId) {
  const category = weightedValue(ITEM_CATEGORY_WEIGHTS);
  const statLabels = await getStatLabels(worldId);
  const condition = weightedValue(itemsTable.pools.condition);
  const designNotes = weightedValue(itemsTable.pools.designNotes);

  let item;
  if (category === "Weapon") {
    const row = weightedPick(itemsTable.weapons);
    const rarity = weightedValue(Object.entries(row.rarityWeights).map(([value, weight]) => ({ value, weight })));
    const { min, max } = rollDamageForSkill(row.weaponSkill, rarity);
    const skillSystem = await getSkillSystem(worldId);
    item = {
      name: row.weaponType,
      category: "Weapon",
      rarity,
      flavor: fillTemplate(row.flavorTemplate, { condition }),
      weaponSkill: row.weaponSkill,
      weaponSkillLabel: resolveWeaponSkillLabel(skillSystem, row.weaponSkill),
      weaponType: row.weaponType,
      damageMin: min,
      damageMax: max,
      relevantStat: (statLabels[WEAPON_SKILL_ATTR[row.weaponSkill]] || {}).label || null,
      appliesStatus: weightedValue(itemsTable.pools.appliesStatus),
      effectorTier: null,
      rarityEffect: rarity === "Common" ? null : weightedValue(itemsTable.pools.rarityEffect[rarity] || itemsTable.pools.rarityEffect.Uncommon),
      apCost: null,
      effect: null,
      whereFoundWhyMatters: null,
      foundAtLocationId: null,
      designNotes
    };
  } else if (category === "Armor") {
    const row = weightedPick(itemsTable.armor);
    const rarity = weightedValue(Object.entries(row.rarityWeights).map(([value, weight]) => ({ value, weight })));
    const [tierMin, tierMax] = row.effectorTierRange;
    const effectorTier = tierMin + Math.floor(Math.random() * (tierMax - tierMin + 1));
    item = {
      name: row.weaponType,
      category: "Armor",
      rarity,
      flavor: fillTemplate(row.flavorTemplate, { condition }),
      weaponSkill: null,
      weaponType: row.weaponType,
      damageMin: null,
      damageMax: null,
      relevantStat: null,
      appliesStatus: null,
      effectorTier,
      rarityEffect: rarity === "Common" ? null : weightedValue(itemsTable.pools.rarityEffect[rarity] || itemsTable.pools.rarityEffect.Uncommon),
      apCost: null,
      effect: null,
      whereFoundWhyMatters: null,
      foundAtLocationId: null,
      designNotes
    };
  } else if (category === "Consumable") {
    const row = weightedPick(itemsTable.consumables);
    item = {
      name: row.name,
      category: "Consumable",
      rarity: null,
      flavor: fillTemplate(row.flavorTemplate, { condition }),
      weaponSkill: null,
      weaponType: null,
      damageMin: null,
      damageMax: null,
      relevantStat: null,
      appliesStatus: null,
      effectorTier: null,
      rarityEffect: null,
      apCost: row.apCost,
      effect: row.effect,
      whereFoundWhyMatters: null,
      foundAtLocationId: null,
      designNotes
    };
  } else {
    const row = weightedPick(itemsTable.questItems);
    const locations = await readLocationManifest(worldId);
    const realLocation = locations.length ? locations[Math.floor(Math.random() * locations.length)] : null;
    const locationLine = realLocation ? realLocation.name : "an unmarked site nobody's gotten around to naming";
    item = {
      name: row.name,
      category: "QuestItem",
      rarity: null,
      flavor: fillTemplate(row.flavorTemplate, { condition }),
      weaponSkill: null,
      weaponType: null,
      damageMin: null,
      damageMax: null,
      relevantStat: null,
      appliesStatus: null,
      effectorTier: null,
      rarityEffect: null,
      apCost: null,
      effect: null,
      whereFoundWhyMatters: fillTemplate(row.whereFoundTemplate, { locationLine }),
      foundAtLocationId: realLocation ? realLocation.id : null,
      designNotes
    };
  }

  item.id = await uniqueId(worldId, "items", item.name);
  return item;
}

// ============================================================
// Enemies
// ============================================================

const TIER_WEIGHTS = [{ value: "Trash", weight: 5 }, { value: "Elite", weight: 3 }, { value: "Boss", weight: 1 }];
const ABILITY_COUNT_BY_TIER = { Trash: 2, Elite: 3, Boss: 4 };

// Distributes `totalBudget` points across the six canonical attributes,
// same shape as TIER_BUDGET rolls an AI generation would produce -- a
// weighted-random split rather than a flat divide, so no two
// procedurally-rolled stat blocks look identical.
function rollAttributeBudget(totalBudget) {
  const keys = ["body", "reflex", "knowledge", "presence", "sanity", "fate"];
  const jittered = keys.map(() => 0.6 + Math.random());
  const sumW = jittered.reduce((a, b) => a + b, 0);
  const values = jittered.map((w) => Math.max(2, Math.round((w / sumW) * totalBudget)));
  let diff = totalBudget - values.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const idx = diff > 0 ? values.indexOf(Math.min(...values)) : values.indexOf(Math.max(...values));
    values[idx] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  const attrs = {};
  keys.forEach((k, i) => { attrs[k] = values[i]; });
  return attrs;
}

async function generateEnemyProcedurally(worldId) {
  const tier = weightedValue(TIER_WEIGHTS);
  const roleRow = weightedPick(enemiesTable.roles.filter((r) => r.tiers.includes(tier)));
  const statLabels = await getStatLabels(worldId);
  const faction = await pickFaction(worldId);
  const name = `${weightedValue(enemiesTable.nameEpithets)} ${weightedValue(enemiesTable.nameNouns)}`;

  const abilityCount = ABILITY_COUNT_BY_TIER[tier];
  const eligibleAbilities = enemiesTable.abilities.filter((a) => a.tiers.includes(tier));
  const abilityRows = weightedPickN(eligibleAbilities, abilityCount);
  const abilityFlavorLines = [
    "A trick learned through repetition, not training.",
    "Telegraphed just enough to be avoidable, if you're watching for it.",
    "Nothing fancy -- just effective, and used often.",
    "The kind of move that only works because most people freeze up first.",
    "Clearly practiced, whatever its origin."
  ];
  const abilities = abilityRows.map((row) => ({
    name: row.name,
    kind: row.kind,
    flavor: abilityFlavorLines[Math.floor(Math.random() * abilityFlavorLines.length)],
    effect: applyStatLabels(row.effectTemplate, statLabels),
    scaling: applyStatLabels(row.scalingTemplate, statLabels)
  }));

  const enemy = {
    name,
    tier,
    role: roleRow.value,
    faction: faction.id,
    attributes: rollAttributeBudget(TIER_BUDGET[tier] || TIER_BUDGET.Elite),
    flavor: weightedValue(enemiesTable.flavorTemplates),
    signatureQuote: Math.random() < 0.85 ? weightedValue(enemiesTable.signatureQuotes) : null,
    abilities,
    combatNotes: {
      positioning: weightedValue(enemiesTable.combatNotes.positioning),
      applies: weightedValue(enemiesTable.combatNotes.applies),
      vulnerableTo: weightedValue(enemiesTable.combatNotes.vulnerableTo),
      drops: weightedValue(enemiesTable.combatNotes.drops)
    },
    designNotes: weightedValue(enemiesTable.designNotes)
  };
  if (tier === "Boss") {
    enemy.phaseChange = {
      hpThreshold: weightedValue([{ value: 50, weight: 2 }, { value: 40, weight: 2 }, { value: 30, weight: 1 }]),
      description: weightedValue(enemiesTable.phaseChangeDescriptions)
    };
  }
  enemy.id = await uniqueId(worldId, "enemies", name);
  return enemy;
}

// ============================================================
// Classes
// ============================================================

function buildAbility(entry, level, statLabels, slots) {
  return {
    level,
    name: entry.name,
    kind: entry.kind,
    effectText: applyStatLabels(fillTemplate(entry.effectTemplate, slots), statLabels)
  };
}

async function generateClassProcedurally(worldId) {
  const archetype = classesTable.archetypes[Math.floor(Math.random() * classesTable.archetypes.length)];
  const statLabels = await getStatLabels(worldId);
  const skillSystem = await getSkillSystem(worldId);
  const fieldSkills = (skillSystem && skillSystem.fieldSkills && skillSystem.fieldSkills.length)
    ? skillSystem.fieldSkills.map((s) => s.name)
    : ["Combat Training", "Survival Instinct", "Technical Aptitude", "Streetwise", "Field Medicine"];
  const shuffledSkills = fieldSkills.slice().sort(() => Math.random() - 0.5);
  const majorSkill = shuffledSkills[0] || "Combat Training";
  const minorSkill = shuffledSkills[1] || shuffledSkills[0] || "Survival Instinct";
  const miscSkill = shuffledSkills[2] || minorSkill;

  const primaryLabel = (statLabels[archetype.primaryAttribute] || {}).label || archetype.primaryAttribute;
  const secondaryLabel = (statLabels[archetype.secondaryAttribute] || {}).label || archetype.secondaryAttribute;
  const slots = { name: archetype.baseName, resource: archetype.coreResourceName, primaryLabel, secondaryLabel, majorSkill, minorSkill };

  const pool = classesTable.abilityPool;
  const t1 = weightedPickN(pool.t1.map((r) => ({ ...r, weight: 1 })), 4);
  const t2 = pool.t2.slice(0, 5);
  const t3 = weightedPickN(pool.t3.map((r) => ({ ...r, weight: 1 })), 5);
  const t4 = pool.t4.slice(0, 4);

  const tier1Abilities = [
    buildAbility(t1[0], 1, statLabels, slots),
    buildAbility(t1[1], 5, statLabels, slots),
    buildAbility(t1[2], 10, statLabels, slots),
    buildAbility(t1[3], 15, statLabels, slots),
    buildAbility(pool["t1-ultimate"][archetype.tag], 20, statLabels, slots)
  ];
  const tier2Levels = [25, 30, 35, 42, 48];
  const tier2Abilities = t2.map((entry, i) => buildAbility(entry, tier2Levels[i], statLabels, slots));
  const tier3Levels = [51, 55, 60, 65, 70];
  const tier3Abilities = t3.map((entry, i) => buildAbility(entry, tier3Levels[i], statLabels, slots))
    .concat([buildAbility(pool["t3-ultimate"][archetype.tag], 75, statLabels, slots)]);
  const tier4Levels = [80, 85, 90, 95];
  const tier4Abilities = t4.map((entry, i) => buildAbility(entry, tier4Levels[i], statLabels, slots))
    .concat([buildAbility(pool["t4-final"][archetype.tag], 99, statLabels, slots)]);

  const locations = await readLocationManifest(worldId);
  const realLocation = locations.length ? locations[Math.floor(Math.random() * locations.length)] : null;
  const skillRank = 30 + Math.floor(Math.random() * 16); // 30-45, well below the 100 ceiling per prompts/classContentPrompt.js's own guidance

  const cls = {
    baseName: `The ${archetype.baseName}`,
    evolvedName: archetype.evolvedName,
    tagline: fillTemplate(archetype.tagline, slots),
    archetype: archetype.archetype,
    coreResourceName: archetype.coreResourceName,
    coreResourceDescription: fillTemplate(archetype.coreResourceDescription, slots),
    primaryAttribute: primaryLabel,
    secondaryAttribute: secondaryLabel,
    skillEfficiency: { major: majorSkill, minor: minorSkill, misc: miscSkill },
    tier1: { title: archetype.tier1.title, theme: archetype.tier1.theme, abilities: tier1Abilities },
    tier2: { title: archetype.tier2.title, theme: archetype.tier2.theme, abilities: tier2Abilities },
    evolutionEvent: {
      requirement: `${majorSkill} at rank ${skillRank} or higher`,
      cost: fillTemplate(archetype.evolutionCost, slots),
      location: realLocation ? realLocation.name : "a workshop nobody else has laid claim to",
      locationId: realLocation ? realLocation.id : null,
      visualShift: archetype.visualShift
    },
    tier3: { title: archetype.tier3.title, theme: archetype.tier3.theme, abilities: tier3Abilities },
    tier4: { title: archetype.tier4.title, theme: archetype.tier4.theme, abilities: tier4Abilities },
    capstoneQuote: fillTemplate(archetype.capstoneQuote, slots),
    whyItWorks: archetype.whyItWorks.map((w) => ({ label: fillTemplate(w.label, slots), text: fillTemplate(w.text, slots) })),
    designNotes: weightedValue(classesTable.designNotes)
  };
  cls.id = await uniqueId(worldId, "classes", `${archetype.baseName} ${archetype.evolvedName}`);
  return cls;
}

// ============================================================
// Survivors (PCs)
// ============================================================

async function generateSurvivorProcedurally(worldId) {
  const name = `${weightedValue(survivorsTable.firstNames)} ${weightedValue(survivorsTable.lastNames)}`;
  const callsign = weightedValue(survivorsTable.callsigns);
  const faction = await pickFaction(worldId);

  const classListText = await buildAvailableClassesText(worldId);
  const classLines = classListText.split("\n").map((l) => l.replace(/^-\s*/, "").trim()).filter(Boolean);
  const className = classLines.length ? classLines[Math.floor(Math.random() * classLines.length)] : "Survivor";

  const budget = 50 + Math.floor(Math.random() * 11); // ~50-60, per PC_ATTRIBUTE_BUDGET_HINT
  const attributes = rollAttributeBudget(budget);

  const relationships = [];
  if (faction.id !== "unaligned") {
    relationships.push({
      type: "faction allegiance",
      toId: faction.id,
      toCategory: "factions",
      toLabel: faction.name,
      why: "Carries formal standing within the faction, for whatever that's worth day to day."
    });
  }

  const survivor = {
    name,
    callsign,
    playerName: null,
    faction: faction.id,
    className,
    attributes,
    backstory: fillTemplate(weightedValue(survivorsTable.backstoryTemplates), { name, className }),
    personality: {
      trait: weightedValue(survivorsTable.personalityTraits),
      contradiction: weightedValue(survivorsTable.contradictions),
      wants: weightedValue(survivorsTable.wants),
      actuallyNeeds: weightedValue(survivorsTable.actuallyNeeds)
    },
    bond: {
      name: weightedValue(survivorsTable.bondNames),
      effect: weightedValue(survivorsTable.bondEffects),
      flavorLine: weightedValue(survivorsTable.bondFlavorLines)
    },
    relationships,
    designNotes: weightedValue(survivorsTable.designNotes)
  };
  survivor.id = await uniqueId(worldId, "survivors", name);
  return survivor;
}

// ============================================================
// NPCs
// ============================================================

async function generateNpcProcedurally(worldId) {
  const name = `${weightedValue(npcsTable.firstNames)} ${weightedValue(npcsTable.lastNames)}`;
  const roleArchetype = weightedValue(npcsTable.roleArchetypes);
  const faction = await pickFaction(worldId, { excludeUnaligned: roleArchetype === "Faction Leader" });
  const pronouns = pickPronouns();
  const traits = weightedPickN(npcsTable.traits, 2 + Math.floor(Math.random() * 2)).map((r) => r.value);

  const relationships = [];
  if (faction.id !== "unaligned") {
    relationships.push({
      type: "faction allegiance",
      toId: faction.id,
      toCategory: "factions",
      toLabel: faction.name,
      why: "Formally affiliated, with day-to-day standing that varies by how useful they've been lately."
    });
  }

  const npc = {
    name,
    faction: faction.id,
    roleArchetype,
    age: weightedValue(npcsTable.ages),
    signatureQuote: weightedValue(npcsTable.signatureQuotes),
    physicalDescription: fillTemplate(weightedValue(npcsTable.physicalDescriptionTemplates), {
      pronoun_cap: pronouns.cap, pronoun_subj: pronouns.subj, pronoun_pos: pronouns.pos,
      carries: pronouns.carries, dresses: pronouns.dresses, has: pronouns.has, seems: pronouns.seems
    }),
    traits,
    contradiction: weightedValue(npcsTable.contradictionTemplates),
    wants: weightedValue(npcsTable.wantsTemplates),
    actuallyNeeds: weightedValue(npcsTable.actuallyNeedsTemplates),
    speech: {
      register: weightedValue(npcsTable.speechRegisters),
      rhythm: weightedValue(npcsTable.speechRhythms),
      tic: weightedValue(npcsTable.speechTics),
      neverSay: weightedValue(npcsTable.neverSayLines)
    },
    relationships,
    dialogue: {
      openingLine: weightedValue(npcsTable.dialogueOpeningLines),
      branches: npcsTable.dialogueBranches
    },
    questHook: weightedValue(npcsTable.questHookTemplates),
    designNotes: weightedValue(npcsTable.designNotes)
  };
  npc.id = await uniqueId(worldId, "npcs", name);
  return npc;
}

// ============================================================
// Locations
// ============================================================

async function generateLocationProcedurally(worldId) {
  const name = Math.random() < 0.3
    ? weightedValue(locationsTable.properNames)
    : `${weightedValue(locationsTable.nameAdjectives)} ${weightedValue(locationsTable.nameNouns)}`;
  const regionBiome = weightedValue(locationsTable.regionBiomes);
  const dangerTags = weightedPickN(locationsTable.dangerTags, 2 + Math.floor(Math.random() * 2)).map((r) => r.value);
  const faction = await pickFaction(worldId);

  const npcs = await readNpcManifest(worldId);
  const notableNpcs = [];
  if (npcs.length && Math.random() < 0.3) {
    const npc = npcs[Math.floor(Math.random() * npcs.length)];
    notableNpcs.push({ toId: npc.id, toLabel: npc.name, why: "Known to frequent this area regularly." });
  }

  const location = {
    name,
    regionBiome,
    faction: faction.id,
    descriptorLine: weightedValue(locationsTable.descriptorLineTemplates),
    dangerTags,
    notableFeatures: fillTemplate(weightedValue(locationsTable.notableFeaturesTemplates), { regionBiome: regionBiome.toLowerCase() }),
    notableNpcs,
    hooksSecrets: weightedValue(locationsTable.hooksSecretsTemplates),
    designNotes: weightedValue(locationsTable.designNotes)
  };
  location.id = await uniqueId(worldId, "locations", name);
  return location;
}

// ============================================================
// Factions (EXPERIMENTAL -- see procedural_generation_scope_proposal.md
// #2's "poor fit" flag and the addendum's honest verdict)
// ============================================================

async function generateFactionProcedurally(worldId, opts = {}) {
  const archetype = factionsTable.archetypes[Math.floor(Math.random() * factionsTable.archetypes.length)];
  const name = (opts.name && opts.name.trim()) || archetype.nickname;
  const manifest = await readFactionManifest(worldId);
  const id = dedupeId(manifest.map((m) => m.id), slugify(name));

  const others = manifest.filter((m) => m.id !== id);
  const rival = others.length ? others[Math.floor(Math.random() * others.length)] : null;
  const rivalName = rival ? rival.name : "the other settlements nearby";
  const resourceType = weightedValue(factionsTable.resourceTypes);
  const slots = { name, rivalName, resourceType };

  const relationships = [];
  if (others.length) {
    const picks = others.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(2, others.length));
    picks.forEach((other) => {
      relationships.push({
        faction: other.name,
        stance: weightedValue(factionsTable.relationshipStances),
        why: weightedValue(factionsTable.relationshipWhyTemplates)
      });
    });
  } else {
    relationships.push({
      faction: "Neighboring Settlements",
      stance: "Wary Truce",
      why: "No other factions archived yet -- this relationship is a placeholder until one exists."
    });
  }

  const faction = {
    id,
    factionKey: id,
    name,
    nickname: archetype.epithet,
    overviewQuote: fillTemplate(archetype.overviewQuoteTemplate, slots),
    origin: fillTemplate(archetype.originTemplate, slots),
    corePhilosophy: fillTemplate(archetype.corePhilosophyTemplate, slots),
    structureHierarchy: fillTemplate(archetype.structureHierarchyTemplate, slots),
    territory: fillTemplate(archetype.territoryTemplate, slots),
    goalsNearTerm: fillTemplate(archetype.goalsNearTermTemplate, slots),
    goalsLongTerm: fillTemplate(archetype.goalsLongTermTemplate, slots),
    internalTensions: fillTemplate(archetype.internalTensionsTemplate, slots),
    iconography: fillTemplate(archetype.iconographyTemplate, slots),
    relationships,
    economyResources: fillTemplate(archetype.economyResourcesTemplate, slots),
    joining: fillTemplate(archetype.joiningTemplate, slots),
    accentColor: null
  };
  return faction;
}

// ============================================================
// Logs (EXPERIMENTAL -- see procedural_generation_scope_proposal.md #2's
// "poor fit" flag and the addendum's honest verdict)
// ============================================================

async function generateLogProcedurally(worldId) {
  const logType = weightedValue(logsTable.logTypes);
  const faction = await pickFaction(worldId);
  const factionPhrase = faction.id === "unaligned" ? "no particular faction" : faction.name;

  const [npcs, survivors, locations, items] = await Promise.all([
    readNpcManifest(worldId), readSurvivorManifest(worldId), readLocationManifest(worldId), readItemManifest(worldId)
  ]);
  const characterPool = npcs.concat(survivors);
  const characters = characterPool.length
    ? characterPool[Math.floor(Math.random() * characterPool.length)].name
    : weightedValue(logsTable.fallbackNames);
  const realLocation = locations.length ? locations[Math.floor(Math.random() * locations.length)] : null;
  const location = realLocation ? realLocation.name : weightedValue(logsTable.fallbackLocations);
  const item = items.length ? items[Math.floor(Math.random() * items.length)].name : weightedValue(logsTable.fallbackItems);

  const slots = { name: characters, location, item, faction: factionPhrase, logType, characters };
  const bodyText = fillTemplate(weightedValue(logsTable.bodyTextTemplates[logType]), slots);
  const name = fillTemplate(weightedValue(logsTable.titleTemplates), slots);

  const log = {
    name,
    logType,
    locationContext: location,
    locationId: realLocation ? realLocation.id : null,
    characters,
    context: weightedValue(logsTable.contextTemplates),
    bodyText,
    faction: faction.id === "unaligned" ? null : faction.id,
    hexTongue: false,
    designNotes: weightedValue(logsTable.designNotes)
  };
  log.id = await uniqueId(worldId, "logs", name);
  return log;
}

// ============================================================
// Dispatcher
// ============================================================

const GENERATORS = {
  items: generateItemProcedurally,
  enemies: generateEnemyProcedurally,
  classes: generateClassProcedurally,
  survivors: generateSurvivorProcedurally,
  npcs: generateNpcProcedurally,
  locations: generateLocationProcedurally,
  factions: generateFactionProcedurally,
  logs: generateLogProcedurally
};

async function generateProcedurally(worldId, category, opts = {}) {
  const generator = GENERATORS[category];
  if (!generator) throw new Error(`No procedural generator for category '${category}'`);
  return generator(worldId, opts);
}

module.exports = {
  generateProcedurally,
  generateItemProcedurally,
  generateEnemyProcedurally,
  generateClassProcedurally,
  generateSurvivorProcedurally,
  generateNpcProcedurally,
  generateLocationProcedurally,
  generateFactionProcedurally,
  generateLogProcedurally
};
