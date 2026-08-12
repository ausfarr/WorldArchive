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

module.exports = {
  weightedPick,
  weightedValue,
  weightedPickN,
  fillTemplate,
  slugify,
  randomSuffix,
  dedupeId,
  uniqueId,
  pickFaction
};
