// lib/entryWriters.js
//
// "Which writer saves this category, for this world's ruleset" -- moved
// verbatim out of routes/confirmEntry.js (bug batch 1 audit, item 6) so
// the faction-delete cleanup (lib/factionCleanup.js) can re-save member
// entries through exactly the same writers /confirm-entry uses, instead
// of a second copy of this ruleset branching drifting out of sync.
// Factions are NOT here: they need a freshly computed Roundup and go
// through saveFactionEntry() directly (see confirmEntry.js's faction
// branch).

const {
  saveNpcEntry,
  saveEnemyEntry,
  saveItemEntry,
  saveSurvivorEntry,
  saveLogEntry,
  saveClassEntry,
  saveLocationEntry,
  saveSessionPacketEntry,
  getPortraitUrl
} = require("./fileWriter");
const { getRuleset, getGenericSystem } = require("./worldConfigRepo");
const { save5eEnemyEntry } = require("./rulesets/5e/enemyRepo");
const { save5eSpellEntry } = require("./rulesets/5e/spellRepo");
const { save5eClassEntry } = require("./rulesets/5e/classRepo");
const { saveGenericClassEntry } = require("./rulesets/generic/classRepo");
const { save5eItemEntry } = require("./rulesets/5e/itemRepo");
const { saveGenericItemEntry } = require("./rulesets/generic/itemRepo");
const { save5eSurvivorEntry } = require("./rulesets/5e/survivorRepo");
const { saveGenericSurvivorEntry } = require("./rulesets/generic/survivorRepo");
const { saveGenericEnemyEntry } = require("./rulesets/generic/enemyRepo");

// Shared write path for every non-faction category.
const WRITERS = {
  npcs: saveNpcEntry,
  enemies: saveEnemyEntry,
  items: saveItemEntry,
  survivors: saveSurvivorEntry,
  logs: saveLogEntry,
  classes: saveClassEntry,
  locations: saveLocationEntry,
  // Session Prep Companion, Phase 4 -- see routes/generateSessionPacket.js.
  "session-packets": saveSessionPacketEntry,
  // "spells" -- only 5e has a `spells` registry entry today. Echoes/
  // generic worlds can never reach this writer since
  // requireCategoryAvailable already turned their /generate-spell
  // request away with a 501 (see lib/rulesets/index.js).
  spells: save5eSpellEntry
};

// Categories whose writer function accepts a third imageUrl argument
// (logs don't have portraits at all). Regenerate never touches images —
// without this, confirming a regenerate would silently overwrite a
// previously-working portrait's URL with nothing, reverting the dossier
// to the dead relative-path placeholder every single time.
const HAS_PORTRAIT = {
  npcs: true,
  enemies: true,
  items: true,
  survivors: true,
  classes: true,
  locations: true
};

// Multi-ruleset genericization: 5e and generic worlds have their own
// writers for enemies/classes/items/survivors; WRITERS stays the Echoes
// default. Generic writers need this world's generic_system_json as an
// extra argument (attribute/derived-stat definitions aren't fixed) and
// are called with an undefined imageUrl, exactly as before the move.
//
// Returns true if written, false for an unknown category.
async function writeEntry(worldId, category, entry) {
  let writer = WRITERS[category];
  const rulesetSensitive = { enemies: [save5eEnemyEntry, saveGenericEnemyEntry], classes: [save5eClassEntry, saveGenericClassEntry], items: [save5eItemEntry, saveGenericItemEntry], survivors: [save5eSurvivorEntry, saveGenericSurvivorEntry] };
  if (rulesetSensitive[category]) {
    const ruleset = await getRuleset(worldId);
    const [fiveE, generic] = rulesetSensitive[category];
    if (ruleset === "5e") writer = fiveE;
    else if (ruleset === "generic") {
      const genericSystem = await getGenericSystem(worldId);
      await generic(worldId, entry, genericSystem, undefined);
      return true;
    }
  }
  if (!writer) return false;
  const imageUrl = HAS_PORTRAIT[category] ? getPortraitUrl(worldId, entry.id) : undefined;
  await writer(worldId, entry, imageUrl);
  return true;
}

module.exports = { writeEntry, WRITERS, HAS_PORTRAIT };
