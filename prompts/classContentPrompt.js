const { getWorldBibleContext } = require("../lib/worldBible");
const ABILITY_SCHEMA = `{ "level": 1, "name": "...", "kind": "Active | Passive | Ultimate Unlock | Final Unlock", "effectText": "one sentence combining the mechanical effect AND its scaling formula in bracketed/inline notation, e.g. 'Light damage, generates 1 Thread. Damage = Blade-work × 1.5.' — this goes in a single compact table cell, not a separate blockquote/Scaling pair" }`;

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "baseName": "The [Name]",
  "evolvedName": "The [Evolved Name]",
  "tagline": "first-person, one sentence, character-select-screen line — write this LAST after the full kit is drafted",
  "archetype": "2-3 role tags, e.g. 'Controller / Binder / Battlefield Manipulator'",
  "coreResourceName": "invented resource name fitting the profession, e.g. 'Thread', 'Heat', 'Pressure'",
  "coreResourceDescription": "what it represents and how it's built/spent",
  "primaryAttribute": "ATTRIBUTE (parenthetical of what it governs for this class)",
  "secondaryAttribute": "ATTRIBUTE (parenthetical)",
  "skillEfficiency": { "major": "1-2 skills, the build's core scaling", "minor": "1-2 supporting skills", "misc": "1-2 flavor/rare-interaction skills" },
  "tier1": { "title": "tier name", "theme": "one sentence tier theme", "abilities": [/* exactly 5 ${ABILITY_SCHEMA}, at levels roughly 1/5/10/15/20, the level-20 one MUST have kind 'Ultimate Unlock' and an ALL-CAPS name */] },
  "tier2": { "title": "tier name", "theme": "one sentence", "abilities": [/* 5-6 abilities, levels roughly 25/30/35/42/48, escalating power, setting up the evolution */] },
  "evolutionEvent": { "requirement": "a skill-level gate", "cost": "crafting materials (Scrap/Neon Vials/components)", "location": "an existing Colony room: Archive, Workshop, Memorial, or another established room fitting the class's fantasy", "visualShift": "1-2 sentences: how the character's appearance changes" },
  "tier3": { "title": "tier name (under the evolved identity)", "theme": "one sentence — this tier should start bending a rule the base class couldn't", "abilities": [/* 6 abilities, levels roughly 51/55/60/65/70/75, the level-75 one MUST have kind 'Ultimate Unlock' and an ALL-CAPS name */] },
  "tier4": { "title": "tier name", "theme": "one sentence, mythic register", "abilities": [/* 5 abilities, levels roughly 80/85/90/95/99, the level-99 one MUST have kind 'Final Unlock', an ALL-CAPS name, and be the single most powerful/iconic effect in the kit */] },
  "capstoneQuote": "a quote that reframes the character's whole arc — appears after Tier 4 as the closing emotional beat, short and catchy",
  "whyItWorks": [
    { "label": "The [Skill Name] Synergy", "text": "which non-obvious skill the build secretly depends on, and why that's satisfying" },
    { "label": "The [Resource/Gate Name]", "text": "a resource/gate mechanic that rewards or punishes neglecting a stat" },
    { "label": "The Fantasy Arc", "text": "one flowing sentence/paragraph: Level 1 — [who they start as]. Level 50 — [who they become]. Level 99 — [the mythic endpoint]." }
  ],
  "designNotes": "1-2 sentences: how this avoids colliding with an existing class's profession, core fantasy, or signature verb"
}`;

function buildClassContentSystemPrompt({ rosterContext, name, existingContent }) {
  const worldBibleContext = getWorldBibleContext({ faction: null, category: "classes" });
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/world-bible context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";
  return `You are generating a full playable character class for "Echoes of the Neon," a tactical RPG set in a subterranean industrial-horror colony after a societal collapse — professions turned into combat classes (Courier, Bouncer, Neon-Jack). Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

TONE: blue-collar industrial horror. Abilities and lore should feel like repurposed tools/jobs, not magic-fantasy powers (no wizards, knights, glowing swords). If inventing the profession, pick something blue-collar/industrial in the same register as the existing roster (Butcher, Electrician, Courier, Idol) — never a fantasy class. The Neon-Jack is the ONE sanctioned "special/mutant" exception in this world; don't create a second Neon-touched class unless explicitly asked.

ATTRIBUTES (canonical six — don't invent others): BODY (max HP/melee/physical resist), REFLEX (turn order/dodge/accuracy), KNOWLEDGE (tech damage/learning speed), PRESENCE (buff/debuff potency), SANITY (stability/panic resist), FATE (crit chance/loot rarity).

WEAPON SKILLS (canonical seven — don't invent others): Heavy Weapons, Light Weapons, Polearm, Unarmed, Ballistics, Archery, Catalysts. FIELD SKILLS: Linguistics, Scavenging, Tinkering, Biology. A tech/energy class should scale off Catalysts, not an invented skill; panic-resistance effects scale off SANITY directly, not an invented skill.

ATTRIBUTE PRIORITY: pick a primary (the class's core fantasy) and secondary (utility/survivability) attribute. Every ability should visibly scale off one of these two, or off a Field/Weapon Skill tied to the profession. Do NOT compute literal numeric stat blocks (no base stat arrays) — just name which attributes/skills abilities scale from, same as the game's existing class sheets.

STRUCTURE (standard output is the full 1-99 tree):
- Skill Efficiency: Major (1.0x, 1-2 skills the build is built around) / Minor (0.5x) / Misc (0.2x).
- Tier 1 (Levels 1-20): 5 abilities (mix of Active/Passive), ending in a Level 20 ALL-CAPS "Ultimate Unlock."
- Tier 2 (Levels 21-49): 5-6 abilities, escalating power, setting up the evolution.
- Evolution Event (Level 50): a skill-level gate requirement, a crafting cost, an existing Colony room location, and a visual shift description.
- Tier 3 (Levels 50-75, under the evolved name): 6 abilities that start bending a rule the base class couldn't (ignoring a mechanic, ignoring armor, manipulating a system directly), ending in a Level 75 ALL-CAPS "Ultimate Unlock."
- Tier 4 (Levels 76-99): 5 abilities escalating to a mythic register, ending in the Level 99 "Final Unlock" — the single most powerful, iconic effect in the kit.
- Why This Progression Works: exactly 3 named callouts (a non-obvious skill synergy, a resource/gate mechanic, and the Level 1→50→99 fantasy arc).

Every ability's effectText should read as ONE compact sentence combining the mechanical effect AND a bracketed/inline scaling reference to a named skill/attribute (e.g. "Light damage, generates 1 Thread. Damage = Blade-work × 1.5.") — this renders as a single table cell, not a verbose block. Passives that don't scale should say something like "N/A — Binary Unlock" inline rather than a formula.

WORLD BIBLE — GROUND TRUTH LORE (stay consistent with this; don't contradict it):
${worldBibleContext}
${regenerateBlock}
EXISTING ROSTER (if this class's profession, core fantasy, or signature verb collides with something already generated, angle it differently rather than shipping a duplicate):
${rosterContext}

USER INPUT:
Concept/Name: ${name || "invent a blue-collar profession not already in the roster below"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildClassContentSystemPrompt };
