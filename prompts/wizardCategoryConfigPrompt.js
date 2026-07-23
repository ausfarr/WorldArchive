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
  "_site": {
    "title": "the archive site's own name/brand for this world (2-4 words) -- grounded in the world's own name/vocabulary if one was given, otherwise invent something fitting (e.g. 'The Ledger', 'The Dossier', 'The Undercroft Archive')",
    "tagline": "one punchy sentence for the homepage hero -- what this archive IS and who it's compiled for, written in this world's own voice, replacing a generic description",
    "statusLine": "a short in-world status line for the homepage header, 3 segments joined by ' \u00b7 ', e.g. 'Year 27 YSS \u00b7 Population 40,000-60,000 \u00b7 Status: active development' -- segment 1 is an in-world date/era/cycle marker, segment 2 is a scale-appropriate stat (population is NOT always right -- for a Multiverse-scale world use known realms/factions/whatever fits, not people), segment 3 is always 'Status: <one or two words>' describing the state of things in-world right now. Must fit this world's own genre/scale/era.",
    "footer": "one short line for the site footer, in-world flavor (e.g. an internal classification, build status, or similar phrase this world's factions/institutions would actually stamp on a document) -- avoid literally saying 'archive build' unless that fits the world's own vocabulary"
  },
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
    s.worldName ? `World name: ${s.worldName}` : null,
    s.genre && s.genre.length ? `Genre & tone: ${Array.isArray(s.genre) ? s.genre.join(", ") : s.genre}` : null,
    s.scale ? `Scale: ${s.scale}` : null,
    s.era ? `Era/tech level: ${s.era}` : null
  ].filter(Boolean).join("\n");

  const categoryList = Object.entries(CANONICAL_CATEGORIES)
    .map(([key, desc]) => `- ${key}: ${desc}`)
    .join("\n");

  return `You are renaming a tabletop/game world's 7 FIXED content categories to fit its own in-world vocabulary, and giving the archive site itself a name and voice. Output ONLY valid JSON matching the schema below -- no markdown, no prose, no code fences.

The categories and what each one actually contains are FIXED and do not change -- only the display label and a short flavor blurb change. A good label reads as native to this world's own terminology (e.g. "NPCs" might become "Named Contacts" or "The Ledger" depending on the setting) while still being clear enough that a user recognizes what they'll find there.

The _site block replaces the archive's own generic branding ("The Archive") with something grounded in this world -- if a world name was given below, let it inform the title directly rather than inventing something unrelated.

WHAT EACH FIXED CATEGORY ACTUALLY CONTAINS (do not contradict this):
${categoryList}

SEED & VISION (grounding context):
${knownContext || "(nothing provided -- use general genre conventions)"}

WORLD LORE (grounding context, if available):
${loreContext || "(no lore saved yet for this world)"}

Return JSON matching this exact schema, with one entry per category listed above plus _site:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildWizardCategoryConfigSystemPrompt, CANONICAL_CATEGORIES };
