// prompts/classContentPrompt.js
//
// Generic playable-class generator (full Level 1-99 progression tree).
// Replaces the Echoes-specific version, which hardcoded a "blue-collar
// industrial horror" tone mandate, a fixed list of Colony rooms
// (Archive/Workshop/Memorial) for the evolution event location, and a
// one-off carve-out for Echoes' own "Neon-Jack" class. All of that is now
// derived from this world's own setting/lore instead.
//
// The six core attributes and seven weapon-skill categories stay fixed
// (mechanical, not narrative — see itemContentPrompt.js's header comment
// for the same reasoning) but field/flavor skill names are now invented
// per-world rather than pulled from Echoes' fixed Linguistics/Scavenging/
// Tinkering/Biology list.

const ABILITY_SCHEMA = `{ "level": 1, "name": "...", "kind": "Active | Passive | Ultimate Unlock | Final Unlock", "effectText": "ONE sentence, 25 words or fewer, combining the mechanical effect AND its scaling formula in bracketed/inline notation, e.g. 'Light damage, generates 1 Thread. Damage = Blade-work × 1.5.' — this goes in a single compact table cell, not a paragraph. If you cannot say it in 25 words, cut detail rather than run long." }`;

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "baseName": "The [Name]",
  "evolvedName": "The [Evolved Name]",
  "tagline": "first-person, one sentence, character-select-screen line — write this LAST after the full kit is drafted",
  "archetype": "2-3 role tags, e.g. 'Controller / Binder / Battlefield Manipulator'",
  "coreResourceName": "invented resource name fitting the class concept, e.g. 'Thread', 'Heat', 'Pressure'",
  "coreResourceDescription": "what it represents and how it's built/spent",
  "primaryAttribute": "this world's label for the governing attribute (parenthetical of what it governs for this class)",
  "secondaryAttribute": "this world's label for the secondary attribute (parenthetical)",
  "skillEfficiency": { "major": "1-2 skills, the build's core scaling", "minor": "1-2 supporting skills", "misc": "1-2 flavor/rare-interaction skills" },
  "tier1": { "title": "tier name", "theme": "one sentence tier theme", "abilities": [/* exactly 5 ${ABILITY_SCHEMA}, at levels roughly 1/5/10/15/20, the level-20 one MUST have kind 'Ultimate Unlock' and an ALL-CAPS name */] },
  "tier2": { "title": "tier name", "theme": "one sentence", "abilities": [/* 5-6 abilities, levels roughly 25/30/35/42/48, escalating power, setting up the evolution */] },
  "evolutionEvent": { "requirement": "a skill-level gate", "cost": "materials/resources this world's economy would plausibly require", "location": "a fitting location/institution in this world consistent with its lore", "visualShift": "1-2 sentences: how the character's appearance changes" },
  "tier3": { "title": "tier name (under the evolved identity)", "theme": "one sentence — this tier should start bending a rule the base class couldn't", "abilities": [/* 6 abilities, levels roughly 51/55/60/65/70/75, the level-75 one MUST have kind 'Ultimate Unlock' and an ALL-CAPS name */] },
  "tier4": { "title": "tier name", "theme": "one sentence, mythic register", "abilities": [/* 5 abilities, levels roughly 80/85/90/95/99, the level-99 one MUST have kind 'Final Unlock', an ALL-CAPS name, and be the single most powerful/iconic effect in the kit */] },
  "capstoneQuote": "a quote that reframes the character's whole arc — appears after Tier 4 as the closing emotional beat, short and catchy",
  "whyItWorks": [
    { "label": "The [Skill Name] Synergy", "text": "which non-obvious skill the build secretly depends on, and why that's satisfying" },
    { "label": "The [Resource/Gate Name]", "text": "a resource/gate mechanic that rewards or punishes neglecting a stat" },
    { "label": "The Fantasy Arc", "text": "one flowing sentence/paragraph: Level 1 — [who they start as]. Level 50 — [who they become]. Level 99 — [the mythic endpoint]." }
  ],
  "designNotes": "1-2 sentences: how this avoids colliding with an existing class's concept, core fantasy, or signature verb"
}`;

function buildClassContentSystemPrompt({ settingContext, loreContext, statLabelsText, rosterContext, name, existingContent }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  return `You are generating a full playable character class for a tabletop/game world — a character archetype or profession turned into a combat class, whichever fits this world's genre (a high-fantasy world wants archetypes like a Rogue or Paladin, not literal day jobs; an industrial/modern world wants real professions). Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

SETTING (stay consistent with this — tone, technology level, and what kind of class concept -- archetype or profession -- would plausibly exist here):
${settingContext}

If inventing the concept, pick something consistent with the setting above and distinct from the existing roster below -- an archetype (Rogue, Paladin) or a profession, whichever this world's genre actually calls for.

ATTRIBUTE LABELS (this world's own names for the six canonical attributes — always output these exact lowercase keys as primaryAttribute/secondaryAttribute references use these labels, don't invent others):
${statLabelsText}

WEAPON SKILLS (canonical seven — don't invent others): Heavy Weapons, Light Weapons, Polearm, Unarmed, Ballistics, Archery, Catalysts. FIELD SKILLS: invent 3-5 flavor skill names fitting this world's professions and setting (e.g. a scavenger-economy world might have "Scavenging" or "Appraisal"; a magic-adjacent world might have "Ritual Craft") — reuse the same invented field skill names consistently with the existing roster below rather than inventing a new synonym each time.

ATTRIBUTE PRIORITY: pick a primary (the class's core fantasy) and secondary (utility/survivability) attribute. Every ability should visibly scale off one of these two, or off a Field/Weapon Skill tied to the class concept. Do NOT compute literal numeric stat blocks (no base stat arrays) — just name which attributes/skills abilities scale from, same as the game's existing class sheets.

STRUCTURE (standard output is the full 1-99 tree):
- Skill Efficiency: Major (1.0x, 1-2 skills the build is built around) / Minor (0.5x) / Misc (0.2x).
- Tier 1 (Levels 1-20): 5 abilities (mix of Active/Passive), ending in a Level 20 ALL-CAPS "Ultimate Unlock."
- Tier 2 (Levels 21-49): 5-6 abilities, escalating power, setting up the evolution.
- Evolution Event (Level 50): a skill-level gate requirement, a resource/materials cost fitting this world's economy, a fitting location, and a visual shift description.
- Tier 3 (Levels 50-75, under the evolved name): 6 abilities that start bending a rule the base class couldn't (ignoring a mechanic, ignoring armor, manipulating a system directly), ending in a Level 75 ALL-CAPS "Ultimate Unlock."
- Tier 4 (Levels 76-99): 5 abilities escalating to a mythic register, ending in the Level 99 "Final Unlock" — the single most powerful, iconic effect in the kit.
- Why This Progression Works: exactly 3 named callouts (a non-obvious skill synergy, a resource/gate mechanic, and the Level 1→50→99 fantasy arc).

Every ability's effectText MUST be ONE compact sentence, 25 words or fewer, combining the mechanical effect AND a bracketed/inline scaling reference to a named skill/attribute (e.g. "Light damage, generates 1 Thread. Damage = Blade-work × 1.5.") — this renders as a single table cell, not a paragraph. Do NOT write multi-clause explanations of permanence, duration, or downstream consequences (e.g. do not write something like "the target loses all infrastructure authority permanently until re-certified, a process that takes weeks and requires political capital" — state the effect and its formula, nothing else). Passives that don't scale should say something like "N/A — Binary Unlock" inline rather than a formula.

WORLD LORE — GROUND TRUTH (stay consistent with this; don't contradict it):
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}
${regenerateBlock}
EXISTING ROSTER (if this class's concept, core fantasy, signature verb, or field skill names collide with something already generated, angle it differently rather than shipping a duplicate):
${rosterContext}

USER INPUT:
Concept/Name: ${name || "invent a class concept (archetype or profession, whichever fits this world's genre) fitting this world's setting, not already in the roster below"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildClassContentSystemPrompt };
