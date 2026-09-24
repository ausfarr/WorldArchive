// lib/entryCleanup.js
//
// Bug batch 1 audit, items 5-7 (session_addendum_bug_batch_1.md): keep
// OTHER entries consistent when one entry is renamed or deleted. Driven by
// lib/entryLinkRegistry.js (the same registry cross-linking already uses),
// so every registered reference field is covered without per-category
// code here:
//   ID_POINTER_ARRAY -- [{ <idField>, <labelField> }] e.g. faction/NPC
//                       relationships, a location's notable NPCs
//   NAME_ONLY_ARRAY  -- [{ name, id }] e.g. a 5e spell's classes
//   ID_POINTER       -- a single id with a PROSE label (e.g. a log's
//                       locationContext) -- id cleared on delete, label
//                       never rewritten on rename (it's a sentence, not a
//                       name)
//
// Everything is re-saved through the normal writers
// (lib/entryWriters.js, or saveFactionEntry + a fresh Roundup for
// factions) so body HTML is rebuilt too. Best-effort per entry: one
// failed re-save is logged and counted, never thrown -- the rename/delete
// the DM asked for has already happened.

const { listEntries } = require("./entriesRepo");
const { getRuleset } = require("./worldConfigRepo");
const { getLinkFields, FIELD_TYPES } = require("./entryLinkRegistry");
const { writeEntry } = require("./entryWriters");
const { saveFactionEntry } = require("./fileWriter");
const { buildFactionRoundup } = require("./factionRoundup");

const ALL_CATEGORIES = ["factions", "npcs", "enemies", "items", "survivors", "logs", "classes", "locations", "spells", "session-packets"];

// "No faction" as each category's own edit form stores it
// (archive/js/render.js): NPC, Location and PC forms have an explicit
// "Unaligned" option; the rest use an empty selection.
const UNALIGNED_VALUE = { npcs: "unaligned", locations: "unaligned", survivors: "unaligned" };

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== "object") return;
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

// Does this array item point at (category, id)?
function itemPointsAt(field, item, category, id) {
  if (!item || typeof item !== "object") return false;
  if (field.type === FIELD_TYPES.NAME_ONLY_ARRAY) return field.target === category && item.id === id;
  const itemTarget = field.targetField ? item[field.targetField] : field.target;
  return itemTarget === category && item[field.idField] === id;
}

async function resaveRaw(worldId, category, row, raw) {
  if (category === "factions") {
    const factionKey = row.faction || raw.factionKey || row.id;
    const roundupRows = await buildFactionRoundup(worldId, factionKey);
    await saveFactionEntry(worldId, { ...raw, id: row.id, factionKey }, roundupRows);
    return;
  }
  await writeEntry(worldId, category, { ...raw, id: row.id });
}

// Walks every entry in the world whose registered reference fields might
// point at (category, id); `mutate(raw)` returns true if it changed
// anything, in which case the entry is re-saved.
async function forEachReferencingEntry(worldId, mutate) {
  const ruleset = await getRuleset(worldId);
  const counts = { updated: 0, failed: 0 };
  for (const cat of ALL_CATEGORIES) {
    const fields = getLinkFields(ruleset, cat);
    if (!fields.length) continue;
    const rows = await listEntries(worldId, cat, { locked: false });
    for (const row of rows) {
      if (!row.raw) continue;
      const raw = JSON.parse(JSON.stringify(row.raw));
      if (!mutate(cat, fields, raw, row)) continue;
      try {
        await resaveRaw(worldId, cat, row, raw);
        counts.updated++;
      } catch (err) {
        counts.failed++;
        console.error(`Reference cleanup: re-saving ${cat}/${row.id} failed:`, err && err.message);
      }
    }
  }
  return counts;
}

// Audit item 7: a rename flows into every other entry's stored label for
// it -- but only where the label still EXACTLY equals the old name, so a
// DM's own custom wording ("the old Pact") is never overwritten.
async function propagateEntryRename(worldId, category, entryId, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return { updated: 0, failed: 0 };
  return forEachReferencingEntry(worldId, (cat, fields, raw, row) => {
    if (cat === category && row.id === entryId) return false;
    let changed = false;
    for (const field of fields) {
      if (field.type === FIELD_TYPES.ID_POINTER) continue; // prose label -- leave it
      const arr = getPath(raw, field.arrayPath);
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!itemPointsAt(field, item, category, entryId)) continue;
        const labelKey = field.type === FIELD_TYPES.NAME_ONLY_ARRAY ? "name" : field.labelField;
        if (item[labelKey] === oldName) { item[labelKey] = newName; changed = true; }
      }
    }
    return changed;
  });
}

// Audit item 6 (any category): after an entry is deleted, clear every
// stored id that pointed at it (labels stay, as plain text). Without this
// a later entry that happens to get the same slug silently inherited
// every old link. Faction relationships to a deleted FACTION are removed
// outright instead (see removeRelationshipsToFaction) -- a stance toward
// a faction that no longer exists isn't worth keeping.
async function detachReferencesToDeletedEntry(worldId, category, entryId) {
  return forEachReferencingEntry(worldId, (cat, fields, raw) => {
    let changed = false;
    for (const field of fields) {
      if (field.type === FIELD_TYPES.ID_POINTER) {
        if (field.target === category && getPath(raw, field.idPath) === entryId) {
          setPath(raw, field.idPath, null);
          changed = true;
        }
        continue;
      }
      const arr = getPath(raw, field.arrayPath);
      if (!Array.isArray(arr)) continue;
      if (cat === "factions" && category === "factions" && field.arrayPath === "relationships") {
        const kept = arr.filter((item) => !itemPointsAt(field, item, category, entryId));
        if (kept.length !== arr.length) { setPath(raw, field.arrayPath, kept); changed = true; }
        continue;
      }
      for (const item of arr) {
        if (!itemPointsAt(field, item, category, entryId)) continue;
        item[field.type === FIELD_TYPES.NAME_ONLY_ARRAY ? "id" : field.idField] = null;
        changed = true;
      }
    }
    return changed;
  });
}

// Audit item 6 (Austin: "all goes to unaligned"): every entry whose
// faction was the deleted faction becomes Unaligned, re-saved through its
// normal writer so the dossier's "Faction:" line and subtitle update too.
// Relationships from name-only (unresolved) faction relationships that
// still name the deleted faction are removed as well.
async function unalignFactionMembers(worldId, factionKey, factionName) {
  const counts = { unaligned: 0, relationshipsRemoved: 0, failed: 0 };
  for (const cat of ALL_CATEGORIES) {
    const rows = await listEntries(worldId, cat, { locked: false });
    for (const row of rows) {
      if (!row.raw) continue;
      const raw = JSON.parse(JSON.stringify(row.raw));
      let changed = false;
      if (cat !== "factions" && (row.faction === factionKey || raw.faction === factionKey)) {
        raw.faction = UNALIGNED_VALUE[cat] || null;
        changed = true;
        counts.unaligned++;
      }
      if (cat === "factions" && Array.isArray(raw.relationships) && factionName) {
        const kept = raw.relationships.filter((r) => !(r && !r.toId && r.faction === factionName));
        if (kept.length !== raw.relationships.length) {
          counts.relationshipsRemoved += raw.relationships.length - kept.length;
          raw.relationships = kept;
          changed = true;
        }
      }
      if (!changed) continue;
      try {
        await resaveRaw(worldId, cat, row, raw);
      } catch (err) {
        counts.failed++;
        console.error(`Faction delete cleanup: re-saving ${cat}/${row.id} failed:`, err && err.message);
      }
    }
  }
  return counts;
}

module.exports = { propagateEntryRename, detachReferencesToDeletedEntry, unalignFactionMembers, UNALIGNED_VALUE, ALL_CATEGORIES };
