// prompts/loreDateExtractionPrompt.js
//
// Bug batch 1, Phase 4 (session_addendum_bug_batch_1.md): "Find dates in
// lore" on the Timeline page. The model READS the world's saved lore and
// proposes dated events; lib/loreDateExtraction.js validates every
// proposal (calendar math, year bounds, the quote actually appearing in
// the lore) and the DM ticks which ones to keep. Nothing here writes.
//
// Austin's decisions: vague dates are allowed but MARKED approximate
// (precision year/month/day, shown as "c. Year 512"); relative phrases are
// resolved against the calendar's current date.
//
// Static instructions are the cacheable block (lib/claude.js#buildCacheableSystemPrompt);
// the calendar, existing Timeline, and lore are the dynamic block.

const STATIC_INSTRUCTIONS = `You extract dated historical events from a tabletop RPG world's lore so they can be placed on the world's Timeline. Output ONLY valid JSON -- no markdown, no prose, no code fences.

WHAT TO EXTRACT:
- Events the lore places in time: foundings, wars, coronations, disasters, deaths, discoveries, treaties, the start/end of eras.
- Only events actually stated or clearly implied by the text. Never invent an event, a date, or a detail.
- Skip anything with no temporal anchor at all ("long ago", "in legend") -- if you cannot place it within a specific year, leave it out.
- Skip events already on the EXISTING TIMELINE below (same happening, even if worded differently).
- At most 40 events. Prefer the most significant if there are more.

DATES:
- Use the calendar below. "year" is an integer in the calendar's year numbering; "monthIndex" is the 0-based index into its months list; "day" is 1-based.
- Resolve relative phrases against the CURRENT DATE: "three centuries ago" from Year 812 is Year 512; "last winter" is the most recent winter month of the previous year.
- precision says how much of the date the text actually supports:
    "day"   -- the text pins a specific day (give year, monthIndex, day)
    "month" -- only a month/season (give year and monthIndex; day null)
    "year"  -- only a year or a span ("three centuries ago", "late in the reign of...") (monthIndex and day null)
- "approximate": true whenever you had to estimate or round (relative phrases, "around", "late in", seasons mapped to a month). false only when the text states the date outright.

EACH EVENT:
- "summary": one short past-tense line naming what happened, e.g. "The Iron Pact was founded" (max ~15 words).
- "sectionTitle": the title of the lore section it came from.
- "quote": a SHORT excerpt (under 200 characters) copied EXACTLY, character for character, from that section, that supports the date. Do not paraphrase the quote -- it is checked against the lore verbatim and dropped if it doesn't match.

Return JSON of exactly this shape:
{ "events": [ { "summary": string, "year": integer, "monthIndex": integer|null, "day": integer|null, "precision": "day"|"month"|"year", "approximate": boolean, "sectionTitle": string, "quote": string } ] }
Return { "events": [] } if the lore contains no datable events.`;

function buildLoreDateExtractionPrompt({ calendarContext, existingTimelineText, loreText }) {
  const dynamic = `CALENDAR (months are 0-indexed):
${calendarContext}

EXISTING TIMELINE (do not repeat these):
${existingTimelineText || "(empty)"}

WORLD LORE:
${loreText}`;
  return { staticText: STATIC_INSTRUCTIONS, dynamicText: dynamic };
}

module.exports = { buildLoreDateExtractionPrompt };
