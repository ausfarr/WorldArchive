// prompts/sessionChroniclePrompt.js
//
// Session Prep Companion, Phase 5 -- Session Chronicle generation. A
// Chronicle IS a Logs entry (same schema/template/category as any other
// found-text log -- see lib/logTemplate.js), just always logType
// "Journal" (an in-setting written record of the session, kept by the
// party/a scribe) and always carrying a `sessionChronicle` field the
// route attaches after generation. This file only builds the schema/
// instructions specific to turning a DM's freeform recap notes into
// that in-setting prose -- it deliberately mirrors logContentPrompt.js's
// schema shape rather than introducing a divergent one, since the two
// are stored and rendered through the exact same pipeline.

const { buildCacheableSystemPrompt } = require("../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Chronicle title, e.g. 'The Mill's Silence, Session 3'",
  "locationContext": "where this session's events primarily took place, in-game",
  "locationId": "an id from LOCATIONS below if a real archived Location matches, else null",
  "characters": "who this session centered on (name(s) or role(s))",
  "context": "one sentence: what this record physically is (a journal entry, a scribe's account, a survivor's retelling) and who's presumed to have written it",
  "bodyText": "the in-setting prose account of the session, plain text with real line breaks -- written as if by an in-world witness/participant, not a DM's out-of-character summary. Cover what actually happened per the DM's recap notes below.",
  "faction": "one of this world's faction ids (see FACTIONS below), or null if this session doesn't center on one",
  "designNotes": "1-2 sentences: what this session moved forward, and anything notable that deviated from what was planned",
  "impliedUpdates": [
    {
      "category": "npcs | factions | survivors | items",
      "entryId": "a real id from THIS QUEST/CAMPAIGN'S ROSTER below -- never invent one",
      "suggestionType": "status_flip | regenerate",
      "targetStatus": "ONLY for suggestionType status_flip -- a short new status value (e.g. \\"dead\\", \\"missing\\", \\"hostile\\", \\"allied\\", \\"consumed\\"), else null",
      "deltaText": "one sentence: what happened and why this entry should be updated, written as a revision instruction (e.g. \\"Died in the reactor collapse during Session 3 -- should reflect this.\\")"
    }
  ]
}`;

// STATIC — identical for every call, every world. Cached.
const STATIC_INSTRUCTIONS = `You are turning a DM's rough recap notes from an actual tabletop RPG session into an in-setting Session Chronicle -- a found-text record (a journal entry, a scribe's account) that could sit in this world's own archive of Logs. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

CRITICAL -- PLANNED VS. ACTUAL: if a SESSION PACKET (the prep plan for this session) is provided below, treat it ONLY as background context for what was INTENDED -- the DM'S RECAP NOTES are ground truth for what actually happened at the table. Players almost always deviate from the plan -- capture the recap notes faithfully, including any improvisation or divergence from the packet, rather than reverting to what was merely planned. If the recap notes don't mention something the packet planned, assume it didn't happen or isn't confirmed -- don't invent that it occurred just because it was prepped.

VOICE: write bodyText as an in-world document, not a DM's out-of-character session summary -- present tense or past tense in-character retelling, grounded in this world's own tone (see SETTING/LORE below), not "the party did X, then Y."

ANCHOR IT: reference real roster entries (NPCs/locations/etc.) that were actually part of this session wherever the recap notes name them -- don't invent new named characters/locations that weren't in the recap notes or the roster.

IMPLIED UPDATES (impliedUpdates): if the recap notes clearly imply a real state change to a SPECIFIC existing roster entry (an NPC died, a faction lost territory, an item was consumed/lost, an ally turned hostile), surface it here as a suggestion -- NEVER apply it yourself, this only ever proposes. Most sessions imply zero or very few of these -- an empty array is normal and expected; don't force one. Only reference entryIds that are genuinely in THIS QUEST/CAMPAIGN'S ROSTER below, never invent one, and never suggest an update for something the recap notes don't actually support.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildSessionChronicleSystemPrompt({ settingContext, loreContext, factionOptionsText, locationRosterText, rosterContext, recapNotes, sessionPacketContext, existingContent }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, incorporate any corrected recap notes below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD (the ONLY values valid for the "faction" field):
${factionOptionsText}

LOCATIONS IN THIS WORLD (the only ids valid for locationId -- do not invent one):
${locationRosterText || "No locations archived yet -- leave locationId null and just describe the location in prose."}

WORLD LORE — GROUND TRUTH (stay consistent with this):
${loreContext || "(no lore saved yet for this world)"}

THIS QUEST/CAMPAIGN'S ROSTER (characters/places/items this session likely involved -- reference by name where the recap notes call for it):
${rosterContext}

SESSION PACKET -- WHAT WAS PLANNED FOR THIS SESSION (background only, NOT ground truth -- see the critical instruction above):
${sessionPacketContext || "(no Session Packet was generated for this session -- this is a recap-only session, which is normal and fully supported)"}
${regenerateBlock}
DM'S RECAP NOTES -- WHAT ACTUALLY HAPPENED (ground truth, freeform, may be rough/bulleted):
"""
${recapNotes}
"""`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildSessionChronicleSystemPrompt };
