// lib/relationshipGraph.js
//
// Builds a one-hop relationship graph for a single entry: its own
// outgoing links (resolved via lib/entryLinkRegistry.js's field
// descriptors -- exactly what lib/entryLinker.js already reads at
// generation time) plus every OTHER entry in the world whose registered
// link fields resolve back to it (the same backward scan
// lib/entryLinker.js#backfillReferencesFromNewEntry() already does, just
// reading already-resolved ids instead of matching by name). No new
// fields, no schema change, no AI calls -- pure presentation over data
// that's already there.
//
// Why this exists: claude_marketing/COMPETITOR_WATCH.md's 2026-08-27 and
// 2026-08-30 entries flag a visual "entity relationship graph" as a
// feature now shipped by three separately-resourced competitors (CharGen,
// Reality Forge, Grimoire) and note Chronicled already has the underlying
// relationship data -- the gap is presentation only. This closes that gap
// for a single entry's dossier page; a whole-world graph is a separate,
// larger scope (layout at that size needs real graph-drawing, not a
// simple radial one) intentionally left for later.

const { getEntry, listEntries } = require("./entriesRepo");
const { getLinkFields, FIELD_TYPES } = require("./entryLinkRegistry");
const { getRuleset } = require("./worldConfigRepo");
const { ALL_CATEGORIES } = require("./entryLinker");

function getAtPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Default edge label per (owning category, field path), used whenever
// the field's own data carries nothing more specific (relationships[].type,
// factions.relationships[].stance -- see edgeLabel() below). Keys cover
// every field lib/entryLinkRegistry.js registers; a lookup miss can only
// happen if a new field is registered there without a matching entry
// added here, so the "related to" fallback exists but should stay unused.
const DEFAULT_FIELD_LABELS = {
  "npcs:relationships": "connected to",
  "survivors:relationships": "connected to",
  "factions:relationships": "stance toward",
  "locations:notableNpcs": "notable at",
  "logs:locationId": "recorded at",
  "classes:evolutionEvent.locationId": "evolves at",
  "items:foundAtLocationId": "found at",
  "spells:classes": "usable by",
  "survivors:classes": "class",
  "survivors:classId": "class"
};

function edgeLabel(category, path, item) {
  if (item && typeof item === "object") {
    if (item.type) return item.type;
    if (item.stance) return item.stance;
  }
  return DEFAULT_FIELD_LABELS[`${category}:${path}`] || "related to";
}

function nodeKey(category, id) {
  return `${category}:${id}`;
}

// entryId is deliberately NOT read from `raw` -- entriesRepo's
// rowToFullEntry()/rowToManifestEntry() both set `.id`/`.name`/`.locked`
// from the row's own dedicated columns (entry_id/name/locked), which stay
// correct even if a stale raw_json snapshot doesn't (same reasoning as
// entryLinker.js's applyLinkFieldMutations always re-reading `row.name`).
async function buildEntryGraph(worldId, category, entryId) {
  const center = await getEntry(worldId, category, entryId);
  if (!center) return null;

  const ruleset = await getRuleset(worldId);
  const centerKey = nodeKey(category, entryId);

  const nodes = new Map();
  nodes.set(centerKey, { id: entryId, category, name: center.name, locked: !!center.locked, isCenter: true });

  const edges = [];
  const edgeKeys = new Set();
  function addNode(cat, id, name, locked) {
    const key = nodeKey(cat, id);
    if (!nodes.has(key)) nodes.set(key, { id, category: cat, name: name || id, locked: !!locked, isCenter: false });
    return key;
  }
  function addEdge(fromKey, toKey, label) {
    const key = `${fromKey}|${toKey}|${label}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from: fromKey, to: toKey, label });
  }

  // ---------- Forward: center's own registered link fields ----------
  const raw = center.raw || {};
  for (const field of getLinkFields(ruleset, category)) {
    if (field.condition && !field.condition(raw)) continue;

    if (field.type === FIELD_TYPES.ID_POINTER) {
      const id = getAtPath(raw, field.idPath);
      if (!id) continue;
      const target = await getEntry(worldId, field.target, id);
      if (!target) continue; // dangling id -- the target was deleted since this link was made
      const key = addNode(field.target, id, target.name, target.locked);
      addEdge(centerKey, key, edgeLabel(category, field.idPath, null));
    }

    if (field.type === FIELD_TYPES.ID_POINTER_ARRAY) {
      const arr = getAtPath(raw, field.arrayPath);
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item || typeof item !== "object" || !item[field.idField]) continue;
        const targetCategory = field.target || item[field.targetField];
        if (!targetCategory) continue;
        const target = await getEntry(worldId, targetCategory, item[field.idField]);
        if (!target) continue;
        const key = addNode(targetCategory, item[field.idField], target.name, target.locked);
        addEdge(centerKey, key, edgeLabel(category, field.arrayPath, item));
      }
    }

    if (field.type === FIELD_TYPES.NAME_ONLY_ARRAY) {
      const arr = getAtPath(raw, field.arrayPath);
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        const id = item && typeof item === "object" ? item.id : null;
        if (!id) continue;
        const target = await getEntry(worldId, field.target, id);
        if (!target) continue;
        const key = addNode(field.target, id, target.name, target.locked);
        addEdge(centerKey, key, edgeLabel(category, field.arrayPath, null));
      }
    }
  }

  // ---------- Backward: every other entry whose link fields resolve to this one ----------
  // Mirrors entryLinker.js#backfillReferencesFromNewEntry's per-category
  // field-relevance filter exactly, but checks an already-resolved id
  // instead of matching an unresolved name -- deliberately does NOT skip
  // noBackfill fields (that flag only disables backward NAME-matching,
  // since those fields are always resolved at generation time; the id
  // relationship it produces is still real and worth showing here, e.g.
  // a Class's graph should show every Survivor who plays it).
  for (const otherCategory of ALL_CATEGORIES) {
    const fields = getLinkFields(ruleset, otherCategory);
    if (!fields.length) continue;
    const relevant = fields.filter((f) => {
      if (f.type === FIELD_TYPES.ID_POINTER || f.type === FIELD_TYPES.NAME_ONLY_ARRAY) return f.target === category;
      if (f.type === FIELD_TYPES.ID_POINTER_ARRAY) {
        return f.target ? f.target === category : !!(f.allowedTargets && f.allowedTargets.includes(category));
      }
      return false;
    });
    if (!relevant.length) continue;

    const rows = await listEntries(worldId, otherCategory, { locked: false });
    for (const row of rows) {
      if (otherCategory === category && row.id === entryId) continue; // never self-link
      const rowRaw = row.raw || {};

      for (const field of relevant) {
        if (field.condition && !field.condition(rowRaw)) continue;

        if (field.type === FIELD_TYPES.ID_POINTER) {
          if (getAtPath(rowRaw, field.idPath) !== entryId) continue;
          const key = addNode(otherCategory, row.id, row.name, row.locked);
          addEdge(key, centerKey, edgeLabel(otherCategory, field.idPath, null));
        }

        if (field.type === FIELD_TYPES.NAME_ONLY_ARRAY) {
          const arr = getAtPath(rowRaw, field.arrayPath);
          if (!Array.isArray(arr)) continue;
          const hit = arr.some((item) => item && typeof item === "object" && item.id === entryId);
          if (!hit) continue;
          const key = addNode(otherCategory, row.id, row.name, row.locked);
          addEdge(key, centerKey, edgeLabel(otherCategory, field.arrayPath, null));
        }

        if (field.type === FIELD_TYPES.ID_POINTER_ARRAY) {
          const arr = getAtPath(rowRaw, field.arrayPath);
          if (!Array.isArray(arr)) continue;
          for (const item of arr) {
            if (!item || typeof item !== "object" || item[field.idField] !== entryId) continue;
            const targetCategory = field.target || item[field.targetField];
            if (targetCategory !== category) continue;
            const key = addNode(otherCategory, row.id, row.name, row.locked);
            addEdge(key, centerKey, edgeLabel(otherCategory, field.arrayPath, item));
          }
        }
      }
    }
  }

  return { center: centerKey, nodes: Array.from(nodes.values()), edges };
}

module.exports = { buildEntryGraph };
