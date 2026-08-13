// lib/proceduralGenerators/shared.js
//
// Small utilities shared by the ruleset-specific procedural generators in
// this directory (lib/proceduralGenerators/5e.js, generic.js). Deliberately
// NOT imported from lib/proceduralGenerators.js -- that file is Echoes'
// existing procedural generation code (predates this session, out of
// scope to modify per session_addendum_ruleset_recovery_plan.md's R3
// scope), and it doesn't export its internal helpers anyway. These are
// small, generic (pun intended) functions with no Echoes-specific
// assumptions baked in -- same shape as weightedPick/fillTemplate/
// dedupeId over there, kept here as an independent copy rather than
// risking a shared-file edit to the Echoes module.

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

function weightedValue(pool) {
  const row = weightedPick(pool);
  return row ? row.value : null;
}

// Picks n DISTINCT rows (by reference) from a weighted pool, without
// replacement.
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

// Dedupes a candidate id against a category's real existing ids -- same
// collision-avoidance reasoning as Echoes' proceduralGenerators.js
// dedupeId()/uniqueId(), reimplemented here rather than imported.
function dedupeId(existingIds, base) {
  const idSet = new Set(existingIds);
  let candidate = base;
  if (!idSet.has(candidate)) return candidate;
  let suffix = 2;
  while (idSet.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

// worldId + category + a proposed name -> a unique entry id. Uses
// listEntries (category-generic, ruleset-agnostic) rather than
// lib/roster.js's readXManifest() readers, which are Echoes-flavored
// wrapper names -- listEntries() is the same underlying call those
// wrappers make.
const { listEntries } = require("../entriesRepo");
async function uniqueId(worldId, category, name) {
  const manifest = await listEntries(worldId, category);
  const existingIds = manifest.map((m) => m.id);
  return dedupeId(existingIds, slugify(name) || `${category}-${randomSuffix(6)}`);
}

// Picks a faction from this world's own live faction roster, same
// "never invent one" grounding rule Echoes' procedural generation and
// every AI generation prompt already follow (lib/worldFlavor.js).
// Returns { id: "unaligned", name: "Unaligned" } if the world has no
// factions yet, or on a 15% "no faction" roll.
const { getFactionOptions } = require("../worldFlavor");
async function pickFaction(worldId, { excludeUnaligned = false } = {}) {
  const options = await getFactionOptions(worldId);
  if (options.length === 0) return { id: "unaligned", name: "Unaligned" };
  if (!excludeUnaligned && Math.random() < 0.15) return { id: "unaligned", name: "Unaligned" };
  const pick = options[Math.floor(Math.random() * options.length)];
  return pick;
}

// ============================================================
// Genre awareness -- reimplemented independently from Echoes'
// lib/proceduralGenerators.js (same reasoning as every other function in
// this file: that module doesn't export its internals, and R3's scope
// explicitly keeps hands off Echoes' own procedural code). SAME five
// buckets + "universal" taxonomy and SAME keyword list, so a world's
// genre reads identically no matter which ruleset's procedural tables
// end up drawing from it -- a world described as "Cyberpunk Noir" should
// pull scifi+modern flavor whether it's an Echoes, 5e, or Generic world.
//
// Every new 5e/generic procedural table below carries a `genre` field
// per row (an array drawn from GENRE_BUCKETS, or the literal
// "universal" for rows -- mechanical pools, or flavor that genuinely
// reads fine anywhere -- that don't need genre variance). Rows with no
// `genre` field at all are treated as universal (defensive, mirrors
// Echoes' own filterByGenre() fallback).
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
// matched (callers treat [] as "draw from every bucket"). Reads Wizard
// Step 1's free-text genre field the same way Echoes' own
// detectGenreBuckets() and lib/worldFlavor.js's getSettingContext() do.
const { getDraft } = require("../worldConfigRepo");
async function detectGenreBuckets(worldId) {
  const draft = await getDraft(worldId);
  const s1 = (draft && draft["1"]) || {};
  const genreField = Array.isArray(s1.genre) ? s1.genre.join(" ") : (s1.genre || "");
  const combined = `${genreField} ${s1.inspirations || ""} ${s1.supernaturalSystem || ""}`;
  const matched = classifyGenreText(combined);
  return [...new Set(matched)];
}

// Filters a weighted pool down to rows tagged for any of `buckets` (or
// tagged "universal", always included). Falls back to the FULL pool when
// `buckets` is empty (unknown genre) or when filtering would otherwise
// leave nothing to pick from -- wrong variety beats a crash or an empty
// pick, same rule Echoes' own filterByGenre() follows.
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
// weightedPickN's signatures with a `buckets` param inserted.
function pickG(pool, buckets) {
  return weightedPick(filterByGenre(pool, buckets));
}
function pickGValue(pool, buckets) {
  return weightedValue(filterByGenre(pool, buckets));
}
function pickGN(pool, buckets, n) {
  return weightedPickN(filterByGenre(pool, buckets), n);
}

module.exports = {
  weightedPick,
  weightedValue,
  weightedPickN,
  fillTemplate,
  slugify,
  randomSuffix,
  dedupeId,
  uniqueId,
  pickFaction,
  GENRE_BUCKETS,
  detectGenreBuckets,
  filterByGenre,
  pickG,
  pickGValue,
  pickGN
};
