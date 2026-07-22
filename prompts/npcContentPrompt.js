// prompts/npcContentPrompt.js
//
// Generic named-NPC generator. Replaces the Echoes-specific version,
// which hardcoded the setting name, a fixed 4-faction enum, and four
// hand-written faction-voice paragraphs. Grounding now comes from this
// world's own lore (lib/loreContext.js), its own faction list
// (lib/worldFlavor.js), and the roster-overlap context — no hardcoded
// setting content.

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
  "designNotes": "how this avoids repeating an existing role/faction/contradiction/tic combo"
}`;

function buildNpcContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, role, faction, existingContent }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  return `You are generating a named NPC for a tabletop/game world archive — a character the player will remember, not a rank-and-file extra. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

SETTING (stay consistent with this):
${settingContext}

ROLE ARCHETYPES (pick the closest match to the user's input, or choose one that fills a gap in the existing roster if unspecified):
- Faction Leader — sets a faction's agenda; embodies its philosophy personally, not as a mission statement.
- Quest-Giver — has a concrete want that becomes a mission hook; personality colors HOW they ask, not just what.
- Community VIP — runs something notable (an institution, a hub, a resource) that the player interacts with repeatedly.
- Rival — works against the player without being a combat boss; political, economic, or personal opposition.
- Informant/Fixer — trades in information or access; morally grey; transactional relationship with the player.
- Merchant — runs an economic node; personality justifies their prices/inventory philosophy.

FACTIONS IN THIS WORLD (the ONLY values valid for the "faction" field and for any faction referenced in relationships — do not invent, rename, or reference a faction not on this exact list; use "unaligned" if this character deliberately doesn't belong to one):
${factionOptionsText}

FACTION VOICE: derive how this character's faction actually sounds/thinks from the world lore below — don't default to a generic "evil empire" or "noble rebels" voice. The named character should feel like an individual within that faction's established culture, not a mission statement reciting it.

RULE OF THUMB: the NPC needs one trait that COMPLICATES their role, not just decorates it.

RELATIONSHIPS: at minimum, state a faction allegiance (or explicit "unaligned"). Prefer connecting to an existing named NPC, enemy, class, or survivor from the roster below over a floating faction-only tie — and ONLY reference ids that actually appear in the FACTIONS list or the EXISTING ROSTER below, never an invented one. State each as one concrete sentence with a reason, never just a label. Relationship types to draw from: faction allegiance, chain of command, rivalry/grudge (with a specific concrete reason), debt/obligation, historical pre-collapse or pre-existing connection, romantic/found-family (sparingly, with real weight).

SPEECH: define register (vocabulary type, tied to role/faction), rhythm (short/clipped vs long/looping — matters more than vocabulary), a tic (one small repeatable habit — used once or twice in the dialogue tree, never in every line), and one explicit thing they'd never say. Write the signature quote AFTER defining these — it should demonstrably use their voice and land on their contradiction or motivation in one line. Do not reuse it verbatim in the dialogue tree.

DIALOGUE TREE: one opening line + 2-3 branches + one reply each (~4-7 lines total). Each branch implies a different tone (e.g. respectful / transactional / hostile) and the reply should audibly shift with it.

QUEST HOOK: only if the archetype is Quest-Giver, or a hook falls out naturally — set to null otherwise, don't force one onto a Rival/Merchant.

WORLD LORE — GROUND TRUTH (stay consistent with this; don't contradict it):
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}
${regenerateBlock}
EXISTING ROSTER (avoid repeating a role+faction combo, contradiction, or tic already used; these are the only NPC/enemy/class/survivor ids you may reference in relationships):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the faction/role"}
Role: ${role || "choose one that fills a gap in the existing roster"}
Faction: ${faction || "choose one that fills a gap in the existing roster"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildNpcContentSystemPrompt };
