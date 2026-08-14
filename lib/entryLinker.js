// lib/entryLinker.js
//
// Core resolver for entry cross-linking (see phase0_entry_linking_audit.md
// and lib/entryLinkRegistry.js). Four functions, matching the session
// brief exactly:
//   - normalizeNameForMatch(name)
//   - resolveReferencesForEntry(worldId, category, raw) -- forward
//   - backfillReferencesFromNewEntry(worldId, newCategory, newEntry) -- backward
//   - ensureGhostPlaceholder(worldId, targetCategory, name) -- Category A only
//
// Deterministic, no AI calls anywhere in this file. Matching is always
// exact-normalized-name-match -- never fuzzy, never a partial/substring
// match -- so a match can never misfire; the only failure mode is a
// real match not being found (safe by construction, per the "never
// invent a link" rule Category B fields already followed before this
// feature existed).

const { getLinkFields, FIELD_TYPES, SHARED_CATEGORIES } = require("./entryLinkRegistry");
const { getEntry, listEntries, upsertEntry, deleteEntry } = require("./entriesRepo");
const { getCategory } = require("./rulesets/index");
const { getRuleset } = require("./worldConfigRepo");
const { getPortraitUrl, saveNpcEntry, saveLogEntry, saveLocationEntry, saveFactionEntry } = require("./fileWriter");
const { buildFactionRoundup } = require("./factionRoundup");
const { syncReciprocalRelationships } = require("./factionDeepLore");

const ALL_CATEGORIES = ["factions", "npcs", "enemies", "classes", "items", "spells", "logs", "survivors", "locations"];

function normalizeNameForMatch(name) {
  if (!name) return "";
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Identical to every *Template.js's private slugify() (lib/entryTemplate.js,
// lib/rulesets/5e/*Template.js, etc.) -- kept as its own local copy rather
// than importing one of theirs, matching the existing convention (every
// template file already duplicates this exact function rather than
// sharing one). Used only for ghost-row entry_id so a later real entry
// with the same slug collides and overwrites it (see entriesRepo.js's
// upsertEntry() comment -- fixture-verified against production in Phase 0).
function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function getAtPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setAtPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

// npcs/factions/logs/locations have exactly one implementation shared by
// every ruleset (see entryLinkRegistry.js's SHARED_CATEGORIES) -- wired
// directly against lib/fileWriter.js here, mirroring how every existing
// route already calls these four directly rather than through
// lib/rulesets/index.js's getCategory(). The other 5 categories
// (enemies/classes/items/spells/survivors) go through that registry's
// `repo` slot instead -- see getRebakeFn() below. Per this session's
// explicit instruction, both mechanisms are used together, not as
// competing alternatives: the registry's `repo` slot for the categories
// that are genuinely ruleset-shaped, this table for the ones that aren't.
const SHARED_REPOS = {
  npcs: async (worldId, content) => saveNpcEntry(worldId, content, getPortraitUrl(worldId, content.id)),
  logs: async (worldId, content) => saveLogEntry(worldId, content),
  locations: async (worldId, content) => saveLocationEntry(worldId, content, getPortraitUrl(worldId, content.id)),
  // Mirrors routes/confirmEntry.js's factions branch exactly (recompute
  // Roundup fresh, sync reciprocal relationships) so a re-bake here
  // behaves identically to a normal user-driven faction save.
  factions: async (worldId, content) => {
    const roundupRows = await buildFactionRoundup(worldId, content.factionKey);
    const saved = await saveFactionEntry(worldId, content, roundupRows);
    await syncReciprocalRelationships(worldId, content);
    return saved;
  }
};

function getRebakeFn(ruleset, category) {
  if (SHARED_CATEGORIES.includes(category)) return SHARED_REPOS[category] || null;
  const entry = getCategory(ruleset, category);
  return (entry && entry.repo) || null;
}

// Builds a normalized-name -> manifest-row lookup for one target category,
// { locked: false } so ghost placeholders are never treated as valid
// resolution targets (they're stubs waiting to be filled, not real
// content to link to).
async function buildRosterLookup(worldId, targetCategory) {
  const rows = await listEntries(worldId, targetCategory, { locked: false });
  const map = new Map();
  for (const row of rows) map.set(normalizeNameForMatch(row.name), row);
  return map;
}

// ---------- Forward resolution ----------
// Mutates nothing in place -- returns a new `raw` object with whatever
// fields could be resolved against the world's CURRENT archive, plus a
// list of Category A names that stayed unresolved (the caller decides
// whether/how to ghost those, via ensureGhostPlaceholder -- kept as a
// separate explicit call per the brief, not automatic here).
async function resolveReferencesForEntry(worldId, category, raw) {
  if (!raw) return { raw, unresolvedGhosts: [] };
  const ruleset = await getRuleset(worldId);
  const fields = getLinkFields(ruleset, category);
  if (!fields.length) return { raw, unresolvedGhosts: [] };

  const patched = { ...raw };
  const unresolvedGhosts = [];
  const rosterCache = {};
  async function rosterFor(targetCategory) {
    if (!rosterCache[targetCategory]) rosterCache[targetCategory] = await buildRosterLookup(worldId, targetCategory);
    return rosterCache[targetCategory];
  }

  for (const field of fields) {
    if (field.condition && !field.condition(patched)) continue;

    if (field.type === FIELD_TYPES.ID_POINTER) {
      const currentId = getAtPath(patched, field.idPath);
      if (currentId) continue;
      const norm = normalizeNameForMatch(getAtPath(patched, field.labelPath));
      if (!norm) continue;
      const match = (await rosterFor(field.target)).get(norm);
      if (match) setAtPath(patched, field.idPath, match.id);
    }

    if (field.type === FIELD_TYPES.ID_POINTER_ARRAY) {
      const arr = getAtPath(patched, field.arrayPath);
      if (!Array.isArray(arr) || !arr.length) continue;
      const newArr = [];
      for (const item of arr) {
        const clone = item && typeof item === "object" ? { ...item } : item;
        if (clone && typeof clone === "object" && !clone[field.idField]) {
          const targetCategory = field.target || clone[field.targetField];
          if (targetCategory && (!field.allowedTargets || field.allowedTargets.includes(targetCategory))) {
            const norm = normalizeNameForMatch(clone[field.labelField]);
            if (norm) {
              const match = (await rosterFor(targetCategory)).get(norm);
              if (match) {
                clone[field.idField] = match.id;
                clone[field.labelField] = match.name; // keep label in sync with the real entry's current name
              }
            }
          }
        }
        newArr.push(clone);
      }
      setAtPath(patched, field.arrayPath, newArr);
    }

    if (field.type === FIELD_TYPES.NAME_ONLY_ARRAY) {
      const arr = getAtPath(patched, field.arrayPath);
      if (!Array.isArray(arr) || !arr.length) continue;
      const roster = await rosterFor(field.target);
      const newArr = [];
      for (const item of arr) {
        const name = typeof item === "string" ? item : item && item.name;
        const existingId = item && typeof item === "object" ? item.id : null;
        if (!name) { newArr.push(item); continue; }
        let id = existingId || null;
        if (!id) {
          const match = roster.get(normalizeNameForMatch(name));
          if (match) id = match.id;
        }
        if (!id && field.ghostOnUnresolved) unresolvedGhosts.push({ category: field.target, name });
        newArr.push({ name, id: id || null });
      }
      setAtPath(patched, field.arrayPath, newArr);
    }
  }

  return { raw: patched, unresolvedGhosts };
}

// ---------- Backward resolution ----------
// Scans every OTHER entry in the world for a still-unresolved reference
// that names `newEntry` (exact normalized match), patches it, and
// re-bakes that entry's body_html by calling its own real save function
// again with the patched content -- never a bespoke raw_json/body_html
// write (see phase0_entry_linking_audit.md finding 4 for why).
async function backfillReferencesFromNewEntry(worldId, newCategory, newEntry) {
  const newNorm = normalizeNameForMatch(newEntry && newEntry.name);
  if (!newNorm) return { patchedCount: 0, ghostsCleaned: 0 };
  const ruleset = await getRuleset(worldId);

  let patchedCount = 0;

  for (const category of ALL_CATEGORIES) {
    const fields = getLinkFields(ruleset, category);
    if (!fields.length) continue;

    const relevantFields = fields.filter((f) => {
      if (f.noBackfill) return false;
      if (f.type === FIELD_TYPES.ID_POINTER || f.type === FIELD_TYPES.NAME_ONLY_ARRAY) return f.target === newCategory;
      if (f.type === FIELD_TYPES.ID_POINTER_ARRAY) return f.target ? f.target === newCategory : !!(f.allowedTargets && f.allowedTargets.includes(newCategory));
      return false;
    });
    if (!relevantFields.length) continue;

    const rows = await listEntries(worldId, category, { locked: false });
    for (const row of rows) {
      if (category === newCategory && row.id === newEntry.id) continue; // never self-link
      const patchedRaw = { ...(row.raw || {}) };
      let mutated = false;

      for (const field of relevantFields) {
        if (field.condition && !field.condition(patchedRaw)) continue;

        if (field.type === FIELD_TYPES.ID_POINTER) {
          if (getAtPath(patchedRaw, field.idPath)) continue;
          if (normalizeNameForMatch(getAtPath(patchedRaw, field.labelPath)) === newNorm) {
            setAtPath(patchedRaw, field.idPath, newEntry.id);
            mutated = true;
          }
        }

        if (field.type === FIELD_TYPES.NAME_ONLY_ARRAY) {
          const arr = getAtPath(patchedRaw, field.arrayPath);
          if (!Array.isArray(arr)) continue;
          const newArr = arr.map((item) => {
            const name = typeof item === "string" ? item : item && item.name;
            const existingId = item && typeof item === "object" ? item.id : null;
            if (existingId || !name) return item;
            if (normalizeNameForMatch(name) === newNorm) {
              mutated = true;
              return { name, id: newEntry.id };
            }
            return item;
          });
          setAtPath(patchedRaw, field.arrayPath, newArr);
        }

        if (field.type === FIELD_TYPES.ID_POINTER_ARRAY) {
          const arr = getAtPath(patchedRaw, field.arrayPath);
          if (!Array.isArray(arr)) continue;
          const newArr = arr.map((item) => {
            if (!item || typeof item !== "object" || item[field.idField]) return item;
            const targetCategory = field.target || item[field.targetField];
            if (targetCategory !== newCategory) return item;
            if (normalizeNameForMatch(item[field.labelField]) === newNorm) {
              mutated = true;
              return { ...item, [field.idField]: newEntry.id, [field.labelField]: newEntry.name };
            }
            return item;
          });
          setAtPath(patchedRaw, field.arrayPath, newArr);
        }
      }

      if (mutated) {
        const rebake = getRebakeFn(ruleset, category);
        if (rebake) {
          await rebake(worldId, patchedRaw);
          patchedCount++;
        }
      }
    }
  }

  // Ghost cleanup: a locked placeholder in newCategory whose normalized
  // name matches the just-created real entry, but whose slug differs
  // (upsertEntry's own unique-index collision already handled the
  // matching-slug case) -- the real entry is now canonical, delete the
  // now-stale stub rather than leaving a duplicate.
  let ghostsCleaned = 0;
  const allInCategory = await listEntries(worldId, newCategory); // no locked filter -- need ghosts too
  for (const row of allInCategory) {
    if (!row.locked || row.id === newEntry.id) continue;
    if (normalizeNameForMatch(row.name) === newNorm) {
      await deleteEntry(worldId, newCategory, row.id);
      ghostsCleaned++;
    }
  }

  return { patchedCount, ghostsCleaned };
}

// ---------- Ghost placeholders (Category A only) ----------
// Creates a locked:true stub row for a name a Category A field couldn't
// resolve, using the SAME slugify() real entries use for their id, so a
// later real entry with that name naturally collides and overwrites it
// (entries_unique_slug unique index -- fixture-verified in Phase 0).
// Never downgrades an existing row (real or already-ghosted) -- create-
// if-missing only.
async function ensureGhostPlaceholder(worldId, targetCategory, name) {
  if (!name) return null;
  const id = slugify(name);
  const existing = await getEntry(worldId, targetCategory, id);
  if (existing) return existing;

  const entryMeta = {
    id,
    name,
    subtitle: null,
    faction: null,
    tags: [],
    bodyHtml: null,
    raw: null
  };
  return upsertEntry(worldId, targetCategory, entryMeta, { locked: true });
}

module.exports = {
  normalizeNameForMatch,
  resolveReferencesForEntry,
  backfillReferencesFromNewEntry,
  ensureGhostPlaceholder,
  getRebakeFn,
  ALL_CATEGORIES
};
