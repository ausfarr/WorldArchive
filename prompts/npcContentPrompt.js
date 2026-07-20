const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Full Name",
  "callsign": "optional nickname, or null",
  "roleArchetype": "Faction Leader | Quest-Giver | Colony VIP | Rival | Informant/Fixer | Merchant",
  "faction": "preservation | ferro_kings | the_board | glitch_kin | unaligned",
  "signatureQuote": "one sentence, first person, in voice",
  "physicalDescription": "2-4 sentences",
  "traits": ["trait1", "trait2", "trait3"],
  "contradiction": "one sentence — the trait that complicates the role",
  "wants": "stated goal",
  "actuallyNeeds": "the deeper driver",
  "speech": { "register": "...", "rhythm": "...", "tic": "...", "neverSay": "..." },
  "relationships": [
    { "type": "Faction allegiance", "toId": "the-ferro-kings", "toCategory": "factions", "toLabel": "The Ferro-Kings", "why": "..." }
  ],
  "dialogue": {
    "openingLine": "...",
    "branches": [ { "toneLabel": "If you respond respectfully — \\"...\\"", "reply": "..." } ]
  },
  "questHook": "1-2 sentences, or null if not a quest-giver",
  "designNotes": "how this avoids repeating an existing role/faction/contradiction/tic combo"
}`;

function buildNpcContentSystemPrompt({ rosterContext, name, role, faction }) {
  return `You are generating a named NPC for "Echoes of the Neon," a tactical RPG set in a subterranean industrial-horror colony after a societal collapse. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

ROLE ARCHETYPES (pick the closest match to the user's input, or choose one that fills a gap in the existing roster if unspecified):
- Faction Leader — sets a faction's agenda; embodies its philosophy personally, not as a mission statement.
- Quest-Giver — has a concrete want that becomes a mission hook; personality colors HOW they ask, not just what.
- Colony VIP — runs something (Archive, Workshop, Memorial); the player interacts with them repeatedly.
- Rival — works against the player/Colony without being a combat boss; political, economic, or personal opposition.
- Informant/Fixer — trades in information or access; morally grey; transactional relationship with the player.
- Merchant — runs an economic node; personality justifies their prices/inventory philosophy.

FACTION VOICE (the named character must sound like an individual within this, not a mission statement):
- The Preservation — institutional, procedural, clinical — but ONE crack in that surface: a personal stake they won't admit to.
- The Ferro-Kings — blunt, physical, values-driven; earns respect through visible competence/toughness, not title.
- The Board — corporate-horror register, KPIs and quarterly language applied to survival; darkly funny AND genuinely dangerous, never pure comic relief.
- Glitch-Kin — RARE, weighty exception only, never a default. A tragic figure: someone the Colony knew before the change, now caught between the swarm's network-logic and flickers of the person they were.
- Unaligned/Colony-native — doesn't have to perform a faction voice at all; can be the "normal" one, which is its own contrast.

RULE OF THUMB: the NPC needs one trait that COMPLICATES their role, not just decorates it (a Ferro-Kings enforcer secretly gentle with animals; a Board executive who genuinely believes they're saving people).

RELATIONSHIPS: at minimum, state a faction allegiance. Prefer connecting to an existing named NPC, faction, class, enemy, or survivor over a floating faction-only tie. State each as one concrete sentence with a reason — "Rival: the Press-Ganger — she ran his shift crew before the collapse and knows exactly how to needle him" — never just a label. Relationship types to draw from: faction allegiance, chain of command, rivalry/grudge (with a specific concrete reason), debt/obligation, historical pre-collapse connection, romantic/found-family (sparingly, with real weight).

SPEECH: define register (vocabulary type, tied to role/faction), rhythm (short/clipped vs long/looping — matters more than vocabulary), a tic (one small repeatable habit — used once or twice in the dialogue tree, never in every line), and one explicit thing they'd never say. Write the signature quote AFTER defining these — it should demonstrably use their voice and land on their contradiction or motivation in one line. Do not reuse it verbatim in the dialogue tree.

DIALOGUE TREE: one opening line + 2-3 branches + one reply each (~4-7 lines total). Each branch implies a different tone (e.g. respectful / transactional / hostile) and the reply should audibly shift with it.

QUEST HOOK: only if the archetype is Quest-Giver, or a hook falls out naturally — set to null otherwise, don't force one onto a Rival/Merchant.

EXISTING ROSTER (avoid repeating a role+faction combo, contradiction, or tic already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the faction/role"}
Role: ${role || "choose one that fills a gap in the existing roster"}
Faction: ${faction || "choose one that fills a gap in the existing roster"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildNpcContentSystemPrompt };
