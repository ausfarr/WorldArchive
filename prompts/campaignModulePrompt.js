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

const { buildCacheableSystemPrompt } = require("../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "name": "Quest/module title",
  "summary": "1-2 sentence DM-facing summary of the throughline",
  "entries": [
    {
      "category": "npcs" | "locations" | "items" | "logs",
      "role": "short free-text role, e.g. \\"quest-giver\\", \\"encounter site\\", \\"reward\\", \\"clue\\"",
      "matched": true or false,
      "entryId": "the exact id of an existing roster entry -- ONLY when matched is true, otherwise null",
      "note": "short DM-facing note on how this piece fits the quest",
      "neededConcept": "ONLY when matched is false -- a short concept description (1 sentence) for what kind of new entry would fill this role, e.g. \\"a corrupt tower guard who demands a bribe\\""
    }
  ]
}`;

const STATIC_INSTRUCTIONS = `You are assembling a Campaign Module (a quest/adventure structure) for a tabletop RPG world archive, by picking from EXISTING NPCs, Locations, Items, and Logs already generated for this world -- not by inventing new content. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

WHAT A CAMPAIGN MODULE IS: a DM-facing structure that ties together a quest-giver, one or more encounter sites (Locations), rewards (Items), and optionally clues/lore (Logs) into something a DM could run at the table. It references existing archive content -- it does not create new lore beyond the short connective summary and per-entry notes.

MATCHING RULE (the most important rule here): for every role the quest needs, first look for a real existing entry from the rosters below that genuinely fits. Only set "matched": false if nothing in the roster is a reasonable fit -- do not force a loose match just to avoid an unmatched slot, and do not invent a new NPC/Location/Item/Log id that isn't on the roster. An unmatched slot with a clear neededConcept is a GOOD outcome, not a failure -- the DM will decide whether to generate something new to fill it.

ROLE VARIETY: a typical module has 3-6 entries -- usually at least one NPC (quest-giver or key contact), one Location (the encounter/destination), and often an Item (reward) and/or a Log (a clue or piece of lore). Not every module needs all four categories -- fit the roles to what actually makes sense for the concept, don't pad.

NOTES: each entry's "note" is a short DM-facing line on how that specific piece fits this specific quest (e.g. "Withholds the tower's location until paid" for an NPC, "The cipher only decodes once the tower's signal is silenced" for an Item) -- not a restatement of what the entry already says on its own dossier page.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildCampaignModuleSystemPrompt({ settingContext, loreContext, npcRosterText, locationRosterText, itemRosterText, logRosterText, concept }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

WORLD LORE -- GROUND TRUTH (stay consistent with this):
${loreContext || "(no lore saved yet for this world)"}

NPC ROSTER (pick "entryId" values only from this list for category "npcs"):
${npcRosterText}

LOCATION ROSTER (pick "entryId" values only from this list for category "locations"):
${locationRosterText}

ITEM ROSTER (pick "entryId" values only from this list for category "items"):
${itemRosterText}

LOG ROSTER (pick "entryId" values only from this list for category "logs"):
${logRosterText}

USER INPUT:
Concept: ${concept || "invent a quest concept fitting this world's lore and existing roster -- look for pieces that already connect (shared faction, shared location) and build around that"}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildCampaignModuleSystemPrompt };
