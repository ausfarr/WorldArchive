// prompts/campaignArcPrompt.js
//
// Campaigns (story arcs) -- see session_addendum_campaign_arcs_shipped.md.
// Deliberately a LIGHTWEIGHT planning call, not a nested quest generator:
// it proposes a named arc broken into ordered stages, and for each stage
// either matches an existing Quest (from campaign_modules) or flags that
// one needs to be created. It never generates full Quest content itself
// -- creating an unmatched stage's Quest happens as its own separate,
// DM-reviewed step through the existing single-Quest generation flow
// (routes/campaignModule.js), which already has its own preview/approve/
// unmatched-slot handling. Nesting that entire flow inside arc generation
// would mean a preview containing previews -- this keeps the cost and
// the UI predictable: one call for the arc's shape, no matter how many
// stages it has.

const { buildCacheableSystemPrompt } = require("../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "name": "Campaign/arc title",
  "summary": "1-2 sentence DM-facing summary of the overall throughline across all stages",
  "stages": [
    {
      "title": "short stage title, e.g. \\"The Vanishing Signal\\"",
      "matched": true or false,
      "questId": "the exact id of an existing Quest from the roster below -- ONLY when matched is true, otherwise null",
      "concept": "ONLY when matched is false -- a short concept description (1-2 sentences) for what this stage's Quest should be about, written so it could be handed directly to the Quest generator as a starting concept"
    }
  ]
}`;

const STATIC_INSTRUCTIONS = `You are planning a Campaign (a multi-stage story arc) for a tabletop RPG world archive, by sequencing stages that either reuse an EXISTING Quest already built for this world, or describe a concept for a new one -- you do NOT write full Quest content yourself here, only the arc's shape. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

MATCHING RULE -- READ CAREFULLY, this is NOT the same bar as matching a single NPC or Location: matching a whole existing Quest to a stage is a MUCH higher bar than matching one small entry, because a Quest already has its own committed theme, characters, and story -- it is not a flexible, generic piece that can be repurposed into any arc just because it technically doesn't contradict the setting. Only set "matched": true if the existing Quest's own actual content -- its faction, its antagonist, its stakes, its location -- genuinely and specifically connects to what THIS stage of THIS arc needs. "It's a quest in the same world and nothing about it is wrong" is NOT enough to justify a match. Before marking a stage matched, ask yourself: if I read this existing Quest's summary next to this arc's concept, would a DM be surprised these two were called the same story? If yes, do not match it -- set "matched": false with a real concept for a new one instead. An unmatched stage is the NORMAL, EXPECTED, GOOD outcome for a new campaign, especially one built around a concept unrelated to what's already been generated for this world -- do not treat unmatched stages as something to avoid.

IF THE DM GAVE A SPECIFIC CONCEPT (see USER INPUT below): that concept is the priority, full stop. Build the arc around what they actually described. Do not bend the arc toward reusing an existing Quest that doesn't truly fit just because it's available -- an arc that ignores unrelated existing content in favor of the DM's actual concept is doing its job correctly; an arc that shoehorns in unrelated existing Quests to avoid unmatched stages is not.

Never invent a Quest id that isn't on the roster below, whether or not you set "matched": true -- an id must be real or "questId" must be null.

ARC SHAPE: stages should build on each other -- rising stakes, a throughline connecting them (a shared antagonist, a shared goal, escalating consequences), not a random unconnected list. If the DM specified a stage count, use exactly that many. If not, 3 is a reasonable default -- don't pad beyond what the concept actually supports.

CONCEPT FIELD (for unmatched stages): write it as a real starting concept for a single quest, in the same register as what a DM would type into the Quest generator's own concept field -- specific enough to ground a real quest, not a vague theme.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildCampaignArcSystemPrompt({ settingContext, loreContext, questRosterText, stageCount, concept }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

WORLD LORE -- GROUND TRUTH (stay consistent with this):
${loreContext || "(no lore saved yet for this world)"}

EXISTING QUEST ROSTER (pick "questId" values only from this list -- these are already-built Quests in this world, each referencing its own NPCs/Locations/Items/Logs/Enemies):
${questRosterText}

USER INPUT:
Stage count: ${stageCount || "use your judgment (3 is a reasonable default)"}
Concept: ${concept || "invent a campaign arc fitting this world's lore -- look for an existing Quest that could plausibly be an early stage and build outward from it if one fits"}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildCampaignArcSystemPrompt };
