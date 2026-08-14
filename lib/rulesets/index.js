// lib/rulesets/index.js
//
// Central registry for the multi-ruleset genericization project (see
// session_addendum_ruleset_genericization.md). A world picks a ruleset
// once, at creation (world_config.ruleset -- migrations/020), and every
// generation route dispatches through this file to find the right
// formulas/template/prompt module for that ruleset + category instead of
// hardcoding Echoes' modules directly.
//
// Echoes' entry below just points at the exact same files every route
// already imported directly before this project -- nothing about Echoes
// generation changes. New rulesets ('5e', 'generic') fill in one
// category at a time as each phase of the project ships; a category
// absent from a ruleset's entry means "not built yet for this ruleset",
// and callers (routes) are expected to check hasCategory() and respond
// with a clear "not available yet" error rather than silently falling
// back to Echoes' implementation.
//
// Deliberately NOT auto-discovering files from lib/rulesets/<id>/ --
// an explicit require() per entry means a typo'd or missing module fails
// loudly at server startup (require throws) instead of silently
// resolving to undefined at request time.

const { isAdminEmail } = require("../adminAccess");

// entry-linking (Phase 1): normalized `repo` slot per ruleset-varying
// category below, so lib/entryLinker.js can re-save/re-bake an entry
// after patching a resolved reference id without needing to know each
// category's real save-function signature (imageUrl vs genericSystem vs
// no-image-at-all all differ -- see lib/fileWriter.js/lib/rulesets/<id>/
// <x>Repo.js). Every `repo` function below normalizes to the single
// shape `async (worldId, content) => savedRow`, resolving whatever extra
// argument its underlying writer needs internally. NOT added for
// npcs/factions/logs/locations -- those have no ruleset-specific variant
// at all (see SHARED_CATEGORIES in lib/entryLinkRegistry.js), so
// entryLinker.js dispatches those directly against lib/fileWriter.js
// instead of through this registry (mirrors how every existing route
// already calls those four directly, never through getCategory()).
const { getPortraitUrl, saveEnemyEntry, saveClassEntry, saveItemEntry, saveSurvivorEntry } = require("../fileWriter");
const { getGenericSystem } = require("../worldConfigRepo");
const { save5eEnemyEntry } = require("./5e/enemyRepo");
const { save5eSpellEntry } = require("./5e/spellRepo");
const { save5eClassEntry } = require("./5e/classRepo");
const { save5eItemEntry } = require("./5e/itemRepo");
const { save5eSurvivorEntry } = require("./5e/survivorRepo");
const { saveGenericEnemyEntry } = require("./generic/enemyRepo");
const { saveGenericClassEntry } = require("./generic/classRepo");
const { saveGenericItemEntry } = require("./generic/itemRepo");
const { saveGenericSurvivorEntry } = require("./generic/survivorRepo");

const RULESET_IDS = ["echoes", "5e", "generic"];

// adminOnly: true means this ruleset is filtered out of every
// user-facing picker (wizard Step 1, Settings, docs) unless the current
// user passes isAdminEmail() -- see listRulesets() below. This is the
// ONLY gate; an existing Echoes world stays fully readable/generatable
// for any owner regardless of admin status (nothing in the generation
// routes themselves checks adminOnly -- only the picker does).
const RULESET_META = {
  echoes: {
    id: "echoes",
    label: "Echoes of the Neon",
    description: "Austin's own setting and mechanical system -- 6-attribute formulas, 1-99 class leveling with a Level 50 Evolution. Admin-only.",
    adminOnly: true
  },
  "5e": {
    id: "5e",
    label: "D&D 5th Edition (SRD)",
    description: "Real 5e rules -- ability scores, CR math, spell slots, 1-20 class leveling. Canonical content sourced from the free SRD (CC-BY-4.0).",
    adminOnly: false
  },
  generic: {
    id: "generic",
    label: "Generic / Homebrew",
    description: "A fully custom mechanical system you define -- your own attributes, and an optional derived-stat formula layer, or pure flavor-text stat blocks.",
    adminOnly: false
  }
};

// Per-ruleset, per-category module map. Shape of a filled-in category
// entry (not every field is required -- a category without formulas,
// e.g. Logs, just omits `formulas`):
//   {
//     formulas:    // stat/CR/rarity math -- lib/rulesets/<id>/<x>Formulas.js
//     template:    // buildXBodyHtml/buildXManifestEntry -- lib/rulesets/<id>/<x>Template.js
//     prompt:      // buildXContentSystemPrompt (homebrew/reflavor tiers) -- prompts/rulesets/<id>/xContentPrompt.js
//     levelConfig: // classes/survivors only -- leveling table, subclass-unlock levels, spell slot progression
//   }
const REGISTRY = {
  echoes: {
    factions: {
      template: require("../factionTemplate"),
      prompt: require("../../prompts/factionContentPrompt")
    },
    npcs: {
      template: require("../entryTemplate"),
      prompt: require("../../prompts/npcContentPrompt")
    },
    enemies: {
      formulas: require("../statFormulas"),
      template: require("../enemyTemplate"),
      prompt: require("../../prompts/enemyContentPrompt"),
      repo: async (worldId, content) => saveEnemyEntry(worldId, content, getPortraitUrl(worldId, content.id))
    },
    classes: {
      template: require("../classTemplate"),
      prompt: require("../../prompts/classContentPrompt"),
      repo: async (worldId, content) => saveClassEntry(worldId, content, getPortraitUrl(worldId, content.id))
    },
    items: {
      formulas: require("../itemFormulas"),
      template: require("../itemTemplate"),
      prompt: require("../../prompts/itemContentPrompt"),
      repo: async (worldId, content) => saveItemEntry(worldId, content, getPortraitUrl(worldId, content.id))
    },
    logs: {
      template: require("../logTemplate"),
      prompt: require("../../prompts/logContentPrompt")
    },
    survivors: {
      template: require("../survivorTemplate"),
      prompt: require("../../prompts/survivorContentPrompt"),
      repo: async (worldId, content) => saveSurvivorEntry(worldId, content, getPortraitUrl(worldId, content.id))
    },
    locations: {
      template: require("../locationTemplate"),
      prompt: require("../../prompts/locationContentPrompt")
    }
  },

  // Filled in incrementally: Phase 3 (enemies), Phase 4 (spells),
  // Phase 5 (classes), Phase 6 (items), Phase 7 (npcs), Phase 8
  // (survivors/Player Characters). Locations and Factions have no
  // ruleset-specific mechanics (pure narrative categories in every
  // ruleset today), so they're expected to stay absent here and fall
  // through to a shared/neutral template rather than being duplicated
  // per ruleset -- revisit if that stops being true.
  "5e": {
    enemies: {
      formulas: require("./5e/statFormulas"),
      template: require("./5e/enemyTemplate"),
      // No single `prompt` slot here on purpose -- 5e enemies have THREE
      // prompt-shaped tiers (reflavor/homebrew; import needs no prompt
      // at all), which doesn't fit this registry's one-prompt-per-Echoes-
      // category shape. routes/generateEnemy.js requires
      // prompts/rulesets/5e/enemyContentPrompt.js directly for those.
      repo: async (worldId, content) => save5eEnemyEntry(worldId, content, getPortraitUrl(worldId, content.id))
    },
    spells: {
      formulas: require("./5e/spellFormulas"),
      template: require("./5e/spellTemplate"),
      // Homebrew tier only -- see prompts/rulesets/5e/spellContentPrompt.js's
      // header for why (no structured CC-BY-4.0 spell dataset found).
      // Brand-new category for this ruleset -- Echoes has no spell
      // system at all, so its registry entry has no `spells` key (see
      // middleware/requireCategoryAvailable.js's comment on why that
      // matters for the gate to work correctly).
      repo: async (worldId, content) => save5eSpellEntry(worldId, content) // spells have no portrait
    },
    classes: {
      formulas: require("./5e/classFormulas"),
      template: require("./5e/classTemplate"),
      // Homebrew tier only -- see prompts/rulesets/5e/classContentPrompt.js's
      // header. Real 1-20 leveling/subclass-unlock/spell-slot math from
      // classFormulas.js; Echoes' own classTemplate.js/classFormulas.js
      // (1-99 + Level 50 Evolution) are completely separate files,
      // untouched.
      repo: async (worldId, content) => save5eClassEntry(worldId, content, getPortraitUrl(worldId, content.id))
    },
    items: {
      formulas: require("./5e/itemFormulas"),
      template: require("./5e/itemTemplate"),
      // Homebrew tier only. Real SRD weapon/armor lookup tables (not a
      // derived formula, per this project's scope doc) plus the DMG's
      // rarity value-range table for a sanity-check warning. Echoes'
      // own itemFormulas.js/itemTemplate.js untouched.
      repo: async (worldId, content) => save5eItemEntry(worldId, content, getPortraitUrl(worldId, content.id))
    },
    survivors: {
      formulas: require("./5e/survivorFormulas"),
      template: require("./5e/survivorTemplate"),
      // Phase 8 -- Player Characters, still stored under the "survivors"
      // category slug (see routes/generateSurvivor.js's header comment
      // for why the rename was scoped out). Homebrew tier only, built on
      // a real Class entry from Phase 5 -- HP/proficiency bonus/spell
      // slots are computed from that class's actual data, never
      // reimplemented here.
      repo: async (worldId, content) => save5eSurvivorEntry(worldId, content, getPortraitUrl(worldId, content.id))
    }
  },
  generic: {
    enemies: {
      formulas: require("./generic/statFormulas"),
      template: require("./generic/enemyTemplate"),
      // Homebrew ONLY, by definition -- there's no "official" content
      // for a made-up system to import/reflavor. Unlike every other
      // ruleset here, this template/formula pair needs the world's own
      // generic_system_json passed in at call time (routes/generateEnemy.js)
      // since attribute names/derived-stat formulas are entirely
      // world-defined, not fixed -- see
      // migrations/021_generic_ruleset_system.sql.
      repo: async (worldId, content) => saveGenericEnemyEntry(worldId, content, await getGenericSystem(worldId), getPortraitUrl(worldId, content.id))
    },
    classes: {
      template: require("./generic/classTemplate"),
      // No `formulas` slot -- Generic Classes are deliberately
      // narrative-first with no numeric leveling concept at all (see
      // lib/rulesets/generic/classTemplate.js's header for why), so
      // there's no formula module to point at.
      repo: async (worldId, content) => saveGenericClassEntry(worldId, content, await getGenericSystem(worldId), getPortraitUrl(worldId, content.id))
    },
    survivors: {
      formulas: require("./generic/statFormulas"),
      template: require("./generic/survivorTemplate"),
      // A PC is a real Generic Class instance (classId), with derived
      // stats computed via the same statFormulas.js formula engine
      // Bestiary already uses -- reuses it directly, doesn't fork it.
      repo: async (worldId, content) => saveGenericSurvivorEntry(worldId, content, await getGenericSystem(worldId), getPortraitUrl(worldId, content.id))
    },
    items: {
      template: require("./generic/itemTemplate"),
      // No `formulas` slot -- same narrative-first reasoning as
      // Classes, no rarity/pricing system exists for a made-up world.
      repo: async (worldId, content) => saveGenericItemEntry(worldId, content, await getGenericSystem(worldId), getPortraitUrl(worldId, content.id))
    }
  }
};

// Filters Echoes out for non-admins -- the ONLY place that gate lives.
// Called by routes/wizard.js's /wizard/ruleset-options; every downstream
// generation route trusts world_config.ruleset once it's set (an
// existing Echoes world stays generatable for anyone, admin or not --
// see this file's header comment).
function listRulesets(userEmail) {
  const admin = isAdminEmail(userEmail);
  return RULESET_IDS
    .filter((id) => admin || !RULESET_META[id].adminOnly)
    .map((id) => RULESET_META[id]);
}

function getRulesetMeta(rulesetId) {
  return RULESET_META[rulesetId] || null;
}

function isValidRuleset(rulesetId) {
  return RULESET_IDS.includes(rulesetId);
}

function getCategory(rulesetId, category) {
  const rs = REGISTRY[rulesetId];
  if (!rs) return null;
  return rs[category] || null;
}

function hasCategory(rulesetId, category) {
  return !!getCategory(rulesetId, category);
}

module.exports = {
  RULESET_IDS,
  RULESET_META,
  REGISTRY,
  listRulesets,
  getRulesetMeta,
  isValidRuleset,
  getCategory,
  hasCategory
};
