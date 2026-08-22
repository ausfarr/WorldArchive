// lib/sessionAssembly.js
//
// Session Prep Companion -- Phase 1 (see session_prep_companion_scope.md
// Section 2, "The Core Loop"). Pure assembly layer, zero AI cost: given a
// Quest (campaign_modules row) or a Campaign (campaign_arcs row, which
// references an ordered list of Quests), resolves everything a later
// generative step (Phase 4's Session Packet, Phase 5's Chronicle) needs
// as grounding context.
//
// Reuses existing machinery throughout, per the session's working norms
// ("this build reuses that machinery, it doesn't replace it"):
//   - lib/campaignModuleRepo.js / lib/campaignArcRepo.js for the Quest/
//     Campaign rows themselves.
//   - lib/roster.js's readXEntry() functions to resolve entries_json's
//     bare {category, entryId} references into real entry records --
//     same functions routes/campaignModule.js already uses to hydrate a
//     Quest preview.
//   - A Location entry's own raw.dungeonMap field (see routes/dungeonMap.js)
//     for the linked battle/dungeon map -- no new storage, just reading
//     what's already there.
//
// PRIOR CHRONICLE CONTRACT (forward-declared here, implemented Phase 5):
// a Session Chronicle is a Logs-category entry whose manifest row carries
// a top-level `sessionChronicle` object: { questId, campaignId,
// sessionNumber, worldDate }. Phase 5's saveLogEntry() must mirror
// log.sessionChronicle onto entryMeta.sessionChronicle the same way
// lib/fileWriter.js's saveLogEntry() already mirrors log.logType onto
// entryMeta.logType -- entriesRepo.js's rowToManifestEntry spreads the
// full entryMeta (not just the nested `raw` model-output object) onto
// every manifest row, so any field read here must exist at that
// top level, not only inside `raw`. getPriorChronicles() below already
// queries for this shape so this file needs no changes once Phase 5
// lands -- until then it always returns an empty array, since no log has
// ever set that field.

const { getCampaignModule } = require("./campaignModuleRepo");
const { getCampaignArc } = require("./campaignArcRepo");
const {
  readNpcEntry,
  readLocationEntry,
  readItemEntry,
  readLogEntry,
  readEnemyEntry,
  readSurvivorEntry,
  readClassEntry,
  readFactionEntry,
  readLogManifest
} = require("./roster");

// Category -> reader function, covering every category a Quest's
// entries_json can reference (VALID_ENTRY_CATEGORIES in
// routes/campaignModule.js: npcs/locations/items/logs/enemies) plus the
// other three for completeness/future-proofing, since nothing here is
// specific to the 5-category Quest-slot restriction.
const ENTRY_READERS = {
  npcs: readNpcEntry,
  locations: readLocationEntry,
  items: readItemEntry,
  logs: readLogEntry,
  enemies: readEnemyEntry,
  survivors: readSurvivorEntry,
  classes: readClassEntry,
  factions: readFactionEntry
};

// Resolves one Quest's entries_json into real entry records. Tolerates a
// dangling reference (entry deleted since the Quest referenced it) by
// silently dropping it -- same "drift is handled gracefully at read time,
// not a DB constraint" posture documented in migrations/009_campaign_modules.sql.
async function resolveQuestEntries(worldId, quest) {
  const resolved = [];
  for (const ref of quest.entries || []) {
    const reader = ENTRY_READERS[ref.category];
    if (!reader) continue;
    const entry = await reader(worldId, ref.entryId);
    if (!entry) continue;
    resolved.push({ category: ref.category, entryId: ref.entryId, role: ref.role || "", note: ref.note || "", entry });
  }
  return resolved;
}

// Pulls the linked battle/dungeon map(s) for a Quest -- any Location
// among its resolved entries that has a raw.dungeonMap set (see
// routes/dungeonMap.js's storage shape: { imageUrl, gridSize,
// generatedAt }). A Quest can reference more than one Location, so this
// returns an array, not a single map -- empty array is the normal case
// for a Quest that never generated/uploaded one.
function extractDungeonMaps(resolvedEntries) {
  return resolvedEntries
    .filter((r) => r.category === "locations" && r.entry && r.entry.dungeonMap)
    .map((r) => ({ locationId: r.entryId, locationName: r.entry.name, dungeonMap: r.entry.dungeonMap }));
}

// Prior confirmed Session Chronicles for this Quest/Campaign -- see this
// file's header comment for the raw.sessionChronicle contract Phase 5
// will write. Returns [] until Phase 5 exists (no log will ever match),
// by design -- built now because Tier B (Phase 4's Session Packet) needs
// this same query shape as an input, per the scope doc's Section 3
// sequencing note.
//
// No server-side JSON filter is available here (entriesRepo.listEntries
// only pushes world/category/locked into the query) -- same "fetch the
// manifest, filter client-side" pattern lib/roster.js's own context
// builders already use for this table, bounded by the same low realistic
// log-count-per-world beta scale.
async function getPriorChronicles(worldId, { questId, campaignId, questIds } = {}) {
  const manifest = await readLogManifest(worldId, { locked: false });
  const targetQuestIds = new Set(questIds || (questId ? [questId] : []));

  const matches = manifest.filter((m) => {
    const chronicle = m.sessionChronicle;
    if (!chronicle) return false;
    if (campaignId && chronicle.campaignId === campaignId) return true;
    if (chronicle.questId && targetQuestIds.has(chronicle.questId)) return true;
    return false;
  });

  matches.sort((a, b) => (a.sessionChronicle.sessionNumber || 0) - (b.sessionChronicle.sessionNumber || 0));
  return matches;
}

// The single entry point later phases call into. Exactly one of
// questId/campaignId should be passed -- a Campaign assembles context
// across every Quest it references (in order), a bare Quest assembles
// just its own.
async function assembleSessionContext(worldId, { questId, campaignId } = {}) {
  if (!questId && !campaignId) {
    throw new Error("assembleSessionContext requires a questId or campaignId");
  }

  let campaign = null;
  let quests = [];

  if (campaignId) {
    campaign = await getCampaignArc(worldId, campaignId);
    if (!campaign) throw new Error(`assembleSessionContext: campaign '${campaignId}' not found`);
    const fetched = await Promise.all(campaign.questIds.map((id) => getCampaignModule(worldId, id)));
    quests = fetched.filter(Boolean); // tolerate a quest deleted since the Campaign referenced it
  } else {
    const quest = await getCampaignModule(worldId, questId);
    if (!quest) throw new Error(`assembleSessionContext: quest '${questId}' not found`);
    quests = [quest];
  }

  const questContexts = [];
  for (const quest of quests) {
    const resolvedEntries = await resolveQuestEntries(worldId, quest);
    questContexts.push({
      quest,
      resolvedEntries,
      dungeonMaps: extractDungeonMaps(resolvedEntries)
    });
  }

  const priorChronicles = await getPriorChronicles(worldId, {
    questId: questId || null,
    campaignId: campaignId || null,
    questIds: quests.map((q) => q.id)
  });

  return {
    questId: questId || null,
    campaignId: campaignId || null,
    campaign,
    quests: questContexts,
    priorChronicles
  };
}

module.exports = { assembleSessionContext, getPriorChronicles, resolveQuestEntries, extractDungeonMaps };
