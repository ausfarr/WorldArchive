const { getWorldBibleContext } = require("../lib/worldBible");

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Full First + Last Name",
  "callsign": "optional nickname tied to profession/habit/post-collapse event, or null — NOT a fantasy epithet",
  "className": "one of the available classes listed below",
  "backstory": "3-5 sentences: who they were pre-collapse, one specific concrete human detail, how they ended up in the Colony — not just a job title",
  "quirk": {
    "name": "short quirk name",
    "effect": "mechanical effect tied to a real attribute (BODY/REFLEX/KNOWLEDGE/PRESENCE/SANITY/FATE), Field Skill (Linguistics/Scavenging/Tinkering/Biology), or Combat Spec (Ballistics/Blade-work/Blunt Force/Resonance/Composure) — roughly +/-10-15% on one thing, or a narrow situational effect, NOT a build-defining mechanic",
    "flavorLine": "one short line explaining why they have this quirk"
  },
  "designNotes": "1 sentence: how this avoids repeating a Name+Class combo or quirk already in the roster"
}`;

function buildSurvivorContentSystemPrompt({ rosterContext, availableClasses, name, className }) {
  // Survivors aren't tagged with a political faction (preservation/ferro_kings/
  // the_board/glitch_kin) in the schema — they're always Colony recruits by
  // design, so "colony" is hardcoded here rather than passed in, to pull the
  // Part IV Colony/Death/Permadeath lore into every survivor generation.
  const worldBibleContext = getWorldBibleContext({ faction: "colony", category: "survivors" });
  return `You are generating a survivor recruit for "Echoes of the Neon," a tactical RPG set in a subterranean industrial-horror colony after a societal collapse. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

NAMING: full first + last name, surname-forward and functional (like "Captain Miller"), plausible modern/near-future, diverse in origin — not fantasy characters. A callsign is optional and should come from profession, a habit, or a post-collapse event — never a fantasy epithet, and never over-themed to their class (a Courier doesn't need to be named "Swift").

CLASS: assign exactly one class from this list (vary your pick — don't default to the same one or two):
${availableClasses}

QUIRK (exactly one per survivor — a small colonist-level nudge, not a build-defining mechanic):
- Roughly +/-10-15% on a single stat, or a narrow situational effect.
- Tie it to a real attribute, Field Skill, or Combat Spec — never a vague "gets a bonus sometimes."
- Ground it in blue-collar/industrial-horror flavor (a bad knee, insomnia, a grudge) — not fantasy quirk tropes.
- Most interesting quirks are trade-offs (a bonus AND a cost), like "Grease Monkey: +15% Tinkering, -10% Accuracy with anything that isn't a repurposed tool."
- Don't reuse a quirk already in the roster below.

BACKSTORY: a fuller paragraph (3-5 sentences), not a single line — needs one concrete human detail that makes them feel like a person, not a character sheet.

WORLD BIBLE — GROUND TRUTH LORE (stay consistent with this; don't contradict it):
${worldBibleContext}

EXISTING ROSTER (the same Name+Class pairing must not repeat — change the name or the class if it would collide; also avoid reusing a quirk):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the naming conventions"}
Class: ${className || "choose one that adds variety to the existing roster"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildSurvivorContentSystemPrompt };
