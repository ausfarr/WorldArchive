// lib/loreContext.js
//
// Per-world equivalent of lib/worldBible.js's getRelevantSections/
// getWorldBibleContext, for the Wizard's own generators (Factions and
// beyond) to ground themselves in a world's saved lore_sections instead
// of Austin's hardcoded Echoes World Bible. Deliberately a separate
// module rather than modifying worldBible.js -- that file stays exactly
// as-is for the legacy Echoes archive generators until Phase 3
// genericizes them properly; this is the wizard-only path in the
// meantime (see this session's chat: intentional, documented duplication,
// not an oversight).

const { listLoreSections } = require("./loreRepo");

// Same filtering shape as worldBible.js: core sections always included,
// plus sections tagged with the target category. No faction filtering
// here (yet) -- lore_sections' faction_tags are backfilled AFTER a
// world's factions are saved (see loreRepo.backfillFactionTags), so at
// Faction-generation time itself there's nothing to filter by faction on.
async function getRelevantLoreSections(worldId, { category } = {}) {
  const sections = await listLoreSections(worldId);
  return sections.filter((s) => {
    if (s.core) return true;
    const tags = s.category_tags || [];
    return category ? tags.includes(category) : false;
  });
}

function formatLoreSectionsForPrompt(sections) {
  if (!sections.length) return "";
  return sections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n---\n\n");
}

async function getLoreContext(worldId, { category } = {}) {
  const sections = await getRelevantLoreSections(worldId, { category });
  return formatLoreSectionsForPrompt(sections);
}

module.exports = { getRelevantLoreSections, formatLoreSectionsForPrompt, getLoreContext };
