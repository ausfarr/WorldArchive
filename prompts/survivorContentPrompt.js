// prompts/survivorContentPrompt.js
//
// PC (player character) generator. Reworked from the original "rank-and-
// file Colony recruit" generator -- see session_addendum_tester_feedback_
// batch2.md and the follow-up PC-rework addendum for the full reasoning.
// This is a real character sheet for someone actually being played at
// the table: a class + this world's own attributes, a backstory with
// real depth, personality (borrowing the same trait/contradiction/wants/
// actuallyNeeds shape npcContentPrompt.js uses, since a PC deserves the
// same characterization depth as a named NPC), a Bond/Flaw (a roleplay
// hook for the GM, explicitly NOT a hard mechanical modifier -- a PC's
// real mechanics come from their class and the table's own system, this
// entry is a reference sheet, not the rules engine), and relationships
// to the wider world (factions/NPCs/other PCs), same shape as NPCs.
//
// The category id stays "survivors" internally (routes, table category
// value, folder paths) -- only the generated content and the per-world
// display label change. Same "internal name stays stable, only labeling/
// schema-depth changes" precedent as Quests (internally campaign_modules).

// PROMPT CACHING: see prompts/npcContentPrompt.js's header comment for
// the split rationale. availableClasses, statLabelsText, fieldSkillsText,
// and factionOptionsText are all per-world data, so they stay in the
// dynamic block even though the instructions telling the model what to
// do with them are static.

const { buildCacheableSystemPrompt } = require("../lib/claude");

// A PC is a snapshot of a character at the start of play, not a
// min/maxed hero -- roughly the same total attribute investment as an
// "Elite" tier enemy (see lib/statFormulas.js's TIER_BUDGET), since both
// represent a competent, established figure rather than a disposable
// extra or an end-game boss. A PC's real progression happens through
// actual play (leveling, the class's own 1-99 track) -- this is just
// where they start.
const PC_ATTRIBUTE_BUDGET_HINT = "~50-60 total points across all six attributes (2-3 stats at 10-14, rest at 5-8) -- a capable starting adventurer, not a min-maxed veteran or a disposable extra.";

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Full First + Last Name",
  "callsign": "optional nickname, or null",
  "playerName": "the real person playing this character, or null if not given",
  "faction": "one of this world's faction ids (see FACTIONS below), or \\"unaligned\\" if this character deliberately doesn't belong to one",
  "className": "one of the available classes listed below",
  "attributes": { "body": 0, "reflex": 0, "knowledge": 0, "presence": 0, "sanity": 0, "fate": 0 },
  "backstory": "3-5 sentences: who they were before, one specific concrete human detail, why they're on this path now -- not just a job title",
  "personality": {
    "trait": "a defining trait",
    "contradiction": "one sentence -- the trait that complicates it",
    "wants": "a stated goal",
    "actuallyNeeds": "the deeper driver underneath the stated goal"
  },
  "bond": {
    "name": "short bond/flaw name",
    "effect": "a roleplay hook or narrative complication for the GM to use -- NOT a hard mechanical modifier (this character's real stats/abilities come from their class and attributes above)",
    "flavorLine": "one short line explaining why they have this"
  },
  "relationships": [
    { "type": "faction allegiance | rivalry/grudge | debt/obligation | historical connection | found-family, etc.", "toId": "an id from FACTIONS below, or an existing NPC/enemy/class/survivor id from the roster", "toCategory": "factions | npcs | enemies | classes | survivors", "toLabel": "the display name of that entry", "why": "one concrete sentence" }
  ],
  "designNotes": "1 sentence: how this avoids repeating a Name+Class combo already in the roster",
  "birthDate": "{ \\"year\\": integer, \\"monthIndex\\": integer, \\"day\\": integer } -- ONLY if the backstory makes a specific birth year meaningful to pin down (most don't); null otherwise",
  "appointedDate": "{ \\"year\\": integer, \\"monthIndex\\": integer, \\"day\\": integer } -- ONLY if this PC holds a formally-appointed role (rare for a PC); null otherwise, which is the normal case",
  "deathDate": "{ \\"year\\": integer, \\"monthIndex\\": integer, \\"day\\": integer } -- ONLY if this PC is established as deceased (e.g. regenerating to reflect an in-fiction death); null for a currently-active PC, the normal/expected case"
}`;

// STATIC — identical for every call, every world. Cached.
const STATIC_INSTRUCTIONS = `You are generating a player character (PC) sheet for a tabletop/game world archive — a character actually being played at the table, not a background extra. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

