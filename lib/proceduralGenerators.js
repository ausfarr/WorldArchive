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
const { getDraft } = require("./worldConfigRepo");
const {
  readItemManifest, readEnemyManifest, readClassManifest, buildAvailableClassesText,
  readSurvivorManifest, readNpcManifest, readLocationManifest, readFactionManifest, readLogManifest
} = require("./roster");

// ============================================================
// Genre awareness -- every pool row in data/proceduralTables/*.json now
// carries a `genre` array (e.g. ["fantasy"], ["post_apoc","modern"],
// ["universal"] for rows that read fine in any setting). Without this,
// procedural generation always sounded like the same post-apocalyptic
// scrap-and-rust world regardless of what a user actually built in the
// wizard -- fine for the beta's own test world, wrong for anyone running
// a fantasy or space-opera game. Detection reads Wizard Step 1's free-
// text `genre` field (draft_json["1"].genre -- see
// lib/worldFlavor.js's getSettingContext for the same source) and
// keyword-matches it against five fixed buckets. Multiple buckets can
// match at once (a "post-apocalyptic + industrial horror" world pulls
// from both post_apoc and horror pools); no match at all (blank genre,
// or wording this classifier doesn't recognize) falls back to drawing
// from EVERY bucket rather than silently defaulting to one -- wrong
// variety is better than wrong genre.
const GENRE_BUCKETS = ["post_apoc", "fantasy", "scifi", "modern", "horror"];

const GENRE_KEYWORDS = {
  post_apoc: [
    "post-apoc", "post apoc", "apocalyp", "wasteland", "survival horror", "collapse", "ruins of",
    "dystopia", "fallout", "scavenger", "industrial horror", "wretched", "grid-down", "societal collapse"
  ],
  fantasy: [
    "fantasy", "medieval", "magic", "sword and sorcery", "sorcery", "kingdom", "dragon", "elf", "elves",
    "dwarf", "dwarves", "orc", "arcane", "mythic", "high fantasy", "low fantasy", "sword & sorcery",
    "epic fantasy", "fae", "faerie", "knights", "wizard", "sorcerer", "enchanted", "realm", "quest fantasy",
    "swordpunk", "grimdark"
  ],
  scifi: [
    "sci-fi", "science fiction", "space opera", "space", "cyberpunk", "futuristic", "interstellar", "alien",
    "mecha", "cyber", "android", "starship", "galactic", "far future", "hard sci-fi", "biopunk", "solarpunk",
    "robot", "spacefaring", "colony ship", "ai uprising"
  ],
  modern: [
    "modern", "contemporary", "present day", "real world", "urban", "noir", "detective", "spy thriller",
    "corporate", "conspiracy", "现代", "modern day", "city life", "suburban", "office", "heist"
  ],
  horror: [
    "horror", "gothic", "lovecraft", "cosmic horror", "slasher", "eldritch", "cult", "undead", "haunt",
    "supernatural horror", "occult", "creeping dread", "body horror", "folk horror"
  ]
};

function classifyGenreText(text) {
  const lower = String(text || "").toLowerCase();
  return GENRE_BUCKETS.filter((bucket) => GENRE_KEYWORDS[bucket].some((kw) => lower.includes(kw)));
}

// Returns a de-duplicated array of matched bucket keys, or [] if nothing
// matched (callers treat [] as "draw from every bucket"). Reads directly
// off draft_json rather than getSettingContext()'s formatted prose block,
// since this needs the raw genre field to keyword-match against, not a
// human-readable paragraph.
async function detectGenreBuckets(worldId) {
  const draft = await getDraft(worldId);
  const s1 = (draft && draft["1"]) || {};
  const genreField = Array.isArray(s1.genre) ? s1.genre.join(" ") : (s1.genre || "");
  const combined = `${genreField} ${s1.inspirations || ""} ${s1.supernaturalSystem || ""}`;
  const matched = classifyGenreText(combined);
  return [...new Set(matched)];
}

// Filters a weighted pool down to rows tagged for any of `buckets`
// (or tagged "universal", always included). Rows with no `genre` field
// at all (shouldn't happen post-expansion, but defensive) are treated as
// universal rather than silently excluded. Falls back to the FULL pool
// when `buckets` is empty (unknown genre) or when filtering would
// otherwise leave nothing to pick from (a genre this specific pool
// hasn't been authored for yet) -- better to offer something than to
// throw on a world whose genre this table doesn't cover.
function filterByGenre(pool, buckets) {
  if (!pool || pool.length === 0) return pool;
  if (!buckets || buckets.length === 0) return pool;
  const filtered = pool.filter((row) => {
    const rowGenres = row.genre || ["universal"];
    return rowGenres.includes("universal") || rowGenres.some((g) => buckets.includes(g));
  });
  return filtered.length > 0 ? filtered : pool;
}

// Genre-aware convenience wrappers, mirroring weightedPick/weightedValue/
// weightedPickN's signatures with a `buckets` param inserted -- every
// generator below computes `buckets` once via detectGenreBuckets() and
// threads it through these instead of calling the plain weighted*
// functions directly, so every pick in this file respects the world's
// detected genre automatically.
function pickG(pool, buckets) {
  return weightedPick(filterByGenre(pool, buckets));
}
function pickGValue(pool, buckets) {
  return weightedValue(filterByGenre(pool, buckets));
}
function pickGN(pool, buckets, n) {
  return weightedPickN(filterByGenre(pool, buckets), n);
}

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
  const buckets = await detectGenreBuckets(worldId);
  const category = weightedValue(ITEM_CATEGORY_WEIGHTS);
  const statLabels = await getStatLabels(worldId);
  const condition = pickGValue(itemsTable.pools.condition, buckets);
  const designNotes = weightedValue(itemsTable.pools.designNotes);

  let item;
  if (category === "Weapon") {
    const row = pickG(itemsTable.weapons, buckets);
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
    const row = pickG(itemsTable.armor, buckets);
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
    const row = pickG(itemsTable.consumables, buckets);
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
    const row = pickG(itemsTable.questItems, buckets);
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
  const buckets = await detectGenreBuckets(worldId);
  const tier = weightedValue(TIER_WEIGHTS);
  const roleRow = pickG(enemiesTable.roles.filter((r) => r.tiers.includes(tier)), buckets);
  const statLabels = await getStatLabels(worldId);
  const faction = await pickFaction(worldId);
  const name = `${pickGValue(enemiesTable.nameEpithets, buckets)} ${pickGValue(enemiesTable.nameNouns, buckets)}`;

  const abilityCount = ABILITY_COUNT_BY_TIER[tier];
  const eligibleAbilities = enemiesTable.abilities.filter((a) => a.tiers.includes(tier));
  const abilityRows = pickGN(eligibleAbilities, buckets, abilityCount);
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
    flavor: pickGValue(enemiesTable.flavorTemplates, buckets),
    signatureQuote: Math.random() < 0.85 ? pickGValue(enemiesTable.signatureQuotes, buckets) : null,
    abilities,
    combatNotes: {
      positioning: pickGValue(enemiesTable.combatNotes.positioning, buckets),
      applies: pickGValue(enemiesTable.combatNotes.applies, buckets),
      vulnerableTo: pickGValue(enemiesTable.combatNotes.vulnerableTo, buckets),
      drops: pickGValue(enemiesTable.combatNotes.drops, buckets)
    },
    designNotes: weightedValue(enemiesTable.designNotes)
  };
  if (tier === "Boss") {
    enemy.phaseChange = {
      hpThreshold: weightedValue([{ value: 50, weight: 2 }, { value: 40, weight: 2 }, { value: 30, weight: 1 }]),
      description: pickGValue(enemiesTable.phaseChangeDescriptions, buckets)
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
  const buckets = await detectGenreBuckets(worldId);
  const archetypePool = filterByGenre(classesTable.archetypes, buckets);
  const archetype = archetypePool[Math.floor(Math.random() * archetypePool.length)];
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
  const buckets = await detectGenreBuckets(worldId);
  const name = `${pickGValue(survivorsTable.firstNames, buckets)} ${pickGValue(survivorsTable.lastNames, buckets)}`;
  const callsign = pickGValue(survivorsTable.callsigns, buckets);
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
    backstory: fillTemplate(pickGValue(survivorsTable.backstoryTemplates, buckets), { name, className }),
    personality: {
      trait: pickGValue(survivorsTable.personalityTraits, buckets),
      contradiction: pickGValue(survivorsTable.contradictions, buckets),
      wants: pickGValue(survivorsTable.wants, buckets),
      actuallyNeeds: pickGValue(survivorsTable.actuallyNeeds, buckets)
    },
    bond: {
      name: pickGValue(survivorsTable.bondNames, buckets),
      effect: pickGValue(survivorsTable.bondEffects, buckets),
      flavorLine: pickGValue(survivorsTable.bondFlavorLines, buckets)
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
  const buckets = await detectGenreBuckets(worldId);
  const name = `${pickGValue(npcsTable.firstNames, buckets)} ${pickGValue(npcsTable.lastNames, buckets)}`;
  const roleArchetype = weightedValue(npcsTable.roleArchetypes);
  const faction = await pickFaction(worldId, { excludeUnaligned: roleArchetype === "Faction Leader" });
  const pronouns = pickPronouns();
  const traits = pickGN(npcsTable.traits, buckets, 2 + Math.floor(Math.random() * 2)).map((r) => r.value);

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
    signatureQuote: pickGValue(npcsTable.signatureQuotes, buckets),
    physicalDescription: fillTemplate(pickGValue(npcsTable.physicalDescriptionTemplates, buckets), {
      pronoun_cap: pronouns.cap, pronoun_subj: pronouns.subj, pronoun_pos: pronouns.pos,
      carries: pronouns.carries, dresses: pronouns.dresses, has: pronouns.has, seems: pronouns.seems
    }),
    traits,
    contradiction: pickGValue(npcsTable.contradictionTemplates, buckets),
    wants: pickGValue(npcsTable.wantsTemplates, buckets),
    actuallyNeeds: pickGValue(npcsTable.actuallyNeedsTemplates, buckets),
    speech: {
      register: pickGValue(npcsTable.speechRegisters, buckets),
      rhythm: pickGValue(npcsTable.speechRhythms, buckets),
      tic: pickGValue(npcsTable.speechTics, buckets),
      neverSay: pickGValue(npcsTable.neverSayLines, buckets)
    },
    relationships,
    dialogue: {
      openingLine: pickGValue(npcsTable.dialogueOpeningLines, buckets),
      branches: npcsTable.dialogueBranches
    },
    questHook: pickGValue(npcsTable.questHookTemplates, buckets),
    designNotes: weightedValue(npcsTable.designNotes)
  };
  npc.id = await uniqueId(worldId, "npcs", name);
  return npc;
}

// ============================================================
// Locations
// ============================================================

async function generateLocationProcedurally(worldId) {
  const buckets = await detectGenreBuckets(worldId);
  const name = Math.random() < 0.3
    ? pickGValue(locationsTable.properNames, buckets)
    : `${pickGValue(locationsTable.nameAdjectives, buckets)} ${pickGValue(locationsTable.nameNouns, buckets)}`;
  const regionBiome = pickGValue(locationsTable.regionBiomes, buckets);
  const dangerTags = pickGN(locationsTable.dangerTags, buckets, 2 + Math.floor(Math.random() * 2)).map((r) => r.value);
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
    descriptorLine: pickGValue(locationsTable.descriptorLineTemplates, buckets),
    dangerTags,
    notableFeatures: fillTemplate(pickGValue(locationsTable.notableFeaturesTemplates, buckets), { regionBiome: regionBiome.toLowerCase() }),
    notableNpcs,
    hooksSecrets: pickGValue(locationsTable.hooksSecretsTemplates, buckets),
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
  const buckets = await detectGenreBuckets(worldId);
  const archetypePool = filterByGenre(factionsTable.archetypes, buckets);
  const archetype = archetypePool[Math.floor(Math.random() * archetypePool.length)];
  const name = (opts.name && opts.name.trim()) || archetype.nickname;
  const manifest = await readFactionManifest(worldId);
  const id = dedupeId(manifest.map((m) => m.id), slugify(name));

  const others = manifest.filter((m) => m.id !== id);
  const rival = others.length ? others[Math.floor(Math.random() * others.length)] : null;
  const rivalName = rival ? rival.name : "the other settlements nearby";
  const resourceType = pickGValue(factionsTable.resourceTypes, buckets);
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
  const buckets = await detectGenreBuckets(worldId);
  // logType itself stays an unfiltered pick across the 3 mechanically-fixed
  // values (Audio/Journal/Terminal -- see lib/logTemplate.js's
  // LOG_TYPE_LABEL, a hardcoded 3-key map the whole app depends on,
  // including AI generation) -- genre only changes what those 3 labels
  // FLAVOR as (a fantasy "Terminal" reads as an enchanted ledger, not a
  // command line), via bodyTextTemplates/contextTemplates below.
  const logType = weightedValue(logsTable.logTypes);
  const faction = await pickFaction(worldId);
  const factionPhrase = faction.id === "unaligned" ? "no particular faction" : faction.name;

  const [npcs, survivors, locations, items] = await Promise.all([
    readNpcManifest(worldId), readSurvivorManifest(worldId), readLocationManifest(worldId), readItemManifest(worldId)
  ]);
  const characterPool = npcs.concat(survivors);
  const characters = characterPool.length
    ? characterPool[Math.floor(Math.random() * characterPool.length)].name
    : pickGValue(logsTable.fallbackNames, buckets);
  const realLocation = locations.length ? locations[Math.floor(Math.random() * locations.length)] : null;
  const location = realLocation ? realLocation.name : pickGValue(logsTable.fallbackLocations, buckets);
  const item = items.length ? items[Math.floor(Math.random() * items.length)].name : pickGValue(logsTable.fallbackItems, buckets);

  const slots = { name: characters, location, item, faction: factionPhrase, logType, characters };
  const bodyText = fillTemplate(pickGValue(logsTable.bodyTextTemplates[logType], buckets), slots);
  const name = fillTemplate(pickGValue(logsTable.titleTemplates, buckets), slots);

  const log = {
    name,
    logType,
    locationContext: location,
    locationId: realLocation ? realLocation.id : null,
    characters,
    context: pickGValue(logsTable.contextTemplates, buckets),
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
