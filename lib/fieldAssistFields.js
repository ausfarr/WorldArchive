// lib/fieldAssistFields.js
//
// v0.9 Manual Mode, Piece 2 -- server-side registry of which fields
// "Help me" actually applies to, plus how much room the model gets and
// whether QUOTE_CRAFT_GUIDANCE applies.
//
// This is a DELIBERATE SUBSET of archive/js/render.js's FIELD_HINTS, not
// the full list -- FIELD_HINTS also contains entries that no longer (or
// never did) point at a real free-text input:
//   - fields that render as a dropdown (efSelect) despite having a
//     FIELD_HINTS entry left over from before they became one: locationId,
//     weaponSkill, className, foundAtLocationId, evo-locationId, rarity,
//     category, tier, logType, primaryAttribute, secondaryAttribute,
//     relevantStat
//   - numeric fields (type: "number"): the six attributes, age, damageMin/
//     damageMax, effectorTier, apCost, phase-threshold -- no canonical
//     value range exists anywhere in the system to suggest a number
//     against (flagged, not solved, in
//     session_addendum_manual_mode_polish_round3.md)
//   - ef-skill-major/minor/misc are stale keys too -- the real DOM ids
//     are ef-skill-major-fallback etc. (only rendered pre-Wizard-Step-5,
//     when there's no skill system to build the row-editor picker from)
//
// Kept as a separate server-side copy rather than requiring
// archive/js/render.js's FIELD_HINTS directly from server code -- that
// file is client JS (browser globals, DOM calls throughout), not a
// shared module, so importing it here isn't viable. Hint text is
// duplicated by design; if you add/edit a hint in FIELD_HINTS, mirror
// the same wording here for any field that also gets "Help me".
//
// LENGTH TIERS control max_tokens for the Claude call -- a generous
// ceiling, not a target; the field's own hint text (used as the model's
// instruction) already implies the right length in most cases (e.g.
// "traits" says "3-5 short adjectives, comma-separated"). Three tiers
// rather than per-field tuning, since a few tokens of slack either way
// doesn't matter for cost at this volume and per-field tuning would be a
// lot of upkeep for no real benefit.
const SHORT = 60;   // a name, a tag, a one-line label
const MEDIUM = 130;  // one to two sentences
const LONG = 350;   // a real paragraph

// Fields where QUOTE_CRAFT_GUIDANCE (lib/promptGuidance.js) applies --
// the same antithesis-crutch guidance wired into every full-generation
// prompt that asks for a punchy line, reused here at the single-field
// level so a "Help me" suggestion for a quote field doesn't fall into
// the same "I don't X -- I Y" pattern the full generators already guard
// against.
const QUOTE_FIELDS = new Set(["ef-signatureQuote", "ef-dialogue-opening", "ef-capstoneQuote", "ef-overviewQuote"]);

const FIELD_ASSIST_FIELDS = {
  "ef-callsign": { hint: "A nickname or alias people actually call them, if any — leave blank if they don't have one.", tokens: SHORT },
  "ef-roleArchetype": { hint: "Their function in the world at a glance — quest-giver, merchant, rival, etc. Drives what other fields expect from them.", tokens: SHORT },
  "ef-signatureQuote": { hint: "One line that sounds like them — something they'd actually say, not a description of them.", tokens: MEDIUM },
  "ef-physicalDescription": { hint: "What someone would notice in the first few seconds of meeting them.", tokens: MEDIUM },
  "ef-traits": { hint: "3-5 short adjectives or phrases, comma-separated — the words you'd use to describe them to another GM in ten seconds.", tokens: SHORT },
  "ef-contradiction": { hint: "The tension that makes them feel real — two things about them that don't quite fit together (e.g. \"ruthless negotiator, soft for stray animals\").", tokens: MEDIUM },
  "ef-wants": { hint: "What they'd say they want if you asked them directly.", tokens: MEDIUM },
  "ef-actuallyNeeds": { hint: "What they actually need, which may or may not be the same thing as what they want — this is usually the more interesting one.", tokens: MEDIUM },
  "ef-speech-register": { hint: "How formal or casual their speech is — clipped military jargon, flowery and archaic, blunt street slang, etc.", tokens: MEDIUM },
  "ef-speech-rhythm": { hint: "The shape of how they talk — short and clipped, rambling, one-word answers, overly precise.", tokens: MEDIUM },
  "ef-speech-tic": { hint: "A verbal habit that repeats — a filler word, a stutter, a catchphrase, always trailing off.", tokens: SHORT },
  "ef-speech-neverSay": { hint: "A word, phrase, or topic that's out of character for them — useful for keeping their dialogue consistent later.", tokens: SHORT },
  "ef-dialogue-opening": { hint: "The actual first line they say when a PC approaches them.", tokens: MEDIUM },
  "ef-questHook": { hint: "A reason a party would end up dealing with this NPC — optional if they're pure flavor.", tokens: MEDIUM },
  "ef-role": { hint: "Their function in a fight — brute, sniper, support caster, swarm unit, etc.", tokens: SHORT },
  "ef-flavor": { hint: "A short paragraph of atmosphere/description — how this enemy or item looks, feels, or moves. Not mechanical.", tokens: LONG },
  "ef-phase-description": { hint: "What actually changes when they hit that threshold — new attack, enrage, calls for help, etc.", tokens: MEDIUM },
  "ef-combat-positioning": { hint: "Where this enemy wants to be relative to the party — melee range, backline, flanking, etc.", tokens: SHORT },
  "ef-combat-applies": { hint: "Any status effect or condition this enemy inflicts.", tokens: SHORT },
  "ef-combat-vulnerableTo": { hint: "A damage type, status, or tactic this enemy is weak against.", tokens: SHORT },
  "ef-combat-drops": { hint: "What a PC gets for defeating it, if anything.", tokens: SHORT },
  "ef-designNotes": { hint: "GM-only notes — never shown to players, just for your own reference.", tokens: LONG },
  "ef-locationContext": { hint: "Where this was found or takes place, in your own words — doesn't need to match an archived Location exactly.", tokens: MEDIUM },
  "ef-characters": { hint: "Who's speaking or being referenced in this log.", tokens: MEDIUM },
  "ef-context": { hint: "A short GM-facing summary of what this log is and why it matters — shown as a preface, not part of the found text itself.", tokens: MEDIUM },
  "ef-bodyText": { hint: "The actual found-text content, exactly as a player would read it.", tokens: LONG },
  "ef-descriptorLine": { hint: "One sentence that captures the feel of this place — what a PC would notice on arrival.", tokens: MEDIUM },
  "ef-regionBiome": { hint: "The broader terrain or region type this location sits in.", tokens: SHORT },
  "ef-notableFeatures": { hint: "What's actually here — landmarks, structures, hazards, points of interest.", tokens: MEDIUM },
  "ef-dangerTags": { hint: "Short tags for what makes this place risky, comma-separated (e.g. \"unstable footing, hostile wildlife\") — leave blank if it's safe.", tokens: SHORT },
  "ef-hooksSecrets": { hint: "Something a GM could use to pull a party here, or something hidden here worth discovering — optional.", tokens: MEDIUM },
  "ef-baseName": { hint: "The class's name before it evolves — what players see for most of the game.", tokens: SHORT },
  "ef-evolvedName": { hint: "The class's name after its Level 50 (or equivalent late-game) evolution.", tokens: SHORT },
  "ef-tagline": { hint: "A one-line pitch for the class — what makes someone want to play it.", tokens: SHORT },
  "ef-archetype": { hint: "The class's broad combat role — tank, striker, support, controller, etc.", tokens: SHORT },
  "ef-coreResourceName": { hint: "The resource this class spends to do its thing — Rage, Focus, Ammo, whatever fits the world's tone.", tokens: SHORT },
  "ef-coreResourceDescription": { hint: "How that resource is earned and spent.", tokens: MEDIUM },
  "ef-skill-major-fallback": { hint: "Skills this class is naturally best at (full/1.0x effectiveness), comma-separated.", tokens: SHORT },
  "ef-skill-minor-fallback": { hint: "Skills this class is decent at (half/0.5x effectiveness), comma-separated.", tokens: SHORT },
  "ef-skill-misc-fallback": { hint: "Skills this class is weak at but not locked out of (0.2x effectiveness), comma-separated.", tokens: SHORT },
  "ef-evo-requirement": { hint: "What a character needs to do or reach to unlock the evolved form.", tokens: MEDIUM },
  "ef-evo-cost": { hint: "What it costs them to evolve — an item, a sacrifice, a story cost.", tokens: MEDIUM },
  "ef-evo-location": { hint: "Where the evolution happens, in your own words.", tokens: SHORT },
  "ef-evo-visualShift": { hint: "How their appearance changes when they evolve.", tokens: MEDIUM },
  "ef-capstoneQuote": { hint: "A line of dialogue or narration for the moment they evolve.", tokens: MEDIUM },
  "ef-why0-label": { hint: "A short header for one reason to play this class (e.g. \"For players who want:\").", tokens: SHORT },
  "ef-why0-text": { hint: "The actual pitch under that header.", tokens: MEDIUM },
  "ef-why1-label": { hint: "A short header for a second reason to play this class.", tokens: SHORT },
  "ef-why1-text": { hint: "The actual pitch under that header.", tokens: MEDIUM },
  "ef-why2-label": { hint: "A short header for a third reason to play this class.", tokens: SHORT },
  "ef-why2-text": { hint: "The actual pitch under that header.", tokens: MEDIUM },
  "ef-weaponType": { hint: "The specific kind of weapon within that skill (e.g. \"combat knife\" under Blades).", tokens: SHORT },
  "ef-appliesStatus": { hint: "A status effect this item inflicts on use or hit, if any.", tokens: SHORT },
  "ef-rarityEffect": { hint: "A bonus effect that only kicks in at Uncommon rarity or higher.", tokens: MEDIUM },
  "ef-effect": { hint: "What this item actually does when used, worn, or triggered.", tokens: LONG },
  "ef-whereFoundWhyMatters": { hint: "Where a party would find this and why it's worth finding.", tokens: MEDIUM },
  "ef-playerName": { hint: "The real person playing this character, if you track that — leave blank for an NPC-run survivor.", tokens: SHORT },
  "ef-backstory": { hint: "How they ended up here — their history before the story starts.", tokens: LONG },
  "ef-personality-trait": { hint: "A short adjective or phrase describing their personality.", tokens: SHORT },
  "ef-personality-contradiction": { hint: "The tension in who they are — two things about them that don't quite fit together.", tokens: MEDIUM },
  "ef-personality-wants": { hint: "What they'd say they want if asked.", tokens: MEDIUM },
  "ef-personality-actuallyNeeds": { hint: "What they actually need, which isn't always the same as what they want.", tokens: MEDIUM },
  "ef-bond-name": { hint: "The name of this character's personality quirk / mechanical bond, Darkest-Dungeon-style (e.g. \"Superstitious\").", tokens: SHORT },
  "ef-bond-effect": { hint: "What that quirk actually does mechanically at the table.", tokens: MEDIUM },
  "ef-bond-flavorLine": { hint: "A short flavor line for the quirk — how it shows up narratively.", tokens: MEDIUM },
  "ef-nickname": { hint: "What this faction is called informally, if anything — a slur, a slang name, what rivals call them.", tokens: SHORT },
  "ef-overviewQuote": { hint: "A line that captures how this faction is perceived from the outside.", tokens: MEDIUM },
  "ef-corePhilosophy": { hint: "The belief or principle that drives everything this faction does.", tokens: MEDIUM },
  "ef-origin": { hint: "How this faction came to exist.", tokens: MEDIUM },
  "ef-structureHierarchy": { hint: "How power and decision-making actually flow inside the faction — who answers to whom.", tokens: MEDIUM },
  "ef-territory": { hint: "Where this faction operates or holds ground.", tokens: MEDIUM },
  "ef-goalsNearTerm": { hint: "What this faction is actively working toward right now.", tokens: MEDIUM },
  "ef-goalsLongTerm": { hint: "What this faction ultimately wants, even if it's far off.", tokens: MEDIUM },
  "ef-internalTensions": { hint: "Conflict or disagreement within the faction itself — not everyone inside agrees on everything.", tokens: MEDIUM },
  "ef-iconography": { hint: "Symbols, colors, or visual motifs associated with this faction.", tokens: MEDIUM },
  "ef-economyResources": { hint: "How this faction sustains itself — what it produces, trades, or extracts.", tokens: MEDIUM },
  "ef-joining": { hint: "What it takes for an outsider to join, or for this faction to absorb another group.", tokens: MEDIUM }
};

function getFieldAssistConfig(fieldId) {
  return FIELD_ASSIST_FIELDS[fieldId] || null;
}

function isQuoteField(fieldId) {
  return QUOTE_FIELDS.has(fieldId);
}

module.exports = { FIELD_ASSIST_FIELDS, getFieldAssistConfig, isQuoteField };
