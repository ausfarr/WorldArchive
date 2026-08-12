// prompts/campaignModulePrompt.js
//
// Campaign Structure -- see session_addendum_campaign_structure_scope.md
// for the full design conversation. Unlike every other generator, this
// one is explicitly forbidden from inventing new NPCs/Locations/Items/
// Logs -- it picks real ids from the world's own roster (same "reference
// real entries, never invent" principle already locked for Locations'
// Notable NPCs field), and for any role it can't fill from what exists,
// it reports the gap instead of making something up. The gap-filling
// itself (generating a real new entry to plug that gap) happens as a
// separate, explicit, DM-approved step -- see routes/campaignModule.js's
// /generate-slot-entry -- never automatically inside this call.
//
// Reuses lib/roster.js's existing buildRosterContext/buildLocationRoster
// Context/buildItemRosterContext/buildLogRosterContext AS-IS -- these
// already format as "- id: X | Name: ..." real-id listings (the exact
// format Locations' own generator already feeds the model to ground its
// Notable NPCs picks), so no new roster-building code was needed here.
//
// CATEGORY-AWARE (see session_addendum_beta_feedback_batch3.md, Fix 1):
// a world can disable any of these 5 categories in Wizard Step 7
// (category_config_json), which hides that category's nav link and page
// entirely -- so the model must never be offered a disabled category as
// an option, or a DM ends up with a Quest slot pointing at content they
// have no page to view. routes/campaignModule.js computes the effective
// (enabled) category set and passes it in here; both the schema's
// "category" enum and the per-category roster sections are built only
// from that set, not the fixed 5.

const { buildCacheableSystemPrompt } = require("../lib/claude");

const CATEGORY_INFO = {
  npcs: { displayName: "NPCs", rosterTitle: "NPC ROSTER", rosterInstruction: 'pick "entryId" values only from this list for category "npcs"' },
  locations: { displayName: "Locations", rosterTitle: "LOCATION ROSTER", rosterInstruction: 'pick "entryId" values only from this list for category "locations"' },
  items: { displayName: "Items", rosterTitle: "ITEM ROSTER", rosterInstruction: 'pick "entryId" values only from this list for category "items"' },
  logs: { displayName: "Logs", rosterTitle: "LOG ROSTER", rosterInstruction: 'pick "entryId" values only from this list for category "logs"' },
  enemies: {
    displayName: "Enemies",
    rosterTitle: "ENEMY ROSTER",
    rosterInstruction: "pick \"entryId\" values only from this list for category \"enemies\" -- prefer an enemy whose faction matches the encounter Location's controlling faction, where that's on record"
  }
};
const CATEGORY_ORDER = ["npcs", "locations", "items", "logs", "enemies"];

function joinWithAnd(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function buildSchemaDescription(enabledCategories) {
  const categoryEnum = enabledCategories.map((c) => `"${c}"`).join(" | ");
  return `{
  "name": "Quest/module title",
  "summary": "1-2 sentence DM-facing summary of the throughline",
  "entries": [
    {
      "category": ${categoryEnum},
      "role": "short free-text role, e.g. \\"quest-giver\\", \\"encounter site\\", \\"encounter monster\\", \\"reward\\", \\"clue\\"",
      "matched": true or false,
      "entryId": "the exact id of an existing roster entry -- ONLY when matched is true, otherwise null",
      "note": "short DM-facing note on how this piece fits the quest",
      "neededConcept": "ONLY when matched is false -- a short concept description (1 sentence) for what kind of new entry would fill this role, e.g. \\"a corrupt tower guard who demands a bribe\\""
    }
  ]
}`;
}

function buildStaticInstructions(enabledCategories) {
  const displayNames = enabledCategories.map((c) => CATEGORY_INFO[c].displayName);
  const categoryPhrase = joinWithAnd(displayNames);
  const hasEnemies = enabledCategories.includes("enemies");
  const hasLocations = enabledCategories.includes("locations");

  return `You are assembling a Campaign Module (a quest/adventure structure) for a tabletop RPG world archive, by picking from EXISTING ${categoryPhrase} already generated for this world -- not by inventing new content. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

WHAT A CAMPAIGN MODULE IS: a DM-facing structure that ties together a quest-giver${hasLocations ? ", one or more encounter sites (Locations) with what actually populates them" : ""}${hasEnemies ? " (Enemies)" : ""}, rewards, and optionally clues/lore into something a DM could run at the table. It references existing archive content -- it does not create new lore beyond the short connective summary and per-entry notes. This world only has ${categoryPhrase} enabled as content categories -- never propose a category outside that list, and never reference or invent an id in a category that isn't listed.

MATCHING RULE (the most important rule here): for every role the quest needs, first look for a real existing entry from the rosters below that genuinely fits. Only set "matched": false if nothing in the roster is a reasonable fit -- do not force a loose match just to avoid an unmatched slot, and do not invent a new entry id that isn't on the roster. An unmatched slot with a clear neededConcept is a GOOD outcome, not a failure -- the DM will decide whether to generate something new to fill it.

ROLE VARIETY: a typical module has 3-7 entries -- usually at least one NPC (quest-giver or key contact)${hasLocations ? ", one Location (the encounter/destination)" : ""}${hasEnemies ? ", and often one or more Enemies (what the party actually fights there)" : ""}, an Item (reward), and/or a Log (a clue or piece of lore), whichever of those are on the enabled-category list above -- not every module needs all of them, fit the roles to what actually makes sense for the concept, don't pad.${hasLocations && hasEnemies ? ' An "encounter" without at least one Enemy attached is usually incomplete for a combat-capable quest -- if the concept implies a fight, look for a real Enemy that fits the same Location\'s faction/danger tags before leaving that slot unmatched.' : ""}

NOTES: each entry's "note" is a short DM-facing line on how that specific piece fits this specific quest (e.g. "Withholds the tower's location until paid" for an NPC, "The cipher only decodes once the tower's signal is silenced" for an Item, "Guards the tower's lower level" for an Enemy) -- not a restatement of what the entry already says on its own dossier page.

Return JSON matching this exact schema:
${buildSchemaDescription(enabledCategories)}`;
}

function buildCampaignModuleSystemPrompt({ settingContext, loreContext, npcRosterText, locationRosterText, itemRosterText, logRosterText, enemyRosterText, concept, effectiveCategories }) {
  const rosterTextByCategory = { npcs: npcRosterText, locations: locationRosterText, items: itemRosterText, logs: logRosterText, enemies: enemyRosterText };
  // effectiveCategories is a Set built by routes/campaignModule.js from the
  // world's live category_config_json -- fall back to the full fixed set
  // only if a caller omits it (keeps this function safe to call directly).
  const enabledCategories = CATEGORY_ORDER.filter((c) => (effectiveCategories ? effectiveCategories.has(c) : true));

  const rosterSections = enabledCategories
    .map((c) => `${CATEGORY_INFO[c].rosterTitle} (${CATEGORY_INFO[c].rosterInstruction}):\n${rosterTextByCategory[c]}`)
    .join("\n\n");

  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

WORLD LORE -- GROUND TRUTH (stay consistent with this):
${loreContext || "(no lore saved yet for this world)"}

${rosterSections}

USER INPUT:
Concept: ${concept || "invent a quest concept fitting this world's lore and existing roster -- look for pieces that already connect (shared faction, shared location) and build around that"}`;

  return buildCacheableSystemPrompt(buildStaticInstructions(enabledCategories), dynamicContext);
}

module.exports = { buildCampaignModuleSystemPrompt };
