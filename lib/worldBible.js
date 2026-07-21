// lib/worldBible.js
//
// Loads lore/world_bible_sections.json once at process start and exposes
// getRelevantSections({ faction, category }) for the prompt builders in
// prompts/*.js to call. No embeddings, no retrieval scoring — the sections
// are already tagged at ingestion time (see scripts/ingestWorldBible.js),
// so lookup here is just a filter.

const fs = require("fs");
const path = require("path");

const SECTIONS_PATH = path.join(__dirname, "..", "lore", "world_bible_sections.json");

let _sections = null;

function loadSections() {
  if (_sections) return _sections;
  if (!fs.existsSync(SECTIONS_PATH)) {
    console.warn(
      `[worldBible] ${SECTIONS_PATH} not found — generators will run without ` +
        `world bible context. Run scripts/ingestWorldBible.js to create it.`
    );
    _sections = [];
    return _sections;
  }
  _sections = JSON.parse(fs.readFileSync(SECTIONS_PATH, "utf8"));
  return _sections;
}

// Force a reload without restarting the process — handy right after
// re-running ingestion during a dev session.
function reload() {
  _sections = null;
  return loadSections();
}

/**
 * Returns the sections relevant to a given generation call: every section
 * tagged `core: true`, plus any section tagged with the entry's faction
 * and/or category. De-duplicated, core sections first.
 *
 * @param {Object} opts
 * @param {string|null} opts.faction - e.g. "ferro_kings", or null/undefined
 *   for factionless categories (Items, Classes).
 * @param {string} opts.category - one of: factions, npcs, enemies, classes,
 *   items, logs, survivors.
 */
function getRelevantSections({ faction, category } = {}) {
  const sections = loadSections();
  const seen = new Set();
  const result = [];

  const push = (s) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    result.push(s);
  };

  // Core always comes first so it anchors the prompt as foundational tone
  // before the faction/category-specific material.
  sections.filter((s) => s.core).forEach(push);

  sections
    .filter((s) => {
      if (s.core) return false;
      // Faction-specific sections (e.g. each Part III faction write-up) are
      // only relevant when THIS faction matches — a category match alone
      // must not pull in every other faction's section too. Otherwise an
      // NPC generation for the Ferro-Kings would drag in the Preservation,
      // Board, and Glitch-Kin sections as well, just because they're all
      // tagged category:npcs.
      if (s.factionTags.length > 0) {
        return faction ? s.factionTags.includes(faction) : false;
      }
      // Faction-agnostic sections (e.g. Hex-Tongue, Classes) are fine to
      // match on category alone.
      return category ? s.categoryTags.includes(category) : false;
    })
    .forEach(push);

  return result;
}

/**
 * Formats sections into a single string block ready to drop into a system
 * prompt, e.g.:
 *
 *   ## Part III — History & Factions: The Ferro-Kings — "The Workers"
 *   <content>
 */
function formatSectionsForPrompt(sections) {
  if (!sections.length) return "";
  return sections
    .map((s) => `## ${s.part}: ${s.title}\n${s.content}`)
    .join("\n\n---\n\n");
}

/**
 * Convenience one-shot: get the relevant sections for a generation call,
 * already formatted as a prompt-ready string.
 */
function getWorldBibleContext({ faction, category } = {}) {
  return formatSectionsForPrompt(getRelevantSections({ faction, category }));
}

module.exports = {
  loadSections,
  reload,
  getRelevantSections,
  formatSectionsForPrompt,
  getWorldBibleContext,
};
