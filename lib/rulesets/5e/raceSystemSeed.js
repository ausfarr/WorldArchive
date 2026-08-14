// lib/rulesets/5e/raceSystemSeed.js
//
// R6 Phase 2: the Race/Species reference pool a NEW world sees before
// its first save (GET /api/wizard/race-system, and the AI Homebrew PC
// generation fallback in routes/generateSurvivor.js's resolveRace())
// now sources from the real ingested SRD Species (R6 Phase 1's
// scripts/ingestSrdOrigins5e.js) instead of always reaching for
// lib/rulesets/5e/starterRaces.js's hand-authored list -- a pure
// data-source swap, not an architecture change (still the same "small,
// editable/addable/removable reference pool" from R4 Phase 3, still
// only ever seeded, never force-synced onto a world that already saved
// its own list).
//
// starterRaces.js is KEPT, not deleted -- same "don't assume infra is
// always reachable" caution already applied elsewhere in this codebase
// (e.g. this project's various admin-ingest routes existing specifically
// because a shell/local-dev environment isn't guaranteed). If
// srd_library has no species rows yet (ingestion never run) or the read
// fails for any reason (this session's own sandbox is a live example --
// see session_addendum_r6_*.md), this falls back to the hand-authored
// starter list rather than handing a new world an empty reference pool
// or surfacing a 500 on a wizard step.
//
// Existing worlds are unaffected either way -- getSeedRacePool() is only
// ever consulted when a world has NO saved race_system_json yet. A world
// that already saved one (whether starter-derived or real-SRD-derived)
// keeps exactly what it saved, untouched.

const { listSrdEntriesFull } = require("../../srdLibraryRepo");
const { mapSrdSpeciesRows } = require("./srdSpeciesMapper");
const { STARTER_5E_RACES } = require("./starterRaces");

async function getSeedRacePool() {
  try {
    const rows = await listSrdEntriesFull("5e", "species");
    if (rows && rows.length) return mapSrdSpeciesRows(rows);
  } catch (err) {
    console.error("getSeedRacePool: real SRD species read failed, falling back to the hand-authored starter list:", err.message);
  }
  return STARTER_5E_RACES;
}

module.exports = { getSeedRacePool };
