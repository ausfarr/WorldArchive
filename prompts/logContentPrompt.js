// prompts/logContentPrompt.js
//
// Generic found-text generator (audio transcripts, journal entries,
// terminal dumps). Replaces the Echoes-specific version, which hardcoded
// the setting name, a fixed 4-faction enum, and the Hex-Tongue intercept
// mechanic (dropped entirely — see enemyContentPrompt.js's header comment
// for the same reasoning/decision).

// PROMPT CACHING: see prompts/npcContentPrompt.js's header comment for
// the split rationale.

const { buildCacheableSystemPrompt } = require("../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Log Title",
  "logType": "Audio | Journal | Terminal",
  "locationContext": "where/how this would be found in-game, e.g. 'East Platform, Subway Substructure'",
  "locationId": "an id from LOCATIONS below if an already-archived Location genuinely matches where this would be found, else null -- do not invent one; fine and expected to be null if nothing fits or none archived yet",
  "characters": "who this belongs to/features (name or role), or 'none' if no clear human voice",
  "context": "one sentence flavor: what this artifact is physically, and the circumstances of its recovery",
  "bodyText": "the actual found-text content, plain text with real line breaks — timestamped transcript for Audio, dated entries for Journal, system/terminal dump for Terminal. Keep it short: a found artifact, not a short story.",
  "faction": "one of this world's faction ids (see FACTIONS below), or null for personal/civic/unaffiliated logs",
  "designNotes": "1-2 sentences: what this reveals to the player, and how it avoids repeating a character/location/beat already generated",
  "resolvedDate": "{ \\"year\\": integer, \\"monthIndex\\": integer, \\"day\\": integer } -- ONLY if bodyText references a specific in-world date/timeframe (\\"Day 12 of the siege\\", \\"three nights after the collapse\\") that can be resolved against the calendar below; null if nothing in the content grounds to a specific date, which is normal for most atmospheric/personal logs",
  "resolvedDateSubject": "{ \\"category\\": \\"factions|npcs|survivors|items\\", \\"entryId\\": \\"a real id from the roster/known-dates context below\\", \\"dateField\\": \\"foundingDate|birthDate|appointedDate|deathDate|createdDate|discoveredDate\\" } -- ONLY when resolvedDate is set AND this log's content establishes or confirms a canonical date fact about ONE SPECIFIC existing entry (e.g. this log narrates an NPC's death, so category=\\"npcs\\", dateField=\\"deathDate\\"); never invent an id -- must be real; null if resolvedDate doesn't concern any specific existing entry, or if resolvedDate itself is null"
}`;

// STATIC — identical for every call, every world. Cached.
const STATIC_INSTRUCTIONS = `You are generating found-text content for a tabletop/game world archive — recordings, terminal logs, and journal entries the player can discover. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

LOG TYPES:
- Audio: transcript of a spoken recording, timestamped with speaker tags. Conversational, fragmented under stress — people don't narrate cleanly when dying or scared.
- Journal: handwritten/typed personal entries. More reflective than audio; can span a few dated entries if it tells a short arc. Intimate tone, sometimes darkly funny.
- Terminal: computer/system output — error dumps, memos, security logs, automated messages. Tone should match its source faction's voice (derive from the lore provided below) or read as plain civic/municipal system output if unaffiliated.

Personal/emotional beats (a death, a goodbye, a discovery) suit Audio or Journal. World-building/faction lore suits Terminal. If genuinely unsure, Terminal is the safest default.

ANCHOR IT: never a floating, unanchored snippet — tie it to a specific location, character, or event (invent something concrete if not given).

KEEP IT SHORT: this is a found artifact, not a short story. A few lines of audio/journal, or a compact terminal dump.

DATE RESOLUTION (resolvedDate/resolvedDateSubject): most logs don't reference a resolvable date -- leave both null unless the content genuinely implies one. CRITICAL -- CANONICAL DATES ALREADY WIN: the KNOWN CANONICAL DATES block below lists entries that already have a real dated fact on record (a founding, a birth, a death, etc.). If this log's content touches on one of those same entries/events, your prose must stay CONSISTENT with the date already shown there -- never invent a different date for something already dated. Only set resolvedDate/resolvedDateSubject when this log is the FIRST place a date is being established for something not already in that list.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildLogContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, locationRosterText, name, logType, existingContent, campaignContext, calendarContext, knownDatesContext }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  // DYNAMIC — this world's data plus this specific call's input. Uncached.
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD (the ONLY values valid for the "faction" field — do not invent, rename, or reference a faction not on this exact list; use null for personal/civic/unaffiliated logs):
${factionOptionsText}

LOCATIONS IN THIS WORLD (the only ids valid for locationId -- do not invent one; leave it null if nothing archived fits, that's expected and fine):
${locationRosterText || "No locations archived yet -- leave locationId null and just describe the location in prose."}

WORLD LORE — GROUND TRUTH (stay consistent with this; don't contradict it):
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}
${regenerateBlock}
EXISTING ROSTER (don't reuse a character/location/beat already logged):
${rosterContext}

CALENDAR (for resolvedDate):
${calendarContext || "(this world has no calendar configured yet -- return null for resolvedDate rather than inventing year/month numbers)"}

KNOWN CANONICAL DATES (entries that already have a real dated fact on record -- stay consistent with these, never contradict one; resolvedDateSubject may only reference an id from THIS list or the roster above, never invent one):
${knownDatesContext || "(nothing in this world has a canonical date set yet)"}

USER INPUT:
Name/Title: ${name || "invent one fitting the content"}
Log Type: ${logType || "choose whichever fits best (Terminal is the safest default)"}${campaignContext ? `\nCampaign context (this Log is needed for a specific quest role -- ground the concept in this, not just the roster gap): ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildLogContentSystemPrompt };
