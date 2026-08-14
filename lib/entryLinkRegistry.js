// lib/entryLinkRegistry.js
//
// Field registry for entry cross-linking (see phase0_entry_linking_audit.md
// for the full audit this was built from — real production data + real
// template/prompt code, not assumptions). Declares, per ruleset+category,
// which fields in an entry's raw_json.raw point at another category, and
// how to resolve/match them. lib/entryLinker.js is the only consumer.
//
// TWO REFERENCE TYPES (see the session brief for the full rationale):
//   - Category A ("rules/category facts"): a field naming something by
//     category that's true independent of what's archived (e.g. a spell's
//     class list). The model keeps generating these freely; unresolved
//     names get a "not yet archived" inline span + a ghost placeholder.
//   - Category B ("narrative world-facts"): fields like relationships,
//     notableNpcs, locationId — ALREADY grounded-only by deliberate
//     existing design (the model never invents a link, leaves null if
//     nothing real fits). This registry only fixes the backfill gap for
//     these; generation-time behavior is untouched.
//
// IMPORTANT — every path below is relative to `entry.raw`, NOT
// `entry`/`raw_json` directly. Every saveXEntry() function (lib/fileWriter.js,
// lib/rulesets/<id>/<x>Repo.js) wraps the actual generated content under a
// `raw` key inside the manifest-shaped entryMeta it writes to raw_json —
// confirmed against a real saved 5e spell in Phase 0. entriesRepo.js's
// rowToFullEntry()/rowToManifestEntry() both spread raw_json onto the
// object they return, so `entry.raw` is always reachable on anything
// getEntry()/listEntries() returns.
//
// SCOPE: covers the 4 categories with exactly one implementation shared
// by every ruleset (npcs, factions, logs, locations — no lib/rulesets/<id>/
// variant exists for these), plus enemies/classes/items/spells/survivors
// across echoes, 5e, and generic. Every category/ruleset combo was audited
// in Phase 0; a combo with nothing listed here was checked and genuinely
// has no cross-category reference field (5e/generic enemies, items,
// classes — confirmed against real production data where any exists).

const FIELD_TYPES = {
  // A single nullable id field on the entry, with a sibling free-text
  // field used to MATCH it during backward-resolution (labelPath is
  // often descriptive prose, not a clean name — see logs.locationId's
  // comment below — matching is still safe because it's exact-normalized-
  // match only, just lower hit-rate for those fields).
  ID_POINTER: "idPointer",
  // An array field where each item carries its own id + label (+
  // optionally a dynamic target-category field, e.g. npc relationships
  // that can point at factions, other npcs, enemies, classes, or
  // survivors).
  ID_POINTER_ARRAY: "idPointerArray",
  // Category A: an array of bare name strings today (e.g. spell.classes),
  // upgraded in place to an array of {name, id} objects.
  NAME_ONLY_ARRAY: "nameOnlyArray"
};

// The categories with exactly one shared implementation across every
// ruleset — see world_forge_scope.md's registry section ("Locations and
// Factions have no ruleset-specific mechanics... expected to stay absent
// [from the ruleset registry] and fall through to a shared/neutral
// template"). Same is true of npcs/logs, confirmed in Phase 0 — none of
// the four have a lib/rulesets/<id>/ variant at all.
const SHARED_CATEGORIES = ["npcs", "factions", "logs", "locations"];

// Dynamic-target relationship arrays (npcs, survivors-echoes, and now
// factions) are allowed to point at any of these categories.
const RELATIONSHIP_TARGETS = ["factions", "npcs", "enemies", "classes", "survivors"];

// ---------- Shared (every ruleset, including Echoes) ----------
const SHARED_FIELDS = {
  npcs: [
    {
      type: FIELD_TYPES.ID_POINTER_ARRAY,
      arrayPath: "relationships",
      idField: "toId",
      labelField: "toLabel",
      targetField: "toCategory",
      allowedTargets: RELATIONSHIP_TARGETS
    }
  ],
  locations: [
    {
      type: FIELD_TYPES.ID_POINTER_ARRAY,
      arrayPath: "notableNpcs",
      idField: "toId",
      labelField: "toLabel",
      target: "npcs"
    }
  ],
  logs: [
    {
      type: FIELD_TYPES.ID_POINTER,
      // No dedicated "location name" field exists on a log — only
      // locationContext, free descriptive prose ("East Platform, Subway
      // Substructure"), confirmed against prompts/logContentPrompt.js.
      // Matching against it is still safe (exact-normalized-match can't
      // false-positive), just a lower hit rate than a real name field —
      // this is the schema's existing shape, not a gap this feature
      // introduces.
      idPath: "locationId",
      labelPath: "locationContext",
      target: "locations"
    }
  ],
  factions: [
    {
      type: FIELD_TYPES.ID_POINTER_ARRAY,
      arrayPath: "relationships",
      // NEW fields (Phase 1) — factions.relationships[] previously had no
      // id-linking at all, just a bare `faction` name string, despite
      // being grounded-only by prompt design already (see the Phase 0
      // audit's "On factions.relationships[].faction" note). `faction`
      // itself is the existing display-name field and doubles as the
      // match label; toId/toLabel are additive, non-breaking.
      idField: "toId",
      labelField: "faction",
      target: "factions" // self-referential — a faction's relationships name other factions
    }
  ]
};

// ---------- Ruleset-specific ----------
const RULESET_FIELDS = {
  echoes: {
    classes: [
      {
        type: FIELD_TYPES.ID_POINTER,
        idPath: "evolutionEvent.locationId",
        labelPath: "evolutionEvent.location",
        target: "locations"
      }
    ],
    items: [
      {
        type: FIELD_TYPES.ID_POINTER,
        idPath: "foundAtLocationId",
        labelPath: "whereFoundWhyMatters",
        target: "locations",
        // QuestItem-category-only per prompts/itemContentPrompt.js's
        // schema ("QuestItem category only, else null") — skip the field
        // entirely for every other item category rather than attempting
        // a match that could never have been intended.
        condition: (raw) => raw && raw.category === "QuestItem"
      }
    ],
    survivors: [
      {
        type: FIELD_TYPES.ID_POINTER_ARRAY,
        arrayPath: "relationships",
        idField: "toId",
        labelField: "toLabel",
        targetField: "toCategory",
        allowedTargets: RELATIONSHIP_TARGETS
      }
    ]
  },
  "5e": {
    spells: [
      {
        // Category A flagship example from the brief: spell.classes is
        // ["Wizard","Sorcerer"] today (bare strings) — upgraded in place
        // to [{name,id}]. Confirmed against a real saved 5e spell in
        // Phase 0 (raw.classes was a plain string array).
        type: FIELD_TYPES.NAME_ONLY_ARRAY,
        arrayPath: "classes",
        target: "classes",
        ghostOnUnresolved: true
      }
    ],
    survivors: [
      {
        type: FIELD_TYPES.ID_POINTER_ARRAY,
        arrayPath: "classes",
        idField: "classId",
        labelField: "className",
        target: "classes",
        // Always resolved at generation time (model is constrained to a
        // real class roster, code validates it — routes/generateSurvivor.js).
        // No null-gap exists in practice; kept registered so a manually-
        // edited PC still gets a defensive forward-resolve pass, but
        // backward-resolution can never fire (a Class must already exist
        // to create a PC against it).
        noBackfill: true
      }
    ]
  },
  generic: {
    survivors: [
      {
        type: FIELD_TYPES.ID_POINTER,
        idPath: "classId",
        labelPath: "className",
        target: "classes",
        noBackfill: true // same reasoning as 5e survivors above
      }
    ]
  }
  // enemies/items/classes (5e, generic): audited every field in both
  // templates/prompts in Phase 0 — no cross-category reference of any
  // kind (5e's item.baseItem points at a static lookup table in
  // itemFormulas.js, not an archive entry). Deliberately absent here.
};

// Returns the field descriptor list for (ruleset, category), or [] if
// nothing is registered. Shared categories ignore the ruleset argument
// entirely — there's only one implementation regardless of what ruleset
// the world is on.
function getLinkFields(ruleset, category) {
  if (SHARED_CATEGORIES.includes(category)) {
    return SHARED_FIELDS[category] || [];
  }
  const rs = RULESET_FIELDS[ruleset];
  if (!rs) return [];
  return rs[category] || [];
}

module.exports = {
  FIELD_TYPES,
  SHARED_CATEGORIES,
  RELATIONSHIP_TARGETS,
  SHARED_FIELDS,
  RULESET_FIELDS,
  getLinkFields
};
