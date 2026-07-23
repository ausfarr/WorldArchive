// prompts/wizardSkillSystemPrompt.js
//
// Step 5, Skills section (alongside Stat Labels -- same step, same
// "mechanical structure fixed, only naming/flavor is generated"
// treatment). Two things, generated together in one call:
//
//   - weaponSkills: world-flavored DISPLAY names for the 7 mechanically
//     fixed weapon categories. The canonical keys and their numeric
//     balance ranges (lib/itemFormulas.js's WEAPON_ROLL_RANGES) never
//     change -- items still store/clamp against the fixed English key
//     internally (see prompts/itemContentPrompt.js), this label is only
//     ever shown to a reader.
//   - fieldSkills: a fixed pool of invented flavor skills, generated
//     once and reused by every class/item generation call afterward
//     (see prompts/classContentPrompt.js) instead of each call inventing
//     its own 3-5 with only a soft "try to reuse the roster" instruction
//     -- that soft instruction let near-duplicate skills accumulate
//     across a large roster (e.g. "Hacking" vs "Grid-Tap" vs "System
//     Intrusion" all meaning the same thing). A fixed, generated-once
//     pool is the same fix Stat Labels already applies to attributes.

// Same exact strings as lib/itemFormulas.js's WEAPON_ROLL_RANGES keys --
// this is deliberate, not a style choice: items store item.weaponSkill
// as one of these exact canonical strings for the damage-range clamp
// lookup, so the skill_system_json.weaponSkills map has to be keyed the
// same way for a canonical-key -> display-label lookup to work.
const WEAPON_SKILL_KEYS = {
  "Heavy Weapons": "canonical example forms: Axe, Sledgehammer, Maul, War Cleaver",
  "Light Weapons": "canonical example forms: Knife, Dagger, Shiv, Box Cutter",
  "Polearm": "canonical example forms: Spear, Staff, Pike, Halberd",
  "Unarmed": "canonical example forms: Fists, Knuckle Wraps, Claws, Grapple Rig",
  "Ballistics": "canonical example forms: Pistol, Rifle, and other firearms",
  "Archery": "canonical example forms: Bow, Crossbow, Throwing Knives, Sling",
  "Catalysts": "canonical example forms: Battery Rod, Focus Crystal, Charge Coil, Signal Wand"
};

const FIELD_SKILL_COUNT = 18;

const SCHEMA_DESCRIPTION = `{
  "weaponSkills": {
    "Heavy Weapons": "world-flavored display name for this category, e.g. 'Greatblades' or 'Siegecraft' -- reinterpret the weapon FORM freely to fit this world's genre (a fantasy world has no literal firearms) as long as it still reads as a distinct, real weapon category at roughly this power tier -- return this under the EXACT key \"Heavy Weapons\", not a translated/renamed key",
    "Light Weapons": "...",
    "Polearm": "...",
    "Unarmed": "...",
    "Ballistics": "...",
    "Archery": "...",
    "Catalysts": "..."
  },
  "fieldSkills": [
    { "name": "invented skill name fitting this world", "description": "one sentence: what having this skill lets a character do" }
    /* exactly ${FIELD_SKILL_COUNT} of these, each meaningfully distinct from the others -- no two skills should mean roughly the same thing */
  ]
}`;

function buildWizardSkillSystemPrompt({ step1, loreContext, statLabelsText }) {
  const s = step1 || {};
  const knownContext = [
    s.worldName ? `World name: ${s.worldName}` : null,
    s.genre && s.genre.length ? `Genre & tone: ${Array.isArray(s.genre) ? s.genre.join(", ") : s.genre}` : null,
    s.era ? `Era/tech level: ${s.era}` : null,
    s.supernaturalSystem ? `Supernatural/speculative system: ${s.supernaturalSystem}` : null
  ].filter(Boolean).join("\n");

  const weaponSkillBlock = Object.entries(WEAPON_SKILL_KEYS)
    .map(([key, desc]) => `- ${key}: ${desc}`)
    .join("\n");

  return `You are naming a tabletop/game world's weapon categories and inventing its pool of character skills. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

WEAPON SKILLS: there are exactly 7 mechanically fixed weapon categories (their numeric balance never changes) -- you're only naming each one to fit this world. Every category must still represent a real, distinct weapon type at roughly its existing power tier; reinterpret the FORM freely (a fantasy world might turn "Ballistics" into siege engines or thrown alchemy rather than firearms) but don't turn a category into something that isn't a weapon, and don't make two categories sound like the same weapon:
${weaponSkillBlock}

FIELD SKILLS: invent exactly ${FIELD_SKILL_COUNT} distinct flavor skills fitting this world's professions, technology, and themes (e.g. a scavenger-economy world might have "Scavenging" or "Appraisal"; a magic-adjacent world might have "Ritual Craft"). These become the FIXED pool every class and item in this world draws from afterward, so aim for genuine breadth -- distinct domains (physical trades, social/mental skills, technical/magical specialties, survival, etc.) rather than 18 minor variations on one theme. No two skills should mean roughly the same thing.

ATTRIBUTE LABELS (this world's own names for the six canonical attributes, for context/consistency only -- do not duplicate one of these as a field skill):
${statLabelsText || "(not yet generated)"}

SEED & VISION (grounding context):
${knownContext || "(nothing provided -- use general genre conventions)"}

WORLD LORE (grounding context, if available):
${loreContext || "(no lore saved yet for this world)"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildWizardSkillSystemPrompt, WEAPON_SKILL_KEYS, FIELD_SKILL_COUNT };