NAMING: full first + last name, plausible and diverse in origin, fitting this world's setting. A callsign is optional and should come from profession, a habit, or a specific event.

CLASS: assign exactly one class from the list provided below (vary your pick — don't default to the same one or two).

ATTRIBUTES: canonical six keys — always output these exact lowercase keys in "attributes": body, reflex, knowledge, presence, sanity, fate. Budget: ${PC_ATTRIBUTE_BUDGET_HINT} Nudge the split to fit the class and backstory rather than copying a baseline verbatim.

BACKSTORY: 3-5 sentences, not a single line — needs one concrete human detail that makes them feel like a person, not a character sheet, plus a real reason they're adventuring/on this path now.

PERSONALITY: same depth as a named NPC gets — a defining trait, one sentence naming what COMPLICATES that trait (not just decorates it), a stated goal (wants), and the deeper driver underneath it (actuallyNeeds).

BOND: exactly one per PC — a roleplay hook or narrative complication for the GM (a debt, a promise, a fear, an enemy who knows their secret), NOT a mechanical stat modifier. This character's real mechanics live in their class and attributes; the Bond is flavor with table-usable weight, not a numeric bonus/penalty.

RELATIONSHIPS: at minimum, state a faction allegiance (or explicit "unaligned"). Prefer connecting to an existing named NPC, enemy, class, or another PC from the roster provided below over a floating faction-only tie — and ONLY reference ids that actually appear in the FACTIONS list or the EXISTING ROSTER below, never an invented one. State each as one concrete sentence with a reason.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildSurvivorContentSystemPrompt({ settingContext, loreContext, statLabelsText, fieldSkillsText, factionOptionsText, rosterContext, availableClasses, name, className, faction, existingContent, importSourceText, calendarContext, revisionNote }) {
  // Session Prep Companion, Phase 7 -- see npcContentPrompt.js's identical comment.
  const revisionBlock = revisionNote
    ? `\nSPECIFIC REQUESTED UPDATE -- address this explicitly in your revision:\n${revisionNote}\n`
    : "";
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n${revisionBlock}`
    : "";

  // Import path — same principle as prompts/npcContentPrompt.js's
  // importSourceText: a GM pasting in a character their player already
  // wrote up. Every concrete fact in the source is ground truth; only
  // gaps (attributes, personality depth, relationships) get invented.
  const importBlock = importSourceText
    ? `\n\nIMPORTING AN EXISTING CHARACTER -- the user already has this PC written up elsewhere (a player's own character sheet, notes, or another tool's export). Treat every concrete fact stated below as ground truth: do not contradict, rename, or replace anything it explicitly says (name, class, backstory details, personality). Only invent to fill in whatever it leaves unstated (attributes, the Bond, additional relationships) -- and when inventing, stay consistent with what IS given plus this world's lore below.\n\nSOURCE TEXT (as provided by the user, verbatim):\n"""\n${importSourceText}\n"""\n`
    : "";

  // DYNAMIC — this world's data plus this specific call's input. Uncached.
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

AVAILABLE CLASSES (assign exactly one of these):
${availableClasses}

ATTRIBUTE LABELS (this world's own names for the underlying attributes, for flavor text only — always output the canonical lowercase keys in "attributes"):
${statLabelsText}

FIELD SKILLS (this world's fixed pool, for flavor/backstory context only — not required in this schema):
${fieldSkillsText}

FACTIONS IN THIS WORLD (the ONLY values valid for the "faction" field and for any faction referenced in relationships — do not invent, rename, or reference a faction not on this exact list; use "unaligned" if this character deliberately doesn't belong to one):
${factionOptionsText}

WORLD LORE — GROUND TRUTH (stay consistent with this; don't contradict it):
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}
${regenerateBlock}${importBlock}
EXISTING ROSTER (the same Name+Class pairing must not repeat — change the name or the class if it would collide; also avoid reusing a Bond; these are the only NPC/enemy/class/PC ids you may reference in relationships):
${rosterContext}

CALENDAR (for birthDate/appointedDate/deathDate -- most PCs need none of these):
${calendarContext || "(this world has no calendar configured yet -- return null for every date field rather than inventing year/month numbers)"}

USER INPUT:
Name: ${name || (importSourceText ? "use the name given in the source text above" : "generate one fitting the naming conventions")}
Class: ${className || "choose one that adds variety to the existing roster"}
Faction: ${faction || "choose one that fills a gap in the existing roster, or unaligned if that fits better"}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildSurvivorContentSystemPrompt };
