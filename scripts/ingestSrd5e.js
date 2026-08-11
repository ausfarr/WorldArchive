// scripts/ingestSrd5e.js
//
// One-time (re-run only when source data changes), idempotent ingestion
// of the free 5e SRD into srd_library (migrations/020_ruleset_foundation.sql).
// Upserts on (ruleset, category, srd_id) so re-running after a source
// update overwrites existing rows instead of duplicating them -- same
// idempotency contract as scripts/ingestWorldBible.js.
//
// SOURCE & LICENSE -- read before touching this file:
//
//   Monsters: Tabyltop/CC-SRD's Monsters-SRD5.1-CCBY4.0License-TT.json
//   (https://github.com/Tabyltop/CC-SRD), a direct conversion of Wizards
//   of the Coast's official System Reference Document 5.1, explicitly
//   released under CC-BY-4.0. Verified directly against that repo's own
//   LICENSE.md/README.md (quotes the exact WotC-mandated attribution
//   text, reproduced below in LICENSE_NOTE) AND the license block
//   embedded as the first object inside the JSON file itself. Spot-
//   checked the Goblin entry against the real 5e SRD stat block (AC 15
//   leather+shield, HP 7 (2d6), STR 8/DEX 14/CON 10/INT 10/WIS 8/CHA 8,
//   Nimble Escape, Scimitar +4 1d6+2, Shortbow +4 80/320 1d6+2, CR 1/4)
//   -- matches exactly. 201 monsters total. See SESSION_LOG.md's Phase 2
//   entry for the full verification trail.
//
//   This is deliberately NOT the commonly-recommended 5e-bits/5e-database
//   project (the one this project's own scope doc suggested as a
//   starting point) -- checked it first, and its LICENSE.md/README.md
//   license the DATA under OGL 1.0a, not CC-BY-4.0 ("The underlying
//   material is released using the Open Gaming License Version 1.0a").
//   OGL 1.0a is a materially different, more restrictive license, with
//   real ongoing legal ambiguity after Wizards' disputed 2023
//   "deauthorization" attempt -- out of scope here even though it's the
//   more popular/complete dataset. Same rejection applied to every other
//   community SRD-JSON project checked (BTMorton/dnd-5e-srd,
//   soryy708/dnd5-srd -> itself a 5e-bits fork, vorpalhex/srd_spells,
//   archived and OGL-licensed) -- all OGL 1.0a, none CC-BY-4.0.
//
//   Classes/Spells/Items are NOT ingested by this script yet. No
//   ready-made CC-BY-4.0 STRUCTURED (per-item JSON) dataset could be
//   found for them -- Tabyltop's repo ships the rest of the SRD as one
//   large text/HTML document dump, not per-spell/per-class/per-item
//   records. Turning that into structured rows needs a real parser
//   against SRD formatting conventions, which is real future work, not
//   a quick add -- see SESSION_LOG.md and the project's session
//   addendum for what's deferred here.
//
// Run with: node scripts/ingestSrd5e.js
// Requires SUPABASE_URL / SUPABASE_SECRET_KEY env vars (service-role
// client -- srd_library only accepts writes from the service-role
// client; see migrations/020_ruleset_foundation.sql's RLS policy).

const { supabase } = require("../lib/supabaseClient");

const MONSTERS_URL = "https://raw.githubusercontent.com/Tabyltop/CC-SRD/main/Monsters-SRD5.1-CCBY4.0License-TT.json";
const SOURCE_EDITION = "5e SRD 5.1";

// Exact attribution text Tabyltop's own LICENSE (which itself mirrors
// Wizards' mandated CC-BY-4.0 attribution wording) requires -- copied
// verbatim, not paraphrased, per that license's "please do not include
// any other attribution" instruction. Stored per-row (not just in this
// file) so archive/licenses.html and any future per-item detail view can
// display it without a second static copy drifting out of sync.
const LICENSE_NOTE =
  "This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode. Conversion of this document from the original PDF to other formats was performed by the team at Tabyltop (https://www.tabyltop.com).";

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// "1/4 (50 XP)" -> 0.25, "13 (10,000 XP)" -> 13, "1/8 (25 XP)" -> 0.125.
// Deliberately lenient -- an unparseable challenge string just stores
// cr: null (the filter column) rather than throwing, since data_json
// keeps the original text regardless and this column only exists for
// convenience querying.
function parseCr(challengeText) {
  if (!challengeText) return null;
  const m = String(challengeText).match(/^([\d/]+)/);
  if (!m) return null;
  const token = m[1];
  if (token.includes("/")) {
    const [num, den] = token.split("/").map(Number);
    if (!den) return null;
    return num / den;
  }
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

async function fetchMonsters() {
  const res = await fetch(MONSTERS_URL);
  if (!res.ok) throw new Error(`Fetching SRD monsters failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (!Array.isArray(data.monsters)) {
    throw new Error("Unexpected SRD monsters JSON shape -- expected a top-level `monsters` array.");
  }
  return data.monsters;
}

async function ingestMonsters() {
  const monsters = await fetchMonsters();
  const rows = monsters.map((m) => ({
    ruleset: "5e",
    category: "monsters",
    srd_id: slugify(m.name),
    name: m.name,
    data_json: m,
    source_edition: SOURCE_EDITION,
    license_note: LICENSE_NOTE,
    cr: parseCr(m.challenge)
  }));

  const { data, error } = await supabase
    .from("srd_library")
    .upsert(rows, { onConflict: "ruleset,category,srd_id" })
    .select("id");
  if (error) throw new Error(`Upserting SRD monsters failed: ${error.message}`);
  return data.length;
}

async function main() {
  console.log("Fetching 5e SRD monster data (Tabyltop/CC-SRD, CC-BY-4.0)...");
  const count = await ingestMonsters();
  console.log(`Upserted ${count} monsters into srd_library.`);
  console.log("Classes/Spells/Items not yet ingested -- see this file's header comment and SESSION_LOG.md.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("SRD 5e ingestion failed:", err);
    process.exit(1);
  });
}

module.exports = { fetchMonsters, ingestMonsters, parseCr, slugify, LICENSE_NOTE, SOURCE_EDITION };
