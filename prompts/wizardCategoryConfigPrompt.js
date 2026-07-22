// prompts/wizardCategoryConfigPrompt.js
//
// Step 7 (Category Configuration). Option B, locked decision: the 7
// backend content categories stay fixed -- this only generates a
// world-flavored display label + short blurb for each, not new
// categories. One combined call for all 7, same precedent as Steps 1/3/5.

const CANONICAL_CATEGORIES = {
  npcs: "Named, significant characters -- faction leaders, quest-givers, rivals, informants, merchants.",
  enemies: "Combat threats with stat blocks -- trash/elite/boss-tier monsters or hostiles.",
  items: "Weapons, armor, consumables, and quest items.",
  classes: "Playable character professions/archetypes with a full progression tree.",
  logs: "Found-text lore artifacts -- recordings, journals, terminal dumps.",
  survivors: "Rank-and-file recruits for the player's own roster/base.",
  factions: "The major organized powers/groups in the world."
};

const SCHEMA_DESCRIPTION = `{
  "npcs": { "label": "world-flavored display name for this category", "blurb": "one short sentence, in-world flavor, what this category means here" },
  "enemies": { "label": "...", "blurb": "..." },
  "items": { "label": "...", "blurb": "..." },
  "classes": { "label": "...", "blurb": "..." },
  "logs": { "label": "...", "blurb": "..." },
  "survivors": { "label": "...", "blurb": "..." },
  "factions": { "label": "...", "blurb": "..." }
}`;

function buildWizardCategoryConfigSystemPrompt({ step1, loreContext }) {
  const s = step1 || {};
  const knownContext = [
    s.genre && s.genre.length ? `Genre & tone: ${Array.isArray(s.genre) ? s.genre.join(", ") : s.genre}` : null,
    s.era ? `Era/tech level: ${s.era}` : null
  ].filter(Boolean).join("\n");

  const categoryList = Object.entries(CANONICAL_CATEGORIES)
    .map(([key, desc]) => `- ${key}: ${desc}`)
    .join("\n");

  return `You are renaming a tabletop/game world's 7 FIXED content categories to fit its own in-world vocabulary. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

The categories and what each one actually contains are FIXED and do not change -- only the display label and a short flavor blurb change. A good label reads as native to this world's own terminology (e.g. "NPCs" might become "Named Contacts" or "The Ledger" depending on the setting) while still being clear enough that a user recognizes what they'll find there.

WHAT EACH FIXED CATEGORY ACTUALLY CONTAINS (do not contradict this):
${categoryList}

SEED & VISION (grounding context):
${knownContext || "(nothing provided -- use general genre conventions)"}

WORLD LORE (grounding context, if available):
${loreContext || "(no lore saved yet for this world)"}

Return JSON matching this exact schema, with one entry per category listed above:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildWizardCategoryConfigSystemPrompt, CANONICAL_CATEGORIES };
