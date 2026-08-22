// prompts/wizardCalendarPrompt.js
//
// Session Prep Companion, Phase 2 -- "generate for me" for the minimal
// Calendar (see session_prep_companion_scope.md Section 4a-i). Same
// "one combined call, grounded in Step 1 + lore" shape as
// wizardStatSystemPrompt.js. Proposes a calendar shape (months, era name,
// week structure) fitting the world's own genre/tone -- the DM reviews
// and edits before saving, same as every other wizard generate-for-me
// field; nothing here writes to storage directly.

const SCHEMA_DESCRIPTION = `{
  "eraName": "short era/age name fitting this world's tone, e.g. \\"Age of Ash\\"",
  "daysPerWeek": number between 4 and 10,
  "weekdayNames": ["array of exactly daysPerWeek short weekday names, in order"],
  "months": [{ "name": "month name fitting this world's calendar/culture", "days": number between 20 and 40 }],
  "startingYear": "a plausible in-world year number for a campaign to begin in this era, given the world's history/tone"
}`;

const STATIC_INSTRUCTIONS = `You are inventing a fantasy/genre-appropriate calendar system for a tabletop RPG world -- a full year structure the DM can use to date events, sessions, and history. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

GUIDANCE:
- Month count is your judgment call given the setting (real-world-inspired settings often want 12; a genuinely alien or invented cosmology can use a different count, e.g. a lunar-cycle-driven calendar with 10 months, or a world with an unusual orbital period) -- pick something that fits the world's own flavor, not a rote copy of the Gregorian calendar unless the setting calls for exactly that.
- Month names and lengths should read as native to this world's own culture/language/climate (seasonal names, mythic names, whatever the lore below suggests), not generic "Month 1/Month 2" placeholders.
- daysPerWeek and weekdayNames should also fit the world's own numerology/culture rather than defaulting to a real-world 7-day week unless that genuinely suits the setting.
- startingYear should feel period-appropriate for the world's history/tone (a number in the low hundreds for a "dark ages after a great collapse" setting, four digits for a setting with a long unbroken written history, etc.) -- use your judgment, there's no universally "right" answer.
- Every month's "days" must be an integer between 20 and 40 -- keep the total year length roughly plausible (250-400 days total across all months) unless the setting has an explicit reason to be stranger than that.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildWizardCalendarPrompt({ step1, loreContext }) {
  const s = step1 || {};
  const knownContext = [
    s.worldName ? `World name: ${s.worldName}` : null,
    s.genre && s.genre.length ? `Genre & tone: ${Array.isArray(s.genre) ? s.genre.join(", ") : s.genre}` : null,
    s.era ? `Era/tech level: ${s.era}` : null,
    s.supernaturalSystem ? `Supernatural/speculative system: ${s.supernaturalSystem}` : null
  ].filter(Boolean).join("\n");

  return `${STATIC_INSTRUCTIONS}

SEED & VISION (grounding context):
${knownContext || "(nothing provided -- use general genre conventions)"}

WORLD LORE (grounding context, if available):
${loreContext || "(no lore saved yet for this world)"}`;
}

module.exports = { buildWizardCalendarPrompt };
