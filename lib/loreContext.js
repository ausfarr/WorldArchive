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

// Same filtering shape as worldBible.js's getRelevantSections: core
// sections always included; faction-tagged sections only match when
// `faction` is given AND matches (so an NPC generation for Faction A
// doesn't drag in every other faction's lore just because they're all
// tagged category:npcs); faction-agnostic sections match on category
// alone. Faction filtering only does anything once
// loreRepo.backfillFactionTags has run (i.e. after a world's factions
// are saved) -- before that, every section has empty faction_tags and
// this behaves exactly like the old category-only filter.
async function getRelevantLoreSections(worldId, { category, faction } = {}) {
  const sections = await listLoreSections(worldId);
  return sections.filter((s) => {
    if (s.core) return true;
    const factionTags = s.faction_tags || [];
    if (factionTags.length > 0) {
      return faction ? factionTags.includes(faction) : false;
    }
    const categoryTags = s.category_tags || [];
    return category ? categoryTags.includes(category) : false;
  });
}

function formatLoreSectionsForPrompt(sections) {
  if (!sections.length) return "";
  return sections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n---\n\n");
}

async function getLoreContext(worldId, { category, faction } = {}) {
  const sections = await getRelevantLoreSections(worldId, { category, faction });
  return formatLoreSectionsForPrompt(sections);
}

module.exports = { getRelevantLoreSections, formatLoreSectionsForPrompt, getLoreContext };
