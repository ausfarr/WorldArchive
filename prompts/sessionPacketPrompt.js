// prompts/sessionPacketPrompt.js
//
// Session Prep Companion, Phase 4 (Tier B -- see
// session_prep_companion_scope.md Section 3). A Session Packet is a
// full generative prep document for one Quest or Campaign, grounded
// EXCLUSIVELY in that Quest/Campaign's own assembled roster (lib/
// sessionAssembly.js's assembleSessionContext output) -- same "reference
// real ids, never invent" discipline as the Campaign Arc planner and
// Quest generator: every NPC/location/item/enemy a scene beat names must
// resolve to a real id from the roster below.

const { buildCacheableSystemPrompt } = require("../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "title": "short session packet title",
  "openingReadAloud": "2-4 sentences of boxed read-aloud text the DM can read verbatim to open the session -- scene-setting, not a summary of the whole quest",
  "sceneBeats": [
    {
      "title": "short beat title",
      "description": "1-3 sentences: what happens in this beat and what the DM should be ready to run",
      "taggedEntries": [
        { "category": "npcs | locations | items | logs | enemies", "entryId": "a real id from the roster below", "note": "why this entry matters in this specific beat" }
      ]
    }
  ],
  "npcVoiceReminders": [
    { "entryId": "a real NPC id from the roster below", "reminder": "one line reminding the DM how to voice/play this NPC RIGHT NOW -- pull from their existing speech pattern/contradiction/wants, don't invent new personality" }
  ],
  "complicationsDeck": [
    { "title": "short complication title", "description": "1-2 sentences: an optional curveball the DM can introduce if the table needs a jolt -- not required to use" }
  ],
  "openThreads": [
    "1 sentence each -- an unresolved thread carried forward from prior sessions (from PRIOR SESSION CHRONICLES below) that this session could pick back up. Empty array if there's no prior session history yet."
  ]
}`;

// STATIC — identical for every call, every world. Cached.
const STATIC_INSTRUCTIONS = `You are assembling a Session Packet -- a complete prep document a DM reads through right before running a tabletop RPG session -- for ONE specific Quest or Campaign already built in this world's archive. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

CRITICAL -- REFERENCE REAL IDS, NEVER INVENT: every entryId in taggedEntries and npcVoiceReminders MUST be a real id from the ASSEMBLED ROSTER below. Never invent an NPC, location, item, or enemy that isn't already in that roster -- this is prep for content that already exists, not a request to generate new content. If the roster is thin (few or no entries in some category), work with what's actually there rather than inventing to fill a gap.

OPENING READ-ALOUD: scene-setting prose the DM can read verbatim to open the table -- grounded in the roster's locations/mood, not a recap of the whole quest's plot.

SCENE BEATS: 3-5 beats, each tagging the specific real roster entries that beat actually involves. Beats should follow a sensible session arc (opening, rising complication, climax/decision point) -- not just a flat list of "things that exist."

NPC VOICE REMINDERS: for every NPC likely to speak this session (drawn from taggedEntries across your scene beats), a one-line reminder of how to PLAY them RIGHT NOW -- pull directly from that NPC's own existing speech pattern/contradiction/wants (given in the roster below), never invent new personality traits for them here.

COMPLICATIONS DECK: 2-4 optional curveballs the DM can pull out if the table needs a jolt -- genuinely optional, framed as "if you need one," not more required plot.

OPEN THREADS: pull from PRIOR SESSION CHRONICLES below, if any exist -- unresolved consequences, promises, or threats from past sessions this one could pick back up. Empty array if this is the first session for this Quest/Campaign (the normal case until session history builds up).

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildSessionPacketSystemPrompt({ settingContext, loreContext, rosterContext, mapContext, priorChroniclesContext, concept }) {
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

WORLD LORE -- GROUND TRUTH (stay consistent with this):
${loreContext || "(no lore saved yet for this world)"}

ASSEMBLED ROSTER FOR THIS QUEST/CAMPAIGN (the ONLY entries you may tag in taggedEntries/npcVoiceReminders -- never invent an id not on this list):
${rosterContext}

LINKED BATTLE/DUNGEON MAP(S):
${mapContext || "(no battle map generated for this Quest/Campaign yet)"}

PRIOR SESSION CHRONICLES (for openThreads -- empty/none is normal for a first session):
${priorChroniclesContext || "(no prior sessions recorded yet for this Quest/Campaign)"}

${concept ? `DM'S FOCUS FOR THIS SESSION: ${concept}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildSessionPacketSystemPrompt };
