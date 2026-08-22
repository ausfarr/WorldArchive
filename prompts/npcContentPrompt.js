// prompts/npcContentPrompt.js
//
// Generic named-NPC generator. Replaces the Echoes-specific version,
// which hardcoded the setting name, a fixed 4-faction enum, and four
// hand-written faction-voice paragraphs. Grounding now comes from this
// world's own lore (lib/loreContext.js), its own faction list
// (lib/worldFlavor.js), and the roster-overlap context — no hardcoded
// setting content.
//
// PROMPT CACHING: the system prompt below is split into a STATIC block
// (instructions/schema -- byte-identical on every call, for every world,
// forever) and a DYNAMIC block (this world's setting/factions/lore/
// roster/user input -- changes call to call). The static block carries
// cache_control, so a cache hit only requires ANY recent NPC-generation
// call across ANY world to have used it -- not just the same user's own
// back-to-back calls -- since it's org-wide identical. See
// lib/claude.js's buildCacheableSystemPrompt() for the shared shape, and
// lib/costTracker.js for how the savings show up in the logs. The
// content itself is unchanged from before this split -- only the
// ordering (static-first, then dynamic) and the block boundary are new;
// see git history if you need the original single-string version.

const { buildCacheableSystemPrompt } = require("../lib/claude");
const { QUOTE_CRAFT_GUIDANCE, PHYSICAL_DESCRIPTION_GUIDANCE } = require("../lib/promptGuidance");

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Full Name",
  "callsign": "optional nickname, or null",
  "roleArchetype": "Faction Leader | Quest-Giver | Community VIP | Rival | Informant/Fixer | Merchant",
  "faction": "one of this world's faction ids (see FACTIONS below), or \\"unaligned\\" if this character deliberately doesn't belong to one",
  "age": "integer, chosen to fit the character's role/backstory",
  "signatureQuote": "one sentence, first person, in voice",
  "physicalDescription": "2-4 sentences",
  "traits": ["trait1", "trait2", "trait3"],
  "contradiction": "one sentence — the trait that complicates the role",
  "wants": "stated goal",
  "actuallyNeeds": "the deeper driver",
  "speech": { "register": "...", "rhythm": "...", "tic": "...", "neverSay": "..." },
  "relationships": [
    { "type": "Faction allegiance", "toId": "an id from FACTIONS below, or an existing NPC/enemy/class/survivor id from the roster", "toCategory": "factions | npcs | enemies | classes | survivors", "toLabel": "the display name of that entry", "why": "..." }
  ],
  "dialogue": {
    "openingLine": "...",
    "branches": [ { "toneLabel": "If you respond respectfully — \\"...\\"", "reply": "..." } ]
  },
  "questHook": "1-2 sentences, or null if not a quest-giver",
  "designNotes": "how this avoids repeating an existing role/faction/contradiction/tic combo",
  "birthDate": "{ \\"year\\": integer, \\"monthIndex\\": integer, \\"day\\": integer } -- ONLY if this character's age/backstory makes a specific birth year meaningful to pin down (most don't); null otherwise -- don't force one just because the field exists",
  "appointedDate": "{ \\"year\\": integer, \\"monthIndex\\": integer, \\"day\\": integer } -- ONLY for a Faction Leader (or similar formally-appointed role) where a specific appointment date is meaningful; null for every other role, and null even for a Faction Leader if no such date is implied",
  "deathDate": "{ \\"year\\": integer, \\"monthIndex\\": integer, \\"day\\": integer } -- ONLY if this character is established as already deceased (e.g. a historical figure referenced in lore, or being regenerated to reflect an in-fiction death); null for a currently-living character, which is the normal/expected case"
}`;

// STATIC — identical for every call, every world. Cached.
const STATIC_INSTRUCTIONS = `You are generating a named NPC for a tabletop/game world archive — a character the player will remember, not a rank-and-file extra. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

ROLE ARCHETYPES (pick the closest match to the user's input, or choose one that fills a gap in the existing roster if unspecified):
- Faction Leader — sets a faction's agenda; embodies its philosophy personally, not as a mission statement.
- Quest-Giver — has a concrete want that becomes a mission hook; personality colors HOW they ask, not just what.
- Community VIP — runs something notable (an institution, a hub, a resource) that the player interacts with repeatedly.
- Rival — works against the player without being a combat boss; political, economic, or personal opposition.
- Informant/Fixer — trades in information or access; morally grey; transactional relationship with the player.
- Merchant — runs an economic node; personality justifies their prices/inventory philosophy.

FACTION VOICE: derive how this character's faction actually sounds/thinks from the world lore provided below — don't default to a generic "evil empire" or "noble rebels" voice. The named character should feel like an individual within that faction's established culture, not a mission statement reciting it.

RULE OF THUMB: the NPC needs one trait that COMPLICATES their role, not just decorates it.

${PHYSICAL_DESCRIPTION_GUIDANCE} This applies to physicalDescription.

RELATIONSHIPS: at minimum, state a faction allegiance (or explicit "unaligned"). Prefer connecting to an existing named NPC, enemy, class, or survivor from the roster provided below over a floating faction-only tie — and ONLY reference ids that actually appear in the FACTIONS list or the EXISTING ROSTER below, never an invented one. State each as one concrete sentence with a reason, never just a label. Relationship types to draw from: faction allegiance, chain of command, rivalry/grudge (with a specific concrete reason), debt/obligation, historical pre-collapse or pre-existing connection, romantic/found-family (sparingly, with real weight).

SPEECH: define register (vocabulary type, tied to role/faction), rhythm (short/clipped vs long/looping — matters more than vocabulary), a tic (one small repeatable habit — used once or twice in the dialogue tree, never in every line), and one explicit thing they'd never say. Write the signature quote AFTER defining these — it should demonstrably use their voice and land on their contradiction or motivation in one line. Do not reuse it verbatim in the dialogue tree.

${QUOTE_CRAFT_GUIDANCE}

DIALOGUE TREE: one opening line + 2-3 branches + one reply each (~4-7 lines total). Each branch implies a different tone (e.g. respectful / transactional / hostile) and the reply should audibly shift with it.

QUEST HOOK: only if the archetype is Quest-Giver, or a hook falls out naturally — set to null otherwise, don't force one onto a Rival/Merchant.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildNpcContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, role, faction, existingContent, campaignContext, importSourceText, calendarContext }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  // Import path: the user already has a character written up somewhere
  // else (their own notes, another tool's export, a pasted character
  // sheet) and wants it brought into this world's archive rather than
  // invented from scratch. Every concrete fact stated in the source text
  // is ground truth and must not be contradicted or replaced -- this is
  // the same "preserve what's already there" principle as regenerate,
  // just applied to externally-authored source material instead of a
  // prior AI-generated entry. Gaps the source text doesn't cover (speech
  // pattern, dialogue tree, some relationships) get invented normally,
  // grounded in whatever facts ARE given plus this world's own lore.
  const importBlock = importSourceText
    ? `\n\nIMPORTING AN EXISTING CHARACTER -- the user already wrote this character up elsewhere (their own notes, another tool's export, a character sheet). Treat every concrete fact stated below as ground truth: do not contradict, rename, or replace anything it explicitly says. Only invent to fill in whatever it leaves unstated (e.g. speech pattern details, the dialogue tree, additional relationships) -- and when inventing, stay consistent with what IS given plus this world's lore below, don't override the source's tone/personality with a generic one.\n\nSOURCE TEXT (as provided by the user, verbatim):\n"""\n${importSourceText}\n"""\n`
    : "";

  // DYNAMIC — this world's data plus this specific call's input. Uncached.
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD (the ONLY values valid for the "faction" field and for any faction referenced in relationships — do not invent, rename, or reference a faction not on this exact list; use "unaligned" if this character deliberately doesn't belong to one):
${factionOptionsText}

WORLD LORE — GROUND TRUTH (stay consistent with this; don't contradict it):
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}
${regenerateBlock}${importBlock}
EXISTING ROSTER (avoid repeating a role+faction combo, contradiction, or tic already used; these are the only NPC/enemy/class/survivor ids you may reference in relationships):
${rosterContext}

CALENDAR (for birthDate/appointedDate/deathDate -- most NPCs need none of these; only fill one in when it's genuinely meaningful, per each field's own guidance above):
${calendarContext || "(this world has no calendar configured yet -- return null for every date field rather than inventing year/month numbers)"}

USER INPUT:
Name: ${name || (importSourceText ? "use the name given in the source text above" : "generate one fitting the faction/role")}
Role: ${role || "choose one that fills a gap in the existing roster"}
Faction: ${faction || "choose one that fills a gap in the existing roster"}${campaignContext ? `\nCampaign context (this NPC is needed for a specific quest role -- ground the concept in this, not just the roster gap): ${campaignContext}` : ""}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildNpcContentSystemPrompt };
