// prompts/logContentPrompt.js
//
// Generic found-text generator (audio transcripts, journal entries,
// terminal dumps). Replaces the Echoes-specific version, which hardcoded
// the setting name, a fixed 4-faction enum, and the Hex-Tongue intercept
// mechanic (dropped entirely — see enemyContentPrompt.js's header comment
// for the same reasoning/decision).

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Log Title",
  "logType": "Audio | Journal | Terminal",
  "locationContext": "where/how this would be found in-game, e.g. 'East Platform, Subway Substructure'",
  "characters": "who this belongs to/features (name or role), or 'none' if no clear human voice",
  "context": "one sentence flavor: what this artifact is physically, and the circumstances of its recovery",
  "bodyText": "the actual found-text content, plain text with real line breaks — timestamped transcript for Audio, dated entries for Journal, system/terminal dump for Terminal. Keep it short: a found artifact, not a short story.",
  "faction": "one of this world's faction ids (see FACTIONS below), or null for personal/civic/unaffiliated logs",
  "designNotes": "1-2 sentences: what this reveals to the player, and how it avoids repeating a character/location/beat already generated"
}`;

function buildLogContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, logType, existingContent }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  return `You are generating found-text content for a tabletop/game world archive — recordings, terminal logs, and journal entries the player can discover. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD (the ONLY values valid for the "faction" field — do not invent, rename, or reference a faction not on this exact list; use null for personal/civic/unaffiliated logs):
${factionOptionsText}

LOG TYPES:
- Audio: transcript of a spoken recording, timestamped with speaker tags. Conversational, fragmented under stress — people don't narrate cleanly when dying or scared.
- Journal: handwritten/typed personal entries. More reflective than audio; can span a few dated entries if it tells a short arc. Intimate tone, sometimes darkly funny.
- Terminal: computer/system output — error dumps, memos, security logs, automated messages. Tone should match its source faction's voice (derive from the lore below) or read as plain civic/municipal system output if unaffiliated.

Personal/emotional beats (a death, a goodbye, a discovery) suit Audio or Journal. World-building/faction lore suits Terminal. If genuinely unsure, Terminal is the safest default.

ANCHOR IT: never a floating, unanchored snippet — tie it to a specific location, character, or event (invent something concrete if not given).

KEEP IT SHORT: this is a found artifact, not a short story. A few lines of audio/journal, or a compact terminal dump.

WORLD LORE — GROUND TRUTH (stay consistent with this; don't contradict it):
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}
${regenerateBlock}
EXISTING ROSTER (don't reuse a character/location/beat already logged):
${rosterContext}

USER INPUT:
Name/Title: ${name || "invent one fitting the content"}
Log Type: ${logType || "choose whichever fits best (Terminal is the safest default)"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildLogContentSystemPrompt };
