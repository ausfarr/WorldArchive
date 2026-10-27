// scripts/lib/saltmereSeed.js
//
// Pure (no DB, no network) logic behind scripts/seedSaltmereDemo.js: pack
// loading, dedupe, slug->id resolution, per-category adaptation of the
// content pack into the shapes the app's own writers expect, and
// validation against the real content-prompt schemas. Kept separate from
// the CLI so scripts/testSaltmereSeed.js can exercise the resolver and the
// dedupe without a database -- same split scripts/lib/fakeSupabase.js
// makes for the pipeline tests.
//
// WHY adapt instead of save the pack verbatim: the pack is shaped like a
// content-prompt response (what the model proposes), but the app's
// generate routes post-process that response before saving -- code, not
// the model, computes CR / HP / proficiency / spell slots / derived item
// stats ("model writes narrative, code writes math", world_forge_scope.md
// invariant #5). Saving the raw pack would skip that step and leave
// entries the templates can't render (e.g. a 5e enemy with no
// `challengeRating` object). So each adapter below mirrors the
// post-processing half of the matching routes/generate*.js handler,
// calling the same lib/rulesets/5e/* formula helpers.
//
// Everything here only requires pure lib modules (formulas, calendar), never
// lib/supabaseClient -- the writers that do touch the DB are required lazily
// by the CLI.

const fs = require("fs");
const path = require("path");

const { computeChallengeRating, averageDamageFromDice, XP_BY_CR } = require("../../lib/rulesets/5e/statFormulas");
const { lookupWeapon, lookupArmor, rarityValueWarning } = require("../../lib/rulesets/5e/itemFormulas");
const { subclassUnlockLevel, matchCoreClassName, savingThrowProficienciesForClass, SKILLS, multiclassSpellSlots } = require("../../lib/rulesets/5e/classFormulas");
const { computeMulticlassHitPoints, proficiencyBonusForLevel, passivePerception, initiativeBonus, applyAbilityScoreIncrease } = require("../../lib/rulesets/5e/survivorFormulas");
const { isValidSpellLevel } = require("../../lib/rulesets/5e/spellFormulas");
const { proposeAndValidateDate } = require("../../lib/calendar");

const SEED_TAG = "saltmere-v1";

// Pack file -> the app's real category slug. The user-facing names
// (Powers, Contacts, ...) are this world's own category labels
// (world_config category config); the entries table only knows the slugs.
const PACK_CATEGORIES = [
  // Order matters: it's the creation order. Factions and classes first
  // because everything else points at them; logs last (they point at
  // locations).
  { file: "factions", app: "factions", label: "Powers" },
  { file: "classes", app: "classes", label: "Dive Roles" },
  { file: "npcs", app: "npcs", label: "Contacts" },
  { file: "districts", app: "locations", label: "Districts" },
  { file: "hazards", app: "enemies", label: "Hazards" },
  { file: "items", app: "items", label: "Salvage" },
  { file: "anomalies", app: "spells", label: "Anomalies" },
  { file: "divers", app: "survivors", label: "Divers" },
  { file: "logs", app: "logs", label: "Dive Logs" }
];

// Categories whose writer takes a portrait imageUrl (lib/entryWriters.js's
// HAS_PORTRAIT). Factions use a banner instead; spells and logs have no
// image support anywhere in the app.
const PORTRAIT_CATEGORIES = new Set(["npcs", "enemies", "items", "survivors", "classes", "locations"]);

function normName(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Lookup key that also ignores a leading article, so the pack's
// "seawall-authority" finds this world's "The Seawall Authority". Used by
// the RESOLVER only -- dedupe stays strict (case-insensitive name equality)
// so "Tunnel Maw" and "The Tunnel Maw" are not silently merged.
function lookupKey(s) {
  return normName(s).replace(/^the(?=.)/, "");
}

// Every lib/*Template.js's private slugify() -- the id the generate routes
// give a new entry. Factions are the one exception (lib/factionDeepLore.js
// collapses runs of punctuation into one dash), mirrored below.
function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}
function slugifyFaction(name) {
  return (name || "faction").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "faction";
}
function idForName(appCategory, name) {
  return appCategory === "factions" ? slugifyFaction(name) : slugify(name);
}

function loadPack(packDir) {
  const pack = {};
  for (const c of PACK_CATEGORIES) {
    const file = path.join(packDir, "content", `${c.file}.json`);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(data)) throw new Error(`${file}: expected a JSON array`);
    pack[c.file] = data;
  }
  return pack;
}

// ---------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------

// existing: [{ category, id, name, locked }] -- every row of the target
// world, including locked ghost placeholders. A ghost with the same name
// counts as "exists": filling it would overwrite an existing row, which
// this script promises never to do (the app's own Fill button is the right
// way to turn a placeholder into a real entry).
function buildExistingIndex(existing) {
  const byName = new Map(); // `${category}|${normName}` -> row
  const idsByCategory = new Map(); // category -> Set(id)
  for (const row of existing) {
    byName.set(`${row.category}|${normName(row.name)}`, row);
    if (!idsByCategory.has(row.category)) idsByCategory.set(row.category, new Set());
    idsByCategory.get(row.category).add(row.id);
  }
  return { rows: existing, byName, idsByCategory };
}

// Returns the existing row a pack entry duplicates, or null.
function findDuplicate(index, appCategory, name) {
  return index.byName.get(`${appCategory}|${normName(name)}`) || null;
}

// Splits the pack into entries to create and entries to skip, and assigns
// every entry that WILL be created its final id (the generators' own
// slugify-the-name rule, plus a numeric suffix if a different existing
// entry already holds that id -- upsert would otherwise overwrite it).
//
// Returns { plan, skips, slugToRef } where slugToRef maps a pack slug to
// { category, id, name, via }: created entries point at their new id,
// skipped duplicates at the existing row's id, so a cross-link into a
// skipped entry still lands on the real thing.
function planEntries(pack, existingIndex) {
  const plan = [];
  const skips = [];
  const slugToRef = new Map();
  const claimed = new Map(); // category -> Set(ids claimed by this run)
  const portraitIds = new Set(); // ids already holding a portrait object, across portrait categories
  for (const row of existingIndex.rows) if (PORTRAIT_CATEGORIES.has(row.category)) portraitIds.add(row.id);
  for (const c of PACK_CATEGORIES) {
    claimed.set(c.app, new Set());
    for (const packEntry of pack[c.file]) {
      const dup = findDuplicate(existingIndex, c.app, packEntry.name);
      if (dup) {
        skips.push({ packCategory: c.file, category: c.app, slug: packEntry.id, name: packEntry.name, existingId: dup.id, reason: dup.locked ? "locked placeholder with this name exists" : "already exists" });
        slugToRef.set(packEntry.id, { category: c.app, id: dup.id, name: dup.name, via: "existing" });
        continue;
      }
      const taken = existingIndex.idsByCategory.get(c.app) || new Set();
      const base = idForName(c.app, packEntry.name);
      // Portraits live at <world>/<entryId>.png with NO category in the
      // path (lib/fileWriter.js saveImage), so two portrait categories
      // sharing an id would overwrite each other's image -- e.g. the
      // hazard "Cable Siren" and the diver "Cable Siren". Portrait ids must
      // therefore be unique across all portrait categories, not just
      // within one. On a clash the pack's own slug is tried first (the
      // pack already disambiguates: "cable-siren-diver"), then a suffix.
      const portraitTaken = PORTRAIT_CATEGORIES.has(c.app) ? portraitIds : null;
      const isTaken = (id) => taken.has(id) || claimed.get(c.app).has(id) || (portraitTaken && portraitTaken.has(id));
      let id = base;
      if (isTaken(id) && packEntry.id && !isTaken(packEntry.id)) id = packEntry.id;
      let n = 2;
      while (isTaken(id)) id = `${base}-${n++}`;
      claimed.get(c.app).add(id);
      if (portraitTaken) portraitTaken.add(id);
      plan.push({ packCategory: c.file, category: c.app, label: c.label, slug: packEntry.id, id, name: packEntry.name, packEntry });
      slugToRef.set(packEntry.id, { category: c.app, id, name: packEntry.name, via: "pack" });
    }
  }
  return { plan, skips, slugToRef };
}

// ---------------------------------------------------------------------
// Slug -> id resolution
// ---------------------------------------------------------------------

// ref: a pack slug ("gate-syndicate"), an existing entry id, or a display
// name. Order: (1) pack/skipped slug, (2) existing id, (3) existing name
// (the ref itself, then the optional label, then the slug read as words --
// "gate-syndicate" matches an existing "Gate Syndicate"). `category` is the
// app category the field points at; when null any category is accepted
// (unused today, kept so a mis-tagged toCategory can't silently mis-link).
function makeResolver({ slugToRef, existingIndex }) {
  function resolve(ref, { category = null, label = null } = {}) {
    if (ref == null || ref === "" || ref === "unaligned") return null;
    const hit = slugToRef.get(ref);
    if (hit && (!category || hit.category === category)) return { id: hit.id, category: hit.category, name: hit.name, via: hit.via };
    if (category) {
      const ids = existingIndex.idsByCategory.get(category);
      if (ids && ids.has(ref)) {
        const row = existingIndex.rows.find((r) => r.category === category && r.id === ref);
        return { id: ref, category, name: row ? row.name : ref, via: "existing" };
      }
    }
    for (const candidate of [ref, label]) {
      if (!candidate) continue;
      const row = category
        ? existingIndex.byName.get(`${category}|${normName(candidate)}`)
        : null;
      if (row) return { id: row.id, category, name: row.name, via: "existing" };
    }
    // Article-tolerant pass over existing rows, by display name or by id.
    if (category) {
      const keys = [ref, label].filter(Boolean).map(lookupKey);
      const row = existingIndex.rows.find((r) => r.category === category && (keys.includes(lookupKey(r.name)) || keys.includes(lookupKey(r.id))));
      if (row) return { id: row.id, category, name: row.name, via: "existing" };
    }
    // Pack entries compared by name too, for fields that carry a display
    // name rather than a slug (faction relationships).
    if (category) {
      for (const [, r] of slugToRef) {
        if (r.category === category && (normName(r.name) === normName(ref) || (label && normName(r.name) === normName(label)))) {
          return { id: r.id, category, name: r.name, via: r.via };
        }
      }
    }
    return null;
  }
  return resolve;
}

// ---------------------------------------------------------------------
// Schema-derived validation
// ---------------------------------------------------------------------

// Reads the top-level keys out of a prompt file's schema template literal.
// Parsing the source (rather than hard-coding a second copy of the key
// list here) is deliberate: the requirement is "validate against the real
// content-prompt schemas", and a copy would silently drift the day a
// prompt gains a field.
function schemaKeys(promptFile, constName) {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", promptFile), "utf8");
  const start = src.indexOf(`const ${constName} = \``);
  if (start === -1) throw new Error(`${promptFile}: no ${constName} found`);
  const end = src.indexOf("\n}`;", start);
  const block = src.slice(start, end);
  const keys = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^ {2}"([A-Za-z0-9_]+)":/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

// Per app category: where the schema lives, keys the app fills in itself
// (so the pack doesn't have to carry them), and keys that are nullable /
// absent-by-design in the schema.
const SCHEMA_SPECS = {
  factions: {
    file: "prompts/factionContentPrompt.js", const: "SCHEMA_DESCRIPTION",
    // Not model-proposed: id/name/factionKey come from the seed step.
    codeKeys: ["id", "name", "factionKey"],
    optional: ["foundingDate"]
  },
  npcs: {
    file: "prompts/npcContentPrompt.js", const: "SCHEMA_DESCRIPTION",
    codeKeys: ["id"],
    optional: ["callsign", "questHook", "birthDate", "appointedDate", "deathDate"]
  },
  locations: {
    file: "prompts/locationContentPrompt.js", const: "SCHEMA_DESCRIPTION",
    codeKeys: ["id"],
    optional: ["hooksSecrets"]
  },
  logs: {
    file: "prompts/logContentPrompt.js", const: "SCHEMA_DESCRIPTION",
    codeKeys: ["id"],
    optional: ["locationId", "faction", "resolvedDate", "resolvedDateSubject"]
  },
  enemies: {
    file: "prompts/rulesets/5e/enemyContentPrompt.js", const: "HOMEBREW_SCHEMA",
    codeKeys: ["id"],
    // targetChallengeRating is the model's design target; code replaces it
    // with the computed challengeRating. The rest are "free text or null".
    optional: ["armorNote", "savingThrows", "skills", "damageVulnerabilities", "damageResistances", "damageImmunities", "conditionImmunities", "targetChallengeRating", "legendaryActions"]
  },
  items: {
    file: "prompts/rulesets/5e/itemContentPrompt.js", const: "SCHEMA_DESCRIPTION",
    codeKeys: [],
    optional: ["rarity", "attunementRequirement", "baseItem", "magicBonus", "magicalProperties"]
  },
  classes: {
    file: "prompts/rulesets/5e/classContentPrompt.js", const: "SCHEMA_DESCRIPTION",
    codeKeys: [],
    optional: ["spellcastingAbility"]
  },
  spells: {
    file: "prompts/rulesets/5e/spellContentPrompt.js", const: "SCHEMA_DESCRIPTION",
    codeKeys: [],
    optional: ["materialComponent", "atHigherLevels", "cantripBaseDamage", "newClass"]
  },
  survivors: {
    file: "prompts/rulesets/5e/survivorContentPrompt.js", const: "SCHEMA_DESCRIPTION",
    codeKeys: [],
    // backgroundKey: routes/generateSurvivor.js itself falls back to null
    // when the model's pick isn't in the Backgrounds list.
    optional: ["featKey", "armorNote", "backgroundKey"]
  }
};

const ENUMS = {
  roleArchetype: ["Faction Leader", "Quest-Giver", "Community VIP", "Rival", "Informant/Fixer", "Merchant"],
  logType: ["Audio", "Journal", "Terminal"],
  size: ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"],
  casterType: ["full", "half", "third", "warlock", "none"],
  school: ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"],
  itemType: ["weapon", "armor", "wondrous", "potion", "scroll", "ring", "rod", "staff", "wand", "other"],
  rarity: ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"]
};
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_NAMES = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };

function isBlank(v) {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

// Validates an ADAPTED content object (what would be saved), returning a
// list of problem strings. Required = every top-level schema key that
// isn't declared optional or app-filled.
function validateContent(appCategory, content) {
  const spec = SCHEMA_SPECS[appCategory];
  const problems = [];
  const keys = schemaKeys(spec.file, spec.const);
  const required = keys.filter((k) => !spec.optional.includes(k) && !spec.codeKeys.includes(k));
  for (const k of required) {
    if (isBlank(content[k])) problems.push(`missing required field "${k}"`);
  }
  for (const k of spec.codeKeys) if (isBlank(content[k])) problems.push(`missing app-assigned field "${k}"`);

  const checkEnum = (field, list) => {
    if (!isBlank(content[field]) && !list.includes(content[field])) problems.push(`"${field}" = ${JSON.stringify(content[field])} is not one of ${list.join(" | ")}`);
  };
  const checkAbilities = (obj, where) => {
    if (!obj || typeof obj !== "object") return problems.push(`${where} must be an object`);
    for (const k of ABILITY_KEYS) if (!Number.isFinite(obj[k])) problems.push(`${where}.${k} must be a number`);
  };

  if (appCategory === "npcs") {
    checkEnum("roleArchetype", ENUMS.roleArchetype);
    if (!Number.isInteger(content.age)) problems.push('"age" must be an integer');
    if (!Array.isArray(content.traits) || !content.traits.length) problems.push('"traits" must be a non-empty array');
    for (const k of ["register", "rhythm", "tic", "neverSay"]) if (!content.speech || isBlank(content.speech[k])) problems.push(`speech.${k} is required`);
    if (!content.dialogue || isBlank(content.dialogue.openingLine) || !Array.isArray(content.dialogue.branches)) problems.push("dialogue needs openingLine + branches[]");
  }
  if (appCategory === "logs") checkEnum("logType", ENUMS.logType);
  if (appCategory === "locations") {
    if (!Array.isArray(content.dangerTags)) problems.push('"dangerTags" must be an array');
    if (!Array.isArray(content.notableNpcs)) problems.push('"notableNpcs" must be an array');
  }
  if (appCategory === "factions") {
    if (!Array.isArray(content.relationships)) problems.push('"relationships" must be an array');
  }
  if (appCategory === "enemies") {
    checkEnum("size", ENUMS.size);
    checkAbilities(content.abilities, "abilities");
    if (!Number.isFinite(content.armorClass)) problems.push('"armorClass" must be a number');
    if (!Number.isFinite(content.hitPoints)) problems.push('"hitPoints" must be a number');
    if (!Array.isArray(content.actions) || !content.actions.length) problems.push('"actions" must be a non-empty array');
    if (!content.challengeRating || isBlank(content.challengeRating.cr)) problems.push("challengeRating was not computed");
  }
  if (appCategory === "items") {
    checkEnum("itemType", ENUMS.itemType);
    if (content.rarity != null) checkEnum("rarity", ENUMS.rarity);
    if (["weapon", "armor"].includes(content.itemType) && content.baseItem) {
      const known = content.itemType === "weapon" ? lookupWeapon(content.baseItem) : lookupArmor(content.baseItem);
      if (!known) problems.push(`baseItem "${content.baseItem}" is not an SRD ${content.itemType}`);
    }
  }
  if (appCategory === "classes") {
    checkEnum("casterType", ENUMS.casterType);
    if (!/^d\d+$/.test(content.hitDie || "")) problems.push(`hitDie "${content.hitDie}" must look like d8`);
    if (!ABILITY_KEYS.includes(content.primaryAbility)) problems.push(`primaryAbility "${content.primaryAbility}" must be one of ${ABILITY_KEYS.join("|")}`);
    if (content.casterType !== "none" && !ABILITY_KEYS.includes(content.spellcastingAbility)) problems.push("a spellcasting class needs spellcastingAbility");
    if (!Array.isArray(content.savingThrowProficiencies) || content.savingThrowProficiencies.some((s) => !ABILITY_KEYS.includes(s))) problems.push("savingThrowProficiencies must be ability keys");
    if (!Array.isArray(content.features) || !content.features.length) problems.push('"features" must be a non-empty array');
    if (!Array.isArray(content.subclasses) || !content.subclasses.length) problems.push('"subclasses" must be a non-empty array');
  }
  if (appCategory === "spells") {
    checkEnum("school", ENUMS.school);
    if (!isValidSpellLevel(content.level)) problems.push("level must be an integer 0-9");
    if (!Array.isArray(content.classes) || !content.classes.length) problems.push('"classes" must be a non-empty array');
  }
  if (appCategory === "survivors") {
    checkAbilities(content.abilities, "abilities");
    if (!Array.isArray(content.classes) || !content.classes.length || content.classes.some((c) => isBlank(c.classId))) problems.push("classes[] needs at least one resolved classId");
    if (!Array.isArray(content.skillProficiencies) || !content.skillProficiencies.length) problems.push('"skillProficiencies" must be a non-empty array of skill keys');
    if (!Number.isFinite(content.hitPoints)) problems.push("hitPoints was not computed");
  }
  return problems;
}

// ---------------------------------------------------------------------
// Adaptation
// ---------------------------------------------------------------------

const REL_CATEGORY = { npc: "npcs", npcs: "npcs", faction: "factions", factions: "factions", enemy: "enemies", enemies: "enemies", class: "classes", classes: "classes", survivor: "survivors", survivors: "survivors", location: "locations", locations: "locations" };

// Drops pack-only keys the app schema doesn't carry (and `image`, which
// is handled out-of-band), recording each as an adaptation.
function stripUnknownKeys(appCategory, packEntry, extraAllowed, note) {
  const spec = SCHEMA_SPECS[appCategory];
  const allowed = new Set([...schemaKeys(spec.file, spec.const), ...spec.codeKeys, ...extraAllowed]);
  const out = {};
  const dropped = [];
  for (const [k, v] of Object.entries(packEntry)) {
    if (k === "image") continue;
    // The pack's slug id is replaced by the app-assigned id in every adapter.
    if (k === "id") continue;
    if (allowed.has(k)) out[k] = v;
    else dropped.push(k);
  }
  if (dropped.length) note(`dropped fields not in the app schema: ${dropped.join(", ")}`);
  return out;
}

// ctx: {
//   resolve, calendarConfig, report: { unresolved: [], },
//   classContent: Map(realClassId -> adapted class content)  // for divers
//   backgrounds: [{ key, name, ... }]                        // for divers
// }
// Each adapter returns { content, notes } and never touches the DB.
function adaptEntry(item, ctx) {
  const notes = [];
  const note = (n) => notes.push(n);
  const unresolved = (field, value) => ctx.report.unresolved.push({ entry: `${item.category}/${item.name}`, field, value });
  const fn = ADAPTERS[item.category];
  const content = fn(item, ctx, note, unresolved);
  content.demoSeed = SEED_TAG;
  // Per-element adaptations (one note per relationship, say) collapse to "xN".
  const counts = new Map();
  for (const n of notes) counts.set(n, (counts.get(n) || 0) + 1);
  return { content, notes: [...counts].map(([n, k]) => (k > 1 ? `${n} (x${k})` : n)) };
}

// lib/entryTemplate.js and lib/factionTemplate.js wrap these fields in
// quotation marks themselves; the pack's strings already carry a pair, which
// rendered as doubled quotes ("" ... "") in the dossier.
function unquote(value) {
  if (typeof value !== "string") return value;
  const t = value.trim();
  return t.length >= 2 && /^["\u201c]/.test(t) && /["\u201d]$/.test(t) ? t.slice(1, -1).trim() : value;
}

function cleanDate(value, field, ctx, note) {
  if (value == null) return null;
  const ok = proposeAndValidateDate(value, ctx.calendarConfig);
  if (!ok) note(`${field} ${JSON.stringify(value)} is not valid in this world's calendar -- dropped`);
  return ok;
}

// Faction / locationId style single-id fields: slug -> real id; "unaligned"
// stays as the app's own sentinel; anything unresolvable is left as-is and
// reported (rule 5).
function resolveFactionField(value, ctx, unresolved, field) {
  if (value == null || value === "" || value === "unaligned") return value;
  const hit = ctx.resolve(value, { category: "factions" });
  if (hit) return hit.id;
  unresolved(field, value);
  return value;
}

const ADAPTERS = {
  factions(item, ctx, note, unresolved) {
    const c = stripUnknownKeys("factions", item.packEntry, [], note);
    c.id = item.id;
    c.factionKey = item.id;
    c.accentColor = null; // colour is generated by a model call in the app; null is the app's own graceful default
    c.relationships = (c.relationships || []).map((r) => {
      const hit = ctx.resolve(r.toId || r.faction, { category: "factions", label: r.faction });
      if (!hit) unresolved("relationships[].faction", r.faction);
      return hit ? { ...r, faction: hit.name, toId: hit.id } : { ...r };
    });
    c.foundingDate = cleanDate(c.foundingDate, "foundingDate", ctx, note);
    if (unquote(c.overviewQuote) !== c.overviewQuote) { c.overviewQuote = unquote(c.overviewQuote); note("overviewQuote: removed the quote marks the template re-adds"); }
    c.status = "active"; // routes/confirmEntry.js STATUS_DEFAULTS
    return c;
  },

  npcs(item, ctx, note, unresolved) {
    const c = stripUnknownKeys("npcs", item.packEntry, [], note);
    c.id = item.id;
    c.faction = resolveFactionField(c.faction, ctx, unresolved, "faction");
    c.relationships = (c.relationships || []).map((r) => {
      const toCategory = REL_CATEGORY[r.toCategory];
      if (!toCategory) { unresolved("relationships[].toCategory", r.toCategory); return { ...r }; }
      if (toCategory !== r.toCategory) note(`relationship toCategory "${r.toCategory}" -> "${toCategory}" (the app uses plural category names)`);
      // The NPC prompt's allowed targets don't include locations, but the
      // dossier template links any category, so the link works and is kept.
      if (toCategory === "locations") note("NPC relationship targets a location -- outside the prompt's listed targets, kept because the dossier link works");
      const hit = ctx.resolve(r.toId, { category: toCategory, label: r.toLabel });
      if (!hit) unresolved("relationships[].toId", r.toId);
      return { ...r, toCategory, toId: hit ? hit.id : r.toId, toLabel: hit ? hit.name : r.toLabel };
    });
    for (const f of ["birthDate", "appointedDate", "deathDate"]) c[f] = cleanDate(c[f], f, ctx, note);
    let unquoted = 0;
    const fix = (v) => { const u = unquote(v); if (u !== v) unquoted++; return u; };
    c.signatureQuote = fix(c.signatureQuote);
    if (c.dialogue) {
      c.dialogue = { ...c.dialogue, openingLine: fix(c.dialogue.openingLine), branches: (c.dialogue.branches || []).map((b) => ({ ...b, reply: fix(b.reply) })) };
    }
    if (unquoted) note(`removed wrapping quote marks the template re-adds from signatureQuote/dialogue lines (${unquoted} string(s))`);
    c.status = "alive"; // routes/confirmEntry.js STATUS_DEFAULTS
    if (ctx.npcCombatProfile) c.combatProfile = ctx.npcCombatProfile; // 5e worlds, same as routes/generate.js
    return c;
  },

  locations(item, ctx, note, unresolved) {
    const c = stripUnknownKeys("locations", item.packEntry, [], note);
    c.id = item.id;
    c.faction = resolveFactionField(c.faction, ctx, unresolved, "faction");
    c.notableNpcs = (c.notableNpcs || []).map((n) => {
      const hit = ctx.resolve(n.toId, { category: "npcs", label: n.toLabel });
      if (!hit) unresolved("notableNpcs[].toId", n.toId);
      return { ...n, toId: hit ? hit.id : n.toId, toLabel: hit ? hit.name : n.toLabel };
    });
    return c;
  },

  logs(item, ctx, note, unresolved) {
    const c = stripUnknownKeys("logs", item.packEntry, [], note);
    c.id = item.id;
    c.faction = c.faction == null ? null : resolveFactionField(c.faction, ctx, unresolved, "faction");
    if (c.locationId) {
      const hit = ctx.resolve(c.locationId, { category: "locations", label: c.locationContext });
      if (hit) c.locationId = hit.id; else unresolved("locationId", c.locationId);
    } else c.locationId = null;
    c.resolvedDate = cleanDate(c.resolvedDate, "resolvedDate", ctx, note);
    // Schema: an object { category, entryId, dateField } -- the pack ships
    // the bare string "entry" on one log, which routes/confirmEntry.js's
    // validateResolvedDateSubject() would reject anyway.
    const s = c.resolvedDateSubject;
    const wellFormed = s && typeof s === "object" && s.category && s.entryId && s.dateField;
    if (s != null && !wellFormed) { note(`resolvedDateSubject ${JSON.stringify(s)} is not the { category, entryId, dateField } shape -- set to null`); c.resolvedDateSubject = null; }
    else if (wellFormed) {
      const hit = ctx.resolve(s.entryId, { category: s.category });
      if (hit) c.resolvedDateSubject = { ...s, entryId: hit.id }; else { unresolved("resolvedDateSubject.entryId", s.entryId); }
    } else c.resolvedDateSubject = null;
    if (!c.resolvedDate) c.resolvedDateSubject = null;
    return c;
  },

  enemies(item, ctx, note, unresolved) {
    const c = stripUnknownKeys("enemies", item.packEntry, [], note);
    c.id = item.id;
    // The pack's actions carry the attack numbers only inside the rules
    // text; the CR calculator (and the generator's schema) want them as
    // separate toHit / damageDice fields.
    let derived = 0;
    c.actions = (c.actions || []).map((a) => {
      if (a.damageDice != null || a.toHit != null) return a;
      const hit = /([+-]\s?\d+)\s*to hit/i.exec(a.description || "");
      const dmg = /(\d+d\d+(?:\s*[+-]\s*\d+)?)/i.exec(a.description || "");
      if (!hit || !dmg) return a;
      derived++;
      return { ...a, toHit: parseInt(hit[1].replace(/\s/g, ""), 10), damageDice: dmg[1].replace(/\s/g, "") };
    });
    if (derived) note(`parsed toHit/damageDice from the rules text of ${derived} action(s)`);
    for (const k of ["savingThrows", "skills"]) if (c[k] === undefined) c[k] = [];
    for (const k of ["damageVulnerabilities", "damageResistances", "damageImmunities", "conditionImmunities"]) if (c[k] === undefined) c[k] = null;
    c.legendaryActions = c.legendaryActions || [];

    const offense = (() => {
      let best = { avg: 0, toHit: 0 };
      for (const a of c.actions) {
        if (!a.damageDice) continue;
        const avg = averageDamageFromDice(a.damageDice);
        if (avg > best.avg) best = { avg, toHit: Number(a.toHit) || 0 };
      }
      return best;
    })();
    const broad = (t) => !!t && (String(t).split(/[,;]/).map((s) => s.trim()).filter(Boolean).length >= 3 || /\ball\b/i.test(t));
    const cr = computeChallengeRating({
      hp: c.hitPoints, ac: c.armorClass, damagePerRound: offense.avg, attackBonus: offense.toHit, saveDC: 0,
      resistantToCommonDamage: broad(c.damageResistances), immuneToCommonDamage: broad(c.damageImmunities)
    });
    if (c.targetChallengeRating != null && String(c.targetChallengeRating) !== String(cr.cr)) {
      note(`pack target CR ${c.targetChallengeRating} -> computed CR ${cr.cr} (code-computed estimate, same as the generator)`);
    }
    delete c.targetChallengeRating;
    c.faction = c.faction == null ? null : resolveFactionField(c.faction, ctx, unresolved, "faction");
    c.sourceMode = "homebrew";
    c.srdSourceId = null;
    c.srdLicenseNote = null;
    c.challengeRating = { cr: cr.cr, xp: XP_BY_CR[cr.cr] || null, defensiveCr: cr.defensiveCr, offensiveCr: cr.offensiveCr, estimated: true };
    return c;
  },

  items(item, ctx, note, unresolved) {
    const c = stripUnknownKeys("items", item.packEntry, ["faction"], note);
    c.id = item.id;
    if (c.itemType === "wondrous item") { c.itemType = "wondrous"; note('itemType "wondrous item" -> "wondrous"'); }
    if (typeof c.rarity === "string" && c.rarity) {
      const fixed = c.rarity.replace(/\b\w/g, (m) => m.toUpperCase());
      if (fixed !== c.rarity) note(`rarity "${c.rarity}" -> "${fixed}"`);
      c.rarity = fixed;
    } else c.rarity = null;
    if (c.magicBonus === 0 || c.magicBonus === "") c.magicBonus = null;
    if (!c.baseItem) c.baseItem = null;
    // "harpoon" isn't an SRD weapon; the app only knows the 31 SRD base
    // weapons and requires an exact match. javelin (simple, thrown,
    // piercing) is the closest real base for a thrown/hooked spear.
    const WEAPON_ALIASES = { harpoon: "javelin" };
    if (c.itemType === "weapon" && c.baseItem && !lookupWeapon(c.baseItem) && WEAPON_ALIASES[c.baseItem.toLowerCase()]) {
      note(`baseItem "${c.baseItem}" is not an SRD weapon -> "${WEAPON_ALIASES[c.baseItem.toLowerCase()]}"`);
      c.baseItem = WEAPON_ALIASES[c.baseItem.toLowerCase()];
    }
    // Schema wants magicalProperties as plain strings.
    c.magicalProperties = (c.magicalProperties || []).map((p) => (typeof p === "string" ? p : `${p.name}: ${p.description}`));
    if ((item.packEntry.magicalProperties || []).some((p) => typeof p !== "string")) note('magicalProperties { name, description } objects -> "Name: description" strings');
    if (c.attunementRequirement === undefined) c.attunementRequirement = null;
    c.sourceMode = "homebrew";
    c.rarityValueWarning = rarityValueWarning(c.rarity, c.valueGp);
    // Mirrors lib/rulesets/5e/homebrewItemGenerator.js's resolveItemStats.
    c.resolvedStats = c.itemType === "weapon" && c.baseItem ? (lookupWeapon(c.baseItem) ? { ...lookupWeapon(c.baseItem) } : null)
      : c.itemType === "armor" && c.baseItem ? (lookupArmor(c.baseItem) ? { ...lookupArmor(c.baseItem) } : null) : null;
    if (c.faction) c.faction = resolveFactionField(c.faction, ctx, unresolved, "faction");
    return c;
  },

  spells(item, ctx, note, unresolved) {
    const c = stripUnknownKeys("spells", item.packEntry, [], note);
    c.id = item.id;
    c.cantripBaseDamage = c.cantripBaseDamage || null;
    c.atHigherLevels = c.level === 0 ? null : (c.atHigherLevels || null);
    c.materialComponent = c.materialComponent || null;
    // Stored shape after entry cross-linking: [{ name, id }].
    c.classes = (c.classes || []).map((name) => {
      const hit = ctx.resolve(name, { category: "classes", label: name });
      if (!hit) unresolved("classes[]", name);
      return { name: hit ? hit.name : name, id: hit ? hit.id : null };
    });
    c.sourceMode = "homebrew";
    return c;
  },

  classes(item, ctx, note) {
    const c = stripUnknownKeys("classes", item.packEntry, [], note);
    c.id = item.id;
    const abil = (v) => {
      if (v == null || v === "") return null;
      const s = String(v).toLowerCase();
      return ABILITY_NAMES[s] || s.slice(0, 3);
    };
    const before = JSON.stringify([c.primaryAbility, c.spellcastingAbility, c.savingThrowProficiencies]);
    c.primaryAbility = abil(c.primaryAbility);
    c.spellcastingAbility = c.casterType === "none" ? null : abil(c.spellcastingAbility);
    c.savingThrowProficiencies = (c.savingThrowProficiencies || []).map(abil);
    if (before !== JSON.stringify([c.primaryAbility, c.spellcastingAbility, c.savingThrowProficiencies])) note("ability names -> lowercase 3-letter keys (str|dex|con|int|wis|cha)");
    // Schema: subclasses are objects with their own flavor + features; the
    // pack only has names.
    if ((c.subclasses || []).some((s) => typeof s === "string")) {
      c.subclasses = c.subclasses.map((s) => (typeof s === "string" ? { name: s, flavor: "", features: [] } : s));
      note("subclasses given as bare names -> { name, flavor: '', features: [] } (pack has no subclass flavor/features)");
    }
    // Same rules-determined fields routes/generateClass.js derives in code.
    const core = matchCoreClassName(c.name);
    c.subclassUnlockLevel = subclassUnlockLevel(core || "");
    c.savingThrowProficiencies = savingThrowProficienciesForClass(core, c.savingThrowProficiencies);
    c.faction = null;
    c.sourceMode = "homebrew";
    return c;
  },

  survivors(item, ctx, note, unresolved) {
    const c = stripUnknownKeys("survivors", item.packEntry, ["classes", "faction"], note);
    c.id = item.id;
    const resolvedClasses = [];
    for (const entry of c.classes || []) {
      const hit = ctx.resolve(entry.classId, { category: "classes", label: entry.className });
      if (!hit) { unresolved("classes[].classId", entry.classId); continue; }
      const cc = ctx.classContent.get(hit.id) || {};
      resolvedClasses.push({ classId: hit.id, className: hit.name, classLevel: Math.max(1, Math.min(20, Math.round(Number(entry.classLevel) || 1))), hitDie: cc.hitDie || "d8", casterType: cc.casterType || "none", savingThrowProficiencies: cc.savingThrowProficiencies });
    }
    // Skills: the pack uses display names ("Sleight of Hand"); the app
    // stores the 18 lowercase keys.
    const keyByName = new Map(SKILLS.map((s) => [normName(s.name), s.key]));
    const skillProficiencies = [...new Set((c.skillProficiencies || []).map((s) => keyByName.get(normName(s)) || (SKILLS.some((k) => k.key === s) ? s : null)).filter(Boolean))];
    if (skillProficiencies.length !== (c.skillProficiencies || []).length || (c.skillProficiencies || []).some((s) => !SKILLS.some((k) => k.key === s))) note("skill display names -> lowercase skill keys");
    const abilities = applyAbilityScoreIncrease(c.abilities || {}, null);
    const totalLevel = resolvedClasses.reduce((n, k) => n + k.classLevel, 0);
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const { sharedSlots, pactMagic } = multiclassSpellSlots(resolvedClasses.map((k) => ({ casterType: k.casterType, level: k.classLevel })));
    const first = resolvedClasses[0];
    const core = first ? matchCoreClassName(first.className) : null;
    const bg = (ctx.backgrounds || []).find((b) => normName(b.key) === normName(c.backgroundKey) || normName(b.name) === normName(c.backgroundKey)) || null;
    if (!bg) note(`backgroundKey "${c.backgroundKey}" is not in this app's Backgrounds list -- set to null`);
    else if (bg.key !== c.backgroundKey) note(`backgroundKey "${c.backgroundKey}" -> "${bg.key}"`);
    return {
      ...c,
      id: item.id,
      faction: c.faction || null,
      classes: resolvedClasses.map(({ classId, className, classLevel }) => ({ classId, className, classLevel })),
      totalLevel, abilities,
      raceKey: null, raceName: null,
      hitPoints: computeMulticlassHitPoints(resolvedClasses.map((k) => ({ hitDie: k.hitDie, level: k.classLevel })), abilities.con || 10),
      proficiencyBonus: profBonus,
      spellSlots: sharedSlots, pactMagic,
      skillProficiencies,
      savingThrowProficiencies: first ? savingThrowProficienciesForClass(core, first.savingThrowProficiencies) : [],
      passivePerception: passivePerception(abilities.wis || 10, profBonus, skillProficiencies.includes("perception")),
      initiativeBonus: initiativeBonus(abilities.dex || 10, 0),
      backgroundKey: bg ? bg.key : null,
      backgroundDetail: bg,
      featKey: null, featDetail: null,
      status: "alive", // routes/confirmEntry.js STATUS_DEFAULTS
      sourceMode: "homebrew"
    };
  }
};

module.exports = {
  SEED_TAG, PACK_CATEGORIES, PORTRAIT_CATEGORIES, SCHEMA_SPECS,
  normName, slugify, slugifyFaction, idForName, loadPack,
  buildExistingIndex, findDuplicate, planEntries, makeResolver,
  schemaKeys, validateContent, adaptEntry
};
