// lib/rulesets/5e/backgroundsAndFeatsSeed.js
//
// R6 Phase 3: the real 2024 SRD mechanic -- a Background grants ONE
// specific named Origin Feat immediately at character creation (e.g.
// Acolyte -> Magic Initiate, Criminal -> Alert, Soldier -> Savage
// Attacker) -- is a genuinely different, separate, ADDITIVE mechanic
// from the existing "optional Feat at a real ASI level" (R4 Phase 5,
// unchanged): a PC now ends up with one Origin Feat (from Background,
// always, level 1) PLUS an optional General Feat at each real ASI level
// (classFormulas.js's ABILITY_SCORE_IMPROVEMENT_LEVELS, unchanged).
//
// This module is the single place that resolves both real ingested
// lists (srd_library categories 'backgrounds' and 'feats') and joins
// them -- every consumer (AI Homebrew generation, procedural
// generation, the reference route the manual-entry frontend reads)
// calls getRealBackgroundsAndFeats() rather than reading srd_library or
// backgroundsAndFeats.js directly, so the join logic and the fallback
// behavior below live in exactly one place.
//
// Same "don't assume infra is always reachable" fallback shape as R6
// Phase 2's raceSystemSeed.js: on any read failure or an empty result,
// falls back to the hand-authored backgroundsAndFeats.js lists (kept,
// not deleted). IMPORTANT ASYMMETRY, documented rather than papered
// over: the old hand-authored lists PREDATE the Origin Feat mechanic
// entirely (R4 Phase 5 modeled Feat purely as an independent ASI-level
// choice) -- there is no real data to map a fallback background to a
// fallback origin feat, so every fallback background's originFeat is
// null. This is an honest degraded mode, not a bug: a world running on
// the fallback pool (real SRD data unreachable) gets pre-Phase-3
// behavior for the Origin Feat grant specifically, exactly like it
// always has, while everything else (background/feat picking) still
// works.

const { listSrdEntriesFull } = require("../../srdLibraryRepo");
const { mapSrdBackgroundRows } = require("./srdBackgroundMapper");
const { mapSrdFeatRows } = require("./srdFeatMapper");
const { CORE_BACKGROUNDS, CORE_FEATS } = require("./backgroundsAndFeats");

// Same CC-BY-4.0 attribution text scripts/ingestSrdOrigins5e.js stamps
// onto every real ingested row -- reused verbatim here so a PC sheet
// rendering real Background/Feat text (survivorTemplate.js's
// backgroundSection()) can show it, the same "attribution shown, not
// just stored" treatment itemTemplate.js/classTemplate.js already give
// imported entries. Only attached when a background actually resolved a
// real originFeat (i.e., real-SRD-sourced) -- the fallback path's
// backgrounds carry no license note, since they're this project's own
// original wording, not licensed SRD text.
const SRD_LICENSE_NOTE =
  "This work includes material taken from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC and is licensed under the Creative Commons Attribution 4.0 International License. To view a copy of this license, visit https://creativecommons.org/licenses/by/4.0/. The official SRD 5.2.1 can be found at https://www.dndbeyond.com/srd. Markdown conversion by the downfallx/dnd-5e-srd-markdown project (https://github.com/downfallx/dnd-5e-srd-markdown), used under the same license.";

function joinOriginFeats(backgrounds, feats) {
  const featByName = new Map(feats.map((f) => [f.name.toLowerCase(), f]));
  return backgrounds.map((bg) => {
    const matched = bg.originFeatName ? featByName.get(bg.originFeatName.toLowerCase()) : null;
    return {
      ...bg,
      originFeat: matched ? { key: matched.key, name: matched.name, description: matched.description, repeatable: matched.repeatable } : null,
      licenseNote: matched ? SRD_LICENSE_NOTE : null
    };
  });
}

function fallbackShape() {
  const backgrounds = CORE_BACKGROUNDS.map((b) => ({
    key: b.key,
    name: b.name,
    abilityScores: null,
    skillProficiencies: b.skillProficiencies,
    toolProficiency: b.toolProficiency,
    equipment: b.equipment,
    originFeatName: null,
    originFeatOption: null,
    originFeat: null
  }));
  const feats = CORE_FEATS.map((f) => ({ key: f.key, name: f.name, category: "General", prerequisite: null, description: f.description, repeatable: false }));
  return { backgrounds, feats };
}

async function getRealBackgroundsAndFeats() {
  try {
    const [bgRows, featRows] = await Promise.all([
      listSrdEntriesFull("5e", "backgrounds"),
      listSrdEntriesFull("5e", "feats")
    ]);
    if (bgRows && bgRows.length && featRows && featRows.length) {
      const feats = mapSrdFeatRows(featRows);
      const backgrounds = joinOriginFeats(mapSrdBackgroundRows(bgRows), feats);
      return { backgrounds, feats };
    }
  } catch (err) {
    console.error("getRealBackgroundsAndFeats: real SRD read failed, falling back to the hand-authored lists:", err.message);
  }
  return fallbackShape();
}

// The ASI-level General Feat slot's candidate pool -- filters the full
// feat list down to what's safe to offer WITHOUT a full prerequisite-
// checking system, same principle R4 Phase 5 originally established
// ("prerequisite-gated feats deliberately left out to keep this a safe
// default list any class/concept can pick from"). Concretely:
//
// - Epic Boon feats require character level 19+ (a prerequisite this
//   codebase already tracks reliably via totalLevel) -- filtered out
//   below that level, the one prerequisite type cheap enough to check
//   correctly rather than ignore.
// - Fighting Style feats (require a class's Fighting Style feature) and
//   General feats' own secondary prerequisites (e.g. Grappler's
//   Strength/Dexterity 13+) are NOT checked here -- same "no
//   prerequisite-checking system" scope line R4 Phase 5 already drew,
//   now just applied to real data instead of a hand-picked safe list.
// - excludeNonRepeatableKey: a PC's Background already grants one
//   specific Origin Feat (see joinOriginFeats above); offering that
//   SAME feat again in the ASI-level pool would double-grant it unless
//   the feat is explicitly Repeatable (Magic Initiate, Skilled both
//   are, per the real SRD text -- confirmed in srdFeatMapper.js's
//   repeatable detection). Non-repeatable duplicates are excluded here;
//   repeatable ones are correctly left available.
function eligibleAsiFeats(feats, { totalLevel = 0, excludeNonRepeatableKey = null } = {}) {
  return (feats || []).filter((f) => {
    if (f.category === "Epic Boon" && totalLevel < 19) return false;
    if (excludeNonRepeatableKey && f.key === excludeNonRepeatableKey && !f.repeatable) return false;
    return true;
  });
}

module.exports = { getRealBackgroundsAndFeats, eligibleAsiFeats, joinOriginFeats, SRD_LICENSE_NOTE };
