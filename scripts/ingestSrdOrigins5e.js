// scripts/ingestSrdOrigins5e.js
//
// R6 Phase 1 -- ingests real SRD Backgrounds and Species into
// srd_library from character-origins.md, the one file in
// downfallx/dnd-5e-srd-markdown that scripts/ingestSrd5eFull.js's R5
// pass never touched (that script covers spells.md/equipment.md/
// feats.md/magic-items.md/classes.md only -- see its own header). Same
// source, same license, separate file per this project's established
// "one parser file per source shape" convention -- does NOT modify
// ingestSrd5e.js or ingestSrd5eFull.js.
//
// SOURCE & LICENSE -- already verified for this exact repo by R5 Phase 4
// (see ingestSrd5eFull.js's header for the full verification: genuine,
// unambiguous CC-BY-4.0 attributed to this specific content, distinct
// from 5e-bits/5e-database's rejected blanket MIT+OGL statement). This
// script re-confirms character-origins.md carries the same repo-wide
// license (checked README.md's Contents table and License section --
// both apply uniformly across every file in the repo, no per-file
// carve-out), so no new license check was needed, just this one-line
// confirmation.
//
// New srd_library categories, no migration needed: 'backgrounds' and
// 'species'. srd_library.category has no CHECK constraint (only a doc
// comment on the column in migrations/020_ruleset_foundation.sql, which
// R5 Phase 4 already left stale when it added 'feats'/'magic-items'
// without touching that shipped migration -- same precedent followed
// here, not a new decision). The doc trail for what categories exist now
// lives in this file plus ingestSrd5eFull.js's ingestAll(), not in the
// migration comment.
//
// PARSING NOTES (read before extending):
//
//   character-origins.md has two sections this script cares about:
//   "### Background Descriptions" (inside "## Character Backgrounds")
//   and "### Species Descriptions" (inside "## Character Species"),
//   each a flat list of "#### Name" entries -- same block-splitting
//   approach as ingestSrd5eFull.js's parseFeats/parseMagicItems.
//
//   IMPORTANT REAL-COUNT FINDING, confirmed by direct fetch+read of the
//   live file (17,267 bytes, matching the repo README's own stated
//   17KB size for this file -- not a truncated fetch): this free SRD
//   file contains only 4 backgrounds (Acolyte, Criminal, Sage, Soldier),
//   not the 16 a full Player's Handbook has. The scoping prompt for this
//   session assumed 16 based on the full published game, not the
//   CC-BY-4.0 SRD subset actually available to license -- confirmed via
//   character-creation.md's own "Ability Scores and Backgrounds" table,
//   which only cross-references Soldier/Acolyte as examples, and its own
//   prose ("You can choose any of the backgrounds detailed in 'Character
//   Origins,' and your GM might offer additional backgrounds as
//   options") acknowledging the SRD is a subset. Species count (9) DOES
//   match the scoping prompt exactly: Dragonborn, Dwarf, Elf, Gnome,
//   Goliath, Halfling, Human, Orc, Tiefling.
//
//   Backgrounds -- each entry has **Ability Scores:**/**Feat:**/
//   **Skill Proficiencies:**/**Tool Proficiency:**/**Equipment:** lines.
//   The Feat line cross-references feats.md's own Origin Feat category
//   (already ingested by ingestSrd5eFull.js) by name, sometimes with a
//   parenthetical option, e.g. "Magic Initiate (Cleric) (see \"Feats\")"
//   vs. plain "Alert (see \"Feats\")" -- parsed into featName ("Magic
//   Initiate") + featOption ("Cleric" or null) so Phase 3 can join
//   against the real ingested Feats by name without guessing. All 4
//   backgrounds' featName values (Magic Initiate, Alert, Savage
//   Attacker) match real Origin Feats in the already-ingested 17 feats
//   exactly -- cross-referenced from the source data, not assumed.
//
//   Species -- each entry has **Creature Type:**/**Size:**/**Speed:**
//   lines, then a variable-length "Special Traits" prose section (3 to
//   6+ per species, confirmed: Human/Orc/Goliath have 3, Dragonborn/Elf
//   have 5). Traits are split on the top-level "_Name._ description"
//   italic-lead-in pattern (splitTraits()) -- deliberately only at
//   paragraph boundaries starting with "_", so embedded HTML <table>s
//   (e.g. Dragonborn's Draconic Ancestors table) and bolded named
//   sub-options that are NOT full traits of their own (e.g. Gnome's
//   "**Forest Gnome.**"/"**Rock Gnome.**" lineage choices, nested inside
//   the single "_Gnomish Lineage._" trait) stay attached to their parent
//   trait's description rather than being split out as separate traits.
//   Confirmed against all 9 species: no trait boundary is ever missed
//   or split incorrectly by this rule.
//
//   REAL 2024-RULES FACT, relevant to Phase 2: Species in the real SRD
//   carry NO ability score increase at all -- that mechanic moved to
//   Background in the 2024 rules (see character-origins.md's own
//   "#### Ability Scores" subsection under "Parts of a Background": "A
//   background lists three of your character's ability scores...").
//   Confirmed no species entry has any ability-score field. This
//   script's species data_json intentionally has no abilityScoreIncrease
//   key -- faithfully reflects the source, not an omission.
//
// Run with: node scripts/ingestSrdOrigins5e.js
// (Or, in production with no shell access: trigger via
// GET /api/admin/ingest-srd-origins-5e while signed in as the admin
// account -- see routes/adminIngestSrdOrigins.js. This session's own
// sandbox has SUPABASE_URL/SUPABASE_SECRET_KEY present but the egress
// proxy returns a policy-denial 403 on every CONNECT to the Supabase
// project host -- confirmed via the proxy's own status endpoint, not a
// credentials problem -- so this script could be written and unit-tested
// against the real parsers this session, but NOT actually run against
// production. The admin route exists so Austin -- who per
// adminIngestSrdFull.js's own header has no local dev environment either
// -- can trigger it from the deployed app, which has real network
// access to both GitHub and Supabase.
// Requires SUPABASE_URL / SUPABASE_SECRET_KEY env vars.

const { supabase } = require("../lib/supabaseClient");

const BASE_URL = "https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/";
const SOURCE_EDITION = "5e SRD 5.2.1";

const LICENSE_NOTE =
  "This work includes material taken from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC and is licensed under the Creative Commons Attribution 4.0 International License. To view a copy of this license, visit https://creativecommons.org/licenses/by/4.0/. The official SRD 5.2.1 can be found at https://www.dndbeyond.com/srd. Markdown conversion by the downfallx/dnd-5e-srd-markdown project (https://github.com/downfallx/dnd-5e-srd-markdown), used under the same license.";

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

async function fetchText(filename) {
  const res = await fetch(BASE_URL + filename);
  if (!res.ok) throw new Error(`Failed to fetch ${filename}: ${res.status}`);
  return res.text();
}

// ============================================================
// Backgrounds ("### Background Descriptions" inside
// "## Character Backgrounds") -- see header comment for field shape and
// the real 4-background count.
// ============================================================
function parseBackgrounds(text) {
  const startIdx = text.indexOf("### Background Descriptions");
  const endIdx = text.indexOf("## Character Species");
  if (startIdx === -1 || endIdx === -1) {
    throw new Error("Could not find '### Background Descriptions' / '## Character Species' boundaries in character-origins.md");
  }
  const body = text.slice(startIdx, endIdx);
  const blocks = body.split(/\n(?=#### )/).slice(1);
  const backgrounds = [];

  for (const block of blocks) {
    const nameMatch = block.match(/^#### (.+)$/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const rest = block.slice(nameMatch.index + nameMatch[0].length).trim();

    const abilityScores = (rest.match(/\*\*Ability Scores:\*\*\s*(.+)/) || [])[1] || null;
    const featLine = (rest.match(/\*\*Feat:\*\*\s*(.+)/) || [])[1] || null;
    const skillProficiencies = (rest.match(/\*\*Skill Proficiencies:\*\*\s*(.+)/) || [])[1] || null;
    const toolProficiency = (rest.match(/\*\*Tool Proficiency:\*\*\s*(.+)/) || [])[1] || null;
    const equipment = (rest.match(/\*\*Equipment:\*\*\s*(.+)/) || [])[1] || null;
    if (!abilityScores || !featLine) continue; // not a real background entry

    // featLine e.g. 'Magic Initiate (Cleric) (see "Feats")' or plain
    // 'Alert (see "Feats")' -- split into the base Origin Feat name
    // (for joining against the real ingested Feats by name) plus an
    // optional chosen-option parenthetical.
    const featNameMatch = featLine.match(/^(.+?)\s*(?:\(([^()]*)\)\s*)?\(see "Feats"\)\s*$/);
    let featName = featLine;
    let featOption = null;
    if (featNameMatch) {
      featName = featNameMatch[1].trim();
      featOption = featNameMatch[2] ? featNameMatch[2].trim() : null;
    }

    backgrounds.push({
      srd_id: slugify(name),
      name,
      data_json: { name, abilityScores, featLine, featName, featOption, skillProficiencies, toolProficiency, equipment }
    });
  }
  return backgrounds;
}

// Splits a species' Special Traits prose into { name, description }
// entries at top-level "_Name._ description" paragraph boundaries only
// -- see header comment for why embedded tables and bolded sub-options
// stay nested inside their parent trait rather than splitting out.
function splitTraits(traitsText) {
  const blocks = traitsText.split(/\n\n(?=_)/);
  const traits = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    const nameMatch = trimmed.match(/^_(.+?)\._\s*/);
    if (!nameMatch) continue; // stray text that isn't a real trait paragraph
    const name = nameMatch[1].trim();
    const description = trimmed.slice(nameMatch[0].length).trim();
    traits.push({ name, description });
  }
  return traits;
}

// ============================================================
// Species ("### Species Descriptions" inside "## Character Species",
// runs to end of file) -- see header comment for field shape, the
// variable-length Special Traits list, and the real "no ability score
// increase on Species" 2024-rules fact.
// ============================================================
function parseSpecies(text) {
  const startIdx = text.indexOf("### Species Descriptions");
  if (startIdx === -1) throw new Error("Could not find '### Species Descriptions' section in character-origins.md");
  const body = text.slice(startIdx);
  const blocks = body.split(/\n(?=#### )/).slice(1);
  const species = [];

  for (const block of blocks) {
    const nameMatch = block.match(/^#### (.+)$/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const rest = block.slice(nameMatch.index + nameMatch[0].length).trim();

    const creatureType = (rest.match(/\*\*Creature Type:\*\*\s*(.+)/) || [])[1] || null;
    const size = (rest.match(/\*\*Size:\*\*\s*(.+)/) || [])[1] || null;
    const speed = (rest.match(/\*\*Speed:\*\*\s*(.+)/) || [])[1] || null;
    if (!creatureType || !size || !speed) continue; // not a real species entry

    const traitsStartIdx = rest.search(/\n_/);
    const traitsText = traitsStartIdx === -1 ? "" : rest.slice(traitsStartIdx + 1);
    const traits = splitTraits(traitsText);

    species.push({
      srd_id: slugify(name),
      name,
      data_json: { name, creatureType, size, speed, traits }
    });
  }
  return species;
}

// ============================================================
// Upsert helper -- same idempotency contract as ingestSrd5eFull.js
// (upsert on ruleset+category+srd_id, so re-running after a source
// update overwrites rather than duplicates).
// ============================================================
async function upsertRows(category, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    ruleset: "5e",
    category,
    srd_id: r.srd_id,
    name: r.name,
    data_json: r.data_json,
    source_edition: SOURCE_EDITION,
    license_note: LICENSE_NOTE
  }));
  const { error } = await supabase.from("srd_library").upsert(payload, { onConflict: "ruleset,category,srd_id" });
  if (error) throw new Error(`Upsert failed for category '${category}': ${error.message}`);
  return payload.length;
}

async function ingestAll() {
  const results = {};

  const originsText = await fetchText("character-origins.md");
  results.backgrounds = await upsertRows("backgrounds", parseBackgrounds(originsText));
  results.species = await upsertRows("species", parseSpecies(originsText));

  return results;
}

module.exports = { ingestAll, parseBackgrounds, parseSpecies, splitTraits, slugify, LICENSE_NOTE, SOURCE_EDITION };

if (require.main === module) {
  ingestAll()
    .then((results) => {
      console.log("SRD Origins ingestion complete:");
      Object.entries(results).forEach(([cat, count]) => console.log(`  ${cat}: ${count} rows upserted`));
      process.exit(0);
    })
    .catch((err) => {
      console.error("SRD Origins ingestion failed:", err);
      process.exit(1);
    });
}
