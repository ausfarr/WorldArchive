// prompts/survivorContentPrompt.js
//
// Generic recruit generator for the roster's rank-and-file characters.
// Replaces the Echoes-specific version, which hardcoded the setting name
// and a fixed "colony" faction key for lore grounding (survivors were
// always Colony recruits by design in Echoes). Generic worlds don't
// necessarily have a "Colony" concept, so this now just grounds on
// general world lore (category: survivors) without assuming a specific
// home-faction name.

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Full First + Last Name",
  "callsign": "optional nickname tied to profession/habit/a defining event, or null — not a generic fantasy epithet",
  "className": "one of the available classes listed below",
  "backstory": "3-5 sentences: who they were before, one specific concrete human detail, how they ended up here — not just a job title",
  "quirk": {
    "name": "short quirk name",
    "effect": "mechanical effect tied to a real attribute (see ATTRIBUTE LABELS below), a field skill, or a combat specialization — roughly +/-10-15% on one thing, or a narrow situational effect, NOT a build-defining mechanic",
    "flavorLine": "one short line explaining why they have this quirk"
  },
  "designNotes": "1 sentence: how this avoids repeating a Name+Class combo or quirk already in the roster"
}`;

function buildSurvivorContentSystemPrompt({ settingContext, loreContext, statLabelsText, rosterContext, availableClasses, name, className, existingContent }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  return `You are generating a recruit for a tabletop/game world's roster — a rank-and-file character, not a major named NPC. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

SETTING (stay consistent with this):
${settingContext}

NAMING: full first + last name, plausible and diverse in origin, fitting this world's setting — not a random fantasy name unless the setting calls for it. A callsign is optional and should come from profession, a habit, or a specific event — never over-themed to their class.

CLASS: assign exactly one class from this list (vary your pick — don't default to the same one or two):
${availableClasses}

ATTRIBUTE LABELS (this world's own names for the underlying attributes — tie the quirk's effect to one of these, a field skill, or a combat specialization consistent with the roster below):
${statLabelsText}

QUIRK (exactly one per survivor — a small colonist-level nudge, not a build-defining mechanic):
- Roughly +/-10-15% on a single stat, or a narrow situational effect.
- Tie it to a real attribute, field skill, or combat specialization — never a vague "gets a bonus sometimes."
- Ground it in this world's tone (a bad knee, insomnia, a grudge) — not generic fantasy quirk tropes.
- Most interesting quirks are trade-offs (a bonus AND a cost).
- Don't reuse a quirk already in the roster below.

BACKSTORY: a fuller paragraph (3-5 sentences), not a single line — needs one concrete human detail that makes them feel like a person, not a character sheet.

WORLD LORE — GROUND TRUTH (stay consistent with this; don't contradict it):
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}
${regenerateBlock}
EXISTING ROSTER (the same Name+Class pairing must not repeat — change the name or the class if it would collide; also avoid reusing a quirk):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the naming conventions"}
Class: ${className || "choose one that adds variety to the existing roster"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildSurvivorContentSystemPrompt };
