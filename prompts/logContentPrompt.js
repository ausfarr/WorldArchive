const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Log Title",
  "logType": "Audio | Journal | Terminal",
  "locationContext": "where/how this would be found in-game, e.g. 'East Platform, Subway Substructure'",
  "characters": "who this belongs to/features (name or role), or 'none' if no clear human voice",
  "context": "one sentence flavor: what this artifact is physically, and the circumstances of its recovery",
  "bodyText": "the actual found-text content, plain text with real line breaks — timestamped transcript for Audio, dated entries for Journal, system/terminal dump for Terminal. Keep it short: a found artifact, not a short story.",
  "faction": "preservation | ferro_kings | the_board | glitch_kin | null — the source's faction voice if applicable, null for personal/civic/unaffiliated logs",
  "hexTongue": "null UNLESS this log plausibly picked up Glitch-Kin network traffic (near Glitch-Kin activity, a Data Monolith, or old server infrastructure) — if included: { \\"unreadable\\": \\"4-8 char glyph burst from ▖▗▘▙▚▛▜▝▞▟░▒▓\\", \\"keyword\\": \\"the Phrase tier with most words replaced by glyph static, 1-3 legible fragments kept\\", \\"phrase\\": \\"full plain-English line written as a calm technical debug-log readout, NOT a monster growling\\", \\"humanInterpretation\\": \\"what an untrained listener would perceive, e.g. screaming or a static burst\\", \\"linguistInterpretation\\": \\"what it actually is, e.g. a damage-status debug log\\" }",
  "designNotes": "1-2 sentences: what this reveals to the player, why the intercept (if any) makes sense at this location, and how it avoids repeating a character/location/beat already generated"
}`;

function buildLogContentSystemPrompt({ rosterContext, name, logType }) {
  return `You are generating found-text content for "Echoes of the Neon," a tactical RPG set in a subterranean industrial-horror colony after a societal collapse — Data Drive recordings, terminal logs, and journal entries. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

LOG TYPES:
- Audio: transcript of a spoken recording, timestamped with speaker tags. Conversational, fragmented under stress — people don't narrate cleanly when dying or scared.
- Journal: handwritten/typed personal entries. More reflective than audio; can span a few dated entries if it tells a short arc. Intimate tone, sometimes darkly funny — blue-collar people, not poets.
- Terminal: old-world computer output — error dumps, corporate memos, security logs, automated messages. The most likely format to carry a Hex-Tongue intercept. Tone matches source: Board = corporate memo even mid-collapse ("Q3 Containment Update"), Preservation = clinical/procedural, generic civic = plain municipal system.

Personal/emotional beats (a death, a goodbye, a discovery) suit Audio or Journal. World-building/faction lore, or anything with a Hex-Tongue intercept, suits Terminal. If genuinely unsure, Terminal is the safest default.

ANCHOR IT: never a floating, unanchored snippet — tie it to a specific location, character, or mission (invent something concrete if not given).

HEX-TONGUE INTERCEPT: only include one if the log plausibly would have picked up Glitch-Kin swarm network traffic — near Glitch-Kin activity, a Data Monolith, or old server infrastructure. Do NOT add one just because you can; a personal journal in an untouched pre-collapse apartment almost certainly should NOT have one. When you do include one: show all three tiers together (Unreadable glyph static, Keyword partial-legible fragments, Phrase the full plain-English line). Write the Phrase tier as a calm technical debug-log line — the "screaming" or "growling" impression belongs only in the humanInterpretation field, never in the Phrase text itself, which is the actual in-world content.

KEEP IT SHORT: this is a found artifact, not a short story. A few lines of audio/journal, or a compact terminal dump.

EXISTING ROSTER (don't reuse a character/location/beat already logged):
${rosterContext}

USER INPUT:
Name/Title: ${name || "invent one fitting the content"}
Log Type: ${logType || "choose whichever fits best (Terminal is the safest default)"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildLogContentSystemPrompt };
