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
// generation changes. New rulesets ('5e', 'pf2e', 'generic') fill in one
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

const RULESET_IDS = ["echoes", "5e", "pf2e", "generic"];

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
  pf2e: {
    id: "pf2e",
    label: "Pathfinder 2nd Edition (Remaster)",
    description: "Real PF2e rules -- proficiency ranks, level-based math, class feats. Canonical content sourced from the ORC-licensed Remaster rules.",
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
      prompt: require("../../prompts/enemyContentPrompt")
    },
    classes: {
      template: require("../classTemplate"),
      prompt: require("../../prompts/classContentPrompt")
    },
    items: {
      formulas: require("../itemFormulas"),
      template: require("../itemTemplate"),
      prompt: require("../../prompts/itemContentPrompt")
    },
    logs: {
      template: require("../logTemplate"),
      prompt: require("../../prompts/logContentPrompt")
    },
    survivors: {
      template: require("../survivorTemplate"),
      prompt: require("../../prompts/survivorContentPrompt")
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
      template: require("./5e/enemyTemplate")
      // No single `prompt` slot here on purpose -- 5e enemies have THREE
      // prompt-shaped tiers (reflavor/homebrew; import needs no prompt
      // at all), which doesn't fit this registry's one-prompt-per-Echoes-
      // category shape. routes/generateEnemy.js requires
      // prompts/rulesets/5e/enemyContentPrompt.js directly for those.
    }
  },
  pf2e: {
    enemies: {
      formulas: require("./pf2e/statFormulas"),
      template: require("./pf2e/enemyTemplate")
      // Homebrew tier ONLY -- no prompt slot here for the same reason
      // 5e's doesn't use one; see prompts/rulesets/pf2e/enemyContentPrompt.js's
      // header for why Import/Reflavor aren't available for this ruleset.
    }
  },
  generic: {}
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
