// scripts/ingestSrd5eFull.js
//
// Ingests Spells, Items (Weapons/Armor/Adventuring Gear), Feats, and
// Magic Items into srd_library from a SECOND, separately-verified
// CC-BY-4.0 source -- does NOT touch scripts/ingestSrd5e.js (monsters,
// different source, left untouched).
//
// SOURCE & LICENSE -- read before touching this file:
//
//   downfallx/dnd-5e-srd-markdown
//   (https://github.com/downfallx/dnd-5e-srd-markdown), a clean
//   markdown conversion of Wizards of the Coast's official System
//   Reference Document 5.2.1. Verified directly against that repo's own
//   README.md: "This work includes material taken from the System
//   Reference Document 5.2.1 ('SRD 5.2.1') by Wizards of the Coast LLC
//   and is licensed under the Creative Commons Attribution 4.0
//   International License" -- genuine, unambiguous CC-BY-4.0 attributed
//   to this specific content, not a blanket-repo license statement.
//
//   This is a DIFFERENT repo from `5e-bits/5e-database`, which this
//   project already checked and rejected (see ingestSrd5e.js's own
//   header comment) -- that repo licenses its data under OGL 1.0a, not
//   CC-BY-4.0, and has no Spells file at all in its CC-BY-labeled
//   directory. downfallx/dnd-5e-srd-markdown is also distinct from
//   `your5e/5e-srd-markdown` (a prior lead, also genuinely CC-BY-4.0 but
//   split across PDF/Obsidian-vault formats) -- this source ships plain
//   single-file-per-category markdown, which is what this script parses.
//
// PARSING NOTES (read before extending):
//
//   This is real markdown/HTML-table parsing against prose files, not a
//   structured JSON feed -- unlike ingestSrd5e.js's monster source.
//   Each source file mixes rules prose with the actual per-entry data;
//   the parsers below key off the exact structural patterns confirmed
//   by direct inspection of the real files (see comments per parser).
//   If the source repo's formatting ever changes, these parsers will
//   likely need adjustting -- they are NOT a generic markdown-to-JSON
//   converter, they're written against this specific source's exact
//   conventions.
//
//   Classes (classes.md) -- the Core Traits block for all 12 core
//   classes (Primary Ability, Hit Die, Saving Throws, Skill/Weapon
//   Proficiencies, Armor Training, Starting Equipment) plus the name +
//   tagline of the SRD's one example subclass per class. Hit dice and
//   saving throws cross-checked against this codebase's own
//   `lib/rulesets/5e/classFormulas.js` table -- exact match on all 12.
//   Full level-by-level class/subclass feature progressions are NOT
//   ingested -- same "flag rather than guess" call as everything else
//   this script deferred, see parseClasses()'s own comment for why.
//
// Run with: node scripts/ingestSrd5eFull.js
// (Or, in production with no shell access: trigger via
// GET /api/admin/ingest-srd-5e-full while signed in as the admin
// account -- see routes/adminIngestSrdFull.js.)
// Requires SUPABASE_URL / SUPABASE_SECRET_KEY env vars.

const { supabase } = require("../lib/supabaseClient");

const BASE_URL = "https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/";
const SOURCE_EDITION = "5e SRD 5.2.1";

const LICENSE_NOTE =
  "This work includes material taken from the System Reference Document 5.2.1 (\u201cSRD 5.2.1\u201d) by Wizards of the Coast LLC and is licensed under the Creative Commons Attribution 4.0 International License. To view a copy of this license, visit https://creativecommons.org/licenses/by/4.0/. The official SRD 5.2.1 can be found at https://www.dndbeyond.com/srd. Markdown conversion by the downfallx/dnd-5e-srd-markdown project (https://github.com/downfallx/dnd-5e-srd-markdown), used under the same license.";

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
// Spells (spells.md) -- entries live under "## Spell Descriptions",
// one per "#### Name" header, immediately followed by an italic line
// "_Level N School (Class, Class)_" or "_School Cantrip (Class, Class)_",
// then **Casting Time:**/**Range:**/**Components:**/**Duration:** lines,
// then description prose, optionally ending in an italic
// "_Using a Higher-Level Spell Slot._" or "_Cantrip Upgrade._" paragraph.
// Confirmed via direct sampling of Acid Arrow, Acid Splash, Aid, Alarm,
// Alter Self, Animal Friendship -- format is consistent throughout all
// 352 "#### " headers in the Spell Descriptions section.
// ============================================================
function parseSpells(text) {
  const startIdx = text.indexOf("## Spell Descriptions");
  if (startIdx === -1) throw new Error("Could not find '## Spell Descriptions' section in spells.md");
  const body = text.slice(startIdx);

  const blocks = body.split(/\n(?=#### )/).slice(1); // first split chunk is the section intro, skip it
  const spells = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const nameLine = lines[0];
    const nameMatch = nameLine.match(/^#### (.+)$/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    const rest = block.slice(nameLine.length).trim();
    const typeMatch = rest.match(/^_(.+?)_/);
    if (!typeMatch) continue; // not a real spell entry
    const typeLine = typeMatch[1].trim();

    // Confirmed real bug (caught in production, not just testing): a
    // handful of summon-type spells (Conjure Woodland Beings and
    // similar) embed a full creature stat block in their description,
    // with its own "#### Actions" / "#### Traits" / "#### Bonus
    // Actions" subsections. Those subsections' bodies often open with
    // SOME italic text too (e.g. an attack's "_Melee Attack Roll:_"
    // line), which satisfied the old "any italic text" check and let
    // "Actions"/"Traits" through as fake spell entries with garbage
    // level/school -- and since several spells each embed their own
    // "Actions"/"Traits" subsection, they collided on the same slugified
    // srd_id within one upsert batch, which Postgres rejects outright
    // ("ON CONFLICT DO UPDATE command cannot affect row a second time").
    // Fix: only accept the italic line if it ACTUALLY matches the real
    // spell level/school pattern -- skip (not default-and-keep) anything
    // that doesn't.
    let level = 0;
    let school = null;
    let classes = [];
    const cantripMatch = typeLine.match(/^(\w+) Cantrip(?:\s*\(([^)]*)\))?$/i);
    const leveledMatch = typeLine.match(/^Level (\d+) (\w+)(?:\s*\(([^)]*)\))?$/i);
    if (!cantripMatch && !leveledMatch) continue; // not a real spell entry
    if (cantripMatch) {
      level = 0;
      school = cantripMatch[1];
      classes = cantripMatch[2] ? cantripMatch[2].split(",").map((c) => c.trim()) : [];
    } else if (leveledMatch) {
      level = Number(leveledMatch[1]);
      school = leveledMatch[2];
      classes = leveledMatch[3] ? leveledMatch[3].split(",").map((c) => c.trim()) : [];
    }

    const castingTime = (rest.match(/\*\*Casting Time:\*\*\s*(.+)/) || [])[1] || null;
    const range = (rest.match(/\*\*Range:\*\*\s*(.+)/) || [])[1] || null;
    const components = (rest.match(/\*\*Components:\*\*\s*(.+)/) || [])[1] || null;
    const duration = (rest.match(/\*\*Duration:\*\*\s*(.+)/) || [])[1] || null;

    // Description: everything after the Duration line up to (but not
    // including) a trailing "_Using a Higher-Level Spell Slot._" /
    // "_Cantrip Upgrade._" paragraph, which is stored separately.
    const afterDuration = rest.split(/\*\*Duration:\*\*\s*.+\n\n/)[1] || "";
    const higherLevelMatch = afterDuration.match(/\n\n_(Using a Higher-Level Spell Slot|Cantrip Upgrade)\._\s*(.+)$/s);
    const description = (higherLevelMatch ? afterDuration.slice(0, higherLevelMatch.index) : afterDuration).trim();
    const atHigherLevels = higherLevelMatch ? higherLevelMatch[2].trim() : null;

    spells.push({
      srd_id: slugify(name),
      name,
      data_json: { name, level, school, classes, castingTime, range, components, duration, description, atHigherLevels },
      level,
      class_name: classes.length ? classes.join(", ") : null
    });
  }
  return spells;
}

// ============================================================
// Feats (feats.md) -- every "#### Name" header in the file is a real
// feat (confirmed: the only non-entry headers, "## Feat Descriptions"
// and "### Parts of a Feat" / "### Origin Feats" etc., are "##"/"###",
// not "####"). Each is immediately followed by an italic category/
// prerequisite line, e.g. "_Origin Feat_" or
// "_Epic Boon Feat (Prerequisite: Level 19+)_".
// ============================================================
function parseFeats(text) {
  const blocks = text.split(/\n(?=#### )/).slice(1);
  const feats = [];
  for (const block of blocks) {
    const nameMatch = block.match(/^#### (.+)$/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    // Trim a trailing "### Section Name" divider (e.g. "### General
    // Feats") that belongs to the NEXT section, not this feat -- the
    // block split only breaks on "#### " boundaries, so a "###" divider
    // sitting between two feats otherwise bleeds into the first one's
    // description. Confirmed this happens at every category boundary
    // (Origin -> General -> Fighting Style -> Epic Boon).
    const rest = block.slice(nameMatch[0].length).replace(/\n### .+$/s, "").trim();
    const categoryMatch = rest.match(/^_(.+?)_/);
    const category = categoryMatch ? categoryMatch[1].trim() : null;
    const description = categoryMatch ? rest.slice(categoryMatch[0].length).trim() : rest;
    feats.push({
      srd_id: slugify(name),
      name,
      data_json: { name, category, description }
    });
  }
  return feats;
}

// ============================================================
// Magic Items (magic-items.md) -- "#### Name" headers, but the file
// opens with several non-item "####" subsection headers ("Spells Cast
// from Items", "Charges", "Spells", "Conflict") before the real,
// alphabetized item list begins at "Adamantine Armor". Real items are
// distinguished by their very next line being an italic
// "_Type (details), Rarity_" line -- confirmed against Adamantine
// Armor, Ammunition +1/+2/+3, Ammunition of Slaying. The meta headers
// above don't have this immediate italic type/rarity line, so this
// heuristic filters them out without needing a hardcoded line number.
// ============================================================
function parseMagicItems(text) {
  const blocks = text.split(/\n(?=#### )/).slice(1);
  const items = [];
  const RARITY_RE = /(Common|Uncommon|Rare|Very Rare|Legendary|Artifact|Varies)/i;
  for (const block of blocks) {
    const nameMatch = block.match(/^#### (.+)$/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const rest = block.slice(nameMatch.index + nameMatch[0].length).trim();
    const typeMatch = rest.match(/^_(.+?)_/);
    if (!typeMatch || !RARITY_RE.test(typeMatch[1])) continue; // not a real item entry
    const typeLine = typeMatch[1].trim();
    const rarityMatch = typeLine.match(RARITY_RE);
    const rarity = rarityMatch ? rarityMatch[1] : null;
    const itemType = typeLine.split(",")[0].trim();
    const description = rest.slice(typeMatch[0].length).trim();
    items.push({
      srd_id: slugify(name),
      name,
      data_json: { name, itemType, rarity, typeLine, description },
      rarity
    });
  }
  return items;
}

// ============================================================
// Equipment: Weapons + Armor (HTML <table> in equipment.md) and
// Adventuring Gear (#### Name (Cost) prose entries). All three folded
// into srd_library.category = 'items' to match this app's existing
// Items category. Confirmed table structure by direct inspection: a
// <thead> header row, then <tbody> rows -- some rows are actual items
// (<td> cells), some are category-divider rows
// (<th colspan="N"><em>Section Name</em></th>) which this parser skips.
// ============================================================
function parseHtmlTable(tableHtml) {
  const rows = [];
  const rowMatches = tableHtml.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  let currentGroup = null;
  for (const rowHtml of rowMatches) {
    if (/<th colspan/.test(rowHtml)) {
      const groupMatch = rowHtml.match(/<em>(.+?)<\/em>/);
      currentGroup = groupMatch ? groupMatch[1].trim() : null;
      continue;
    }
    const cells = [...rowHtml.matchAll(/<t[dh]>(.*?)<\/t[dh]>/gs)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
    if (!cells.length || cells[0] === "Name" || cells[0] === "Armor" || cells[0] === "Item") continue; // header row
    rows.push({ group: currentGroup, cells });
  }
  return rows;
}

function parseWeaponsAndArmor(text) {
  const items = [];

  const weaponsSection = text.slice(text.indexOf("## Weapons"), text.indexOf("## Armor"));
  const weaponsTable = weaponsSection.match(/<table>[\s\S]*?<\/table>/);
  if (weaponsTable) {
    for (const row of parseHtmlTable(weaponsTable[0])) {
      const [name, damage, properties, mastery, weight, cost] = row.cells;
      if (!name) continue;
      items.push({
        srd_id: slugify(name),
        name,
        data_json: { name, itemType: "Weapon", category: row.group, damage, properties, mastery, weight, cost },
        rarity: null
      });
    }
  }

  const armorSection = text.slice(text.indexOf("## Armor"), text.indexOf("## Tools"));
  const armorTable = armorSection.match(/<table>[\s\S]*?<\/table>/);
  if (armorTable) {
    for (const row of parseHtmlTable(armorTable[0])) {
      const [name, ac, str, stealth, weight, cost] = row.cells;
      if (!name) continue;
      items.push({
        srd_id: slugify(name),
        name,
        data_json: { name, itemType: "Armor", category: row.group, armorClass: ac, strength: str, stealth, weight, cost },
        rarity: null
      });
    }
  }

  return items;
}

// Adventuring Gear -- "#### Name (Cost)" headers under "## Adventuring
// Gear", ending at the next "## " section. Confirmed: Acid, Alchemist's
// Fire, Ammunition, Antitoxin, Arcane Focus, Backpack, etc.
function parseAdventuringGear(text) {
  const startIdx = text.indexOf("## Adventuring Gear");
  if (startIdx === -1) return [];
  const nextSectionIdx = text.indexOf("\n## ", startIdx + 1);
  const body = text.slice(startIdx, nextSectionIdx === -1 ? undefined : nextSectionIdx);

  const blocks = body.split(/\n(?=#### )/).slice(1);
  const items = [];
  for (const block of blocks) {
    const nameMatch = block.match(/^#### (.+?)\s*\(([^)]+)\)\s*$/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const cost = nameMatch[2].trim();
    // Stop description at the first embedded <table> (e.g. Ammunition's
    // sub-table) or the next "#### " header, whichever comes first --
    // both already handled by the block split; a stray <table> inside
    // one block just gets included in description text, harmless.
    const description = block.slice(nameMatch[0].length).replace(/<table>[\s\S]*?<\/table>/, "").trim();
    items.push({
      srd_id: slugify(name),
      name,
      data_json: { name, itemType: "Adventuring Gear", cost, description },
      rarity: null
    });
  }
  return items;
}

// ============================================================
// Classes (classes.md) -- one "## ClassName" header per core class (12
// total: Barbarian through Wizard), each opening with a "**Core
// <ClassName> Traits**" plain <table> of consistent label/value row
// pairs (Primary Ability, Hit Point Die, Saving Throw Proficiencies,
// Skill Proficiencies, Weapon Proficiencies, Armor Training, Starting
// Equipment). Confirmed identical structure across all 12 classes by
// direct inspection, and every hit die/saving-throw pair cross-checked
// against this codebase's own hand-verified
// lib/rulesets/5e/classFormulas.js table -- exact match on all 12.
//
// Deliberately NOT parsed: the full level-by-level Class Features
// table and the full nested subclass feature list (each subclass has
// its own multi-level feature progression, same depth-of-nesting risk
// that kept full Classes ingestion out of the first pass). What IS
// captured: the Core Traits block (fully mechanical, safe to trust
// verbatim) plus the name + one-line tagline of the SRD's single
// example subclass per class (flavor only, not its feature list) --
// enough for a real Import/Reflavor/Homebrew grounding reference
// without the unverified-parse risk of the deeper content.
// ============================================================
function parseClasses(text) {
  const classHeaders = [...text.matchAll(/^## (.+)$/gm)].map((m) => ({ name: m[1].trim(), index: m.index }));
  const classes = [];

  for (let i = 0; i < classHeaders.length; i++) {
    const { name, index } = classHeaders[i];
    const end = i + 1 < classHeaders.length ? classHeaders[i + 1].index : text.length;
    const block = text.slice(index, end);

    const coreTableMatch = block.match(/\*\*Core .+? Traits\*\*\s*\n\s*<table>[\s\S]*?<\/table>/);
    const fields = {};
    if (coreTableMatch) {
      const rowMatches = [...coreTableMatch[0].matchAll(/<tr>\s*<td>(.+?)<\/td>\s*<td>(.+?)<\/td>\s*<\/tr>/gs)];
      for (const [, label, value] of rowMatches) {
        fields[label.replace(/<[^>]+>/g, "").trim()] = value.replace(/<[^>]+>/g, "").trim();
      }
    }
    if (!coreTableMatch || !fields["Hit Point Die"]) continue; // not a real class block, stay defensive

    const subclassMatch = block.match(/^### .+? Subclass: (.+)$/m);
    let exampleSubclass = null;
    if (subclassMatch) {
      const subclassName = subclassMatch[1].trim();
      const afterHeader = block.slice(block.indexOf(subclassMatch[0]) + subclassMatch[0].length);
      const taglineMatch = afterHeader.match(/^\s*\n_(.+?)_/);
      exampleSubclass = { name: subclassName, tagline: taglineMatch ? taglineMatch[1].trim() : null };
    }

    classes.push({
      srd_id: slugify(name),
      name,
      data_json: {
        name,
        primaryAbility: fields["Primary Ability"] || null,
        hitDie: fields["Hit Point Die"] || null,
        savingThrowProficiencies: fields["Saving Throw Proficiencies"] || null,
        skillProficiencies: fields["Skill Proficiencies"] || null,
        weaponProficiencies: fields["Weapon Proficiencies"] || null,
        armorTraining: fields["Armor Training"] || null,
        startingEquipment: fields["Starting Equipment"] || null,
        exampleSubclass
      },
      class_name: name
    });
  }
  return classes;
}

// ============================================================
// Upsert helper -- same idempotency contract as ingestSrd5e.js
// (upsert on ruleset+category+srd_id, so re-running after a source
// update overwrites rather than duplicates).
// ============================================================
async function upsertRows(category, rows, extraColumns = () => ({})) {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    ruleset: "5e",
    category,
    srd_id: r.srd_id,
    name: r.name,
    data_json: r.data_json,
    source_edition: SOURCE_EDITION,
    license_note: LICENSE_NOTE,
    ...extraColumns(r)
  }));
  const { error } = await supabase.from("srd_library").upsert(payload, { onConflict: "ruleset,category,srd_id" });
  if (error) throw new Error(`Upsert failed for category '${category}': ${error.message}`);
  return payload.length;
}

async function ingestAll() {
  const results = {};

  const spellsText = await fetchText("spells.md");
  results.spells = await upsertRows("spells", parseSpells(spellsText), (r) => ({ level: r.level, class_name: r.class_name }));

  const equipmentText = await fetchText("equipment.md");
  const weaponsArmor = parseWeaponsAndArmor(equipmentText);
  const gear = parseAdventuringGear(equipmentText);
  results.items = await upsertRows("items", [...weaponsArmor, ...gear]);

  const featsText = await fetchText("feats.md");
  results.feats = await upsertRows("feats", parseFeats(featsText));

  const magicItemsText = await fetchText("magic-items.md");
  results["magic-items"] = await upsertRows("magic-items", parseMagicItems(magicItemsText), (r) => ({ rarity: r.rarity }));

  const classesText = await fetchText("classes.md");
  results.classes = await upsertRows("classes", parseClasses(classesText), (r) => ({ class_name: r.class_name }));

  return results;
}

module.exports = { ingestAll, parseSpells, parseFeats, parseMagicItems, parseWeaponsAndArmor, parseAdventuringGear, parseClasses };

if (require.main === module) {
  ingestAll()
    .then((results) => {
      console.log("SRD ingestion complete:");
      Object.entries(results).forEach(([cat, count]) => console.log(`  ${cat}: ${count} rows upserted`));
      process.exit(0);
    })
    .catch((err) => {
      console.error("SRD ingestion failed:", err);
      process.exit(1);
    });
}
