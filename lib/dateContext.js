// lib/dateContext.js
//
// Session Prep Companion, Phase 3, Section 6a -- "cross-entry date
// consistency" grounding. Scans every category that got a canonical date
// field this phase (Factions/NPCs/PCs/Items -- see lib/calendar.js's
// DATE_FIELDS_BY_CATEGORY) for entries that already HAVE one set, and
// formats them as a plain-text context block for the Log prompt --
// injected the same way roster/world-bible context already is (per the
// scope doc's explicit instruction), so the model writes text consistent
// with an already-established date rather than inventing a conflicting
// one for something a reader could click through to and see contradicted.
//
// Deliberately excludes Logs' own resolvedDate from this scan -- a Log's
// resolved date isn't "canonical" the way an entry's own dated field is
// (see Section 6a: entry-level fields are the source of truth, a Log
// only ever proposes).

const { readFactionManifest, readNpcManifest, readSurvivorManifest, readItemManifest } = require("./roster");
const { formatWorldDate, DATE_FIELDS_BY_CATEGORY } = require("./calendar");

const FIELD_LABELS = {
  foundingDate: "founded",
  birthDate: "born",
  appointedDate: "appointed",
  deathDate: "died",
  createdDate: "created",
  discoveredDate: "discovered"
};

// Capped the same way lib/roster.js's context builders cap roster size --
// a world with many dated entries shouldn't blow up prompt cost for a
// context block that's inherently a rare-field scan, not core content.
const MAX_DATED_ENTRIES = 80;

async function buildKnownDatesContext(worldId, calendarConfig) {
  const scans = [
    { category: "factions", manifest: await readFactionManifest(worldId) },
    { category: "npcs", manifest: await readNpcManifest(worldId, { locked: false }) },
    { category: "survivors", manifest: await readSurvivorManifest(worldId, { locked: false }) },
    { category: "items", manifest: await readItemManifest(worldId, { locked: false }) }
  ];

  const lines = [];
  for (const { category, manifest } of scans) {
    const fields = DATE_FIELDS_BY_CATEGORY[category] || [];
    for (const m of manifest) {
      const raw = m.raw || {};
      for (const field of fields) {
        if (!raw[field]) continue;
        lines.push(`- ${m.name} (${category}, id: ${m.id}) — ${FIELD_LABELS[field] || field}: ${formatWorldDate(raw[field], calendarConfig)}`);
        if (lines.length >= MAX_DATED_ENTRIES) break;
      }
      if (lines.length >= MAX_DATED_ENTRIES) break;
    }
    if (lines.length >= MAX_DATED_ENTRIES) break;
  }

  if (!lines.length) return "(nothing in this world has a canonical date set yet)";
  return lines.join("\n");
}

module.exports = { buildKnownDatesContext };
