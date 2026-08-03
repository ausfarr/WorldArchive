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

MATCHING RULE: for each stage, first check whether an existing Quest from the roster below genuinely fits that point in the arc. Only set "matched": false if nothing fits -- do not force a loose match, and do not invent a Quest id that isn't on the roster. An unmatched stage with a clear concept is a normal, expected outcome for a new campaign, not a failure.

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
