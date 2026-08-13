// scripts/ingestSrd5eFull.js
//
// R5 Phase 4: real ingestion of Spells/Equipment/Classes/Feats/Magic
// Items into srd_library (migrations/020_ruleset_foundation.sql),
// picking up exactly where scripts/ingestSrd5e.js's own header comment
// left off ("Classes/Spells/Items are NOT ingested by this script yet").
// Deliberately a SEPARATE file, not an extension of ingestSrd5e.js --
// that script owns Monsters from a different source (Tabyltop/CC-SRD)
// and stays untouched, matching this project's "each source gets its
// own ingestion script" convention.
//
// SOURCE & LICENSE -- read before touching this file:
//
//   downfallx/dnd-5e-srd-markdown
//   (https://github.com/downfallx/dnd-5e-srd-markdown) -- the complete
//   D&D 5e (2024) SRD 5.2.1 converted to Markdown. Verified directly
//   (fresh clone, this session) against both its README.md and its
//   separate LICENSE file: both state plainly "licensed under the
//   Creative Commons Attribution 4.0 International License", ship the
//   WotC-mandated attribution text (reproduced verbatim below in
//   LICENSE_NOTE, same as ingestSrd5e.js does for its own source), and
//   list no other/conflicting license anywhere in the repo. This is
//   genuinely, unambiguously CC-BY-4.0 -- distinct in character from
//   5e-bits/5e-database, which R4's own addendum
//   (session_addendum_r4_5e_completeness_shipped.md) already rejected
//   for a blanket MIT+OGL 1.0a statement covering its entire repo with
//   no CC-BY-4.0 language anywhere, and for having no Spells data at all
//   in its CC-BY-4.0-claimed directory.
//
//   Spot-check verification performed before trusting the parsers below
//   (hand-compared against real, well-known SRD/PHB stats):
//     Spells (5): Fireball (L3 Evocation, 150 ft, V/S/M, 8d6 Fire),
//       Fire Bolt (Evocation cantrip, 120 ft, 1d10 Fire), Cure Wounds
//       (L1 Abjuration -- 2024 SRD reclassifies it from Evocation --
//       touch, 2d8 + spellcasting mod), Magic Missile (L1 Evocation,
//       120 ft, three darts at 1d4+1 Force each), Shield (L1 Abjuration,
//       Reaction, +5 AC) -- all 5 matched exactly.
//     Classes (3, hit die + primary ability): Fighter (d10, Str or Dex),
//       Wizard (d6, Int), Sorcerer (d6, Cha) -- all matched exactly, and
//       consistent with R4's own independent verification of Fighter/
//       Wizard against a different mirror.
//     Items (3): Chain Mail (AC 16, Str 13, Disadvantage stealth, 55 lb,
//       75 GP), Studded Leather Armor (AC 12 + Dex, no Str/Stealth
//       penalty, 13 lb, 45 GP), Longsword (1d8 Slashing, Versatile
//       1d10, Sap mastery, 3 lb, 15 GP) -- all matched exactly, and
//       consistent with R4's Phase 4 cross-check of the same 3 items
//       against a different mirror.
//     Magic items (3, rarity + attunement): Bag of Holding (Uncommon, no
//       attunement), Cloak of Protection (Uncommon, Requires
//       Attunement), Ring of Protection (Rare, Requires Attunement) --
//       all matched exactly.
//   See scripts/verifySrd5eFullIngest.js for these checks as a runnable
//   script (re-run any time the source data changes).
//
//   Parsing approach: this source is real markdown/HTML-table prose, not
//   structured per-item JSON, so each category gets its own real parser
//   below rather than a naive line-by-line ingest of every heading as if
//   it were an entry (confirmed by sampling: spells.md opens with ~260
//   lines of rules prose and reference tables -- Spell Preparation by
//   Class, Schools of Magic -- before the actual "## Spell Descriptions"
//   section where individual `#### SpellName` entries begin; the same
//   "rules prose first, entries after" shape holds for feats.md and
//   magic-items.md). All five target categories turned out to have
//   real, consistent internal structure once isolated from their
//   surrounding rules text -- none needed to be deferred:
//     - Spells/Feats/Magic Items: `#### EntryName` headers, each
//       immediately followed by an italic meta line (`_Level 3
//       Evocation (Sorcerer, Wizard)_`, `_Origin Feat_`, `_Wondrous
//       Item, Rare (Requires Attunement)_`) and then body prose. A
//       handful of spells/magic items have nested `## `/`### `
//       companion-stat-block appendices inside their own entry (e.g.
//       Find Steed's `## Otherworldly Steed` stat block, a sentient
//       item's `### Traits`/`### Actions`) -- these are swept into
//       that entry's own body text (correct, since they're part of its
//       description) rather than mistaken for new top-level entries,
//       since only `#### ` starts a real entry boundary here.
//     - Classes: each of the 12 core classes is a `## ClassName`
//       section containing a 2-column "Core ClassName Traits" table
//       (Primary Ability/Hit Point Die/Saving Throw Proficiencies/
//       Skill Proficiencies/Weapon Proficiencies/Armor Training/
//       Starting Equipment), a `### ClassName Class Features` region of
//       `#### LevelN: FeatureName` entries, and -- confirmed real, not
//       the feared irregular case -- exactly ONE `### ClassName
//       Subclass: SubclassName` per class (the SRD's free sample
//       subclass; the rest of each class's subclasses are full-PHB-only
//       and correctly absent here), itself a further list of `####
//       LevelN: FeatureName` entries.
//     - Equipment: genuinely the most heterogeneous file (weapons/armor
//       are clean `<table>` HTML with category-divider rows via
//       `<th colspan>`; Adventuring Gear is a flat item/weight/cost
//       `<table>` cross-referenced against `#### ItemName (Cost)` prose
//       entries for the items that have rules text; Tools is a third
//       shape again -- `**ToolName (Cost)**` bold-line entries with
//       `**Ability:**`/`**Weight:**`/`**Utilize:**`/`**Craft:**`/
//       `**Variants:**` field lines, no heading markup at all) -- but
//       each of those three shapes is internally consistent, so each
//       gets its own small parser rather than forcing one shared shape
//       across all of them.
//
//   srd_library.category is a plain text column with no CHECK
//   constraint (see migrations/020_ruleset_foundation.sql -- only a
//   descriptive comment: 'monsters' | 'classes' | 'subclasses' |
//   'spells' | 'items'), so no migration is needed to add the two new
//   category strings this script introduces: 'feats' and 'magic-items'.
//   Full current category list after this script: 'monsters' (existing,
//   ingestSrd5e.js), 'spells', 'classes', 'items' (weapons/armor/gear/
//   tools -- matches the 'items' category convention already used
//   elsewhere in this schema, per this file's own instructions), 'feats',
//   'magic-items'. srd_id is namespaced by subtype for the 'items'
//   category specifically (`weapon-`/`armor-`/`gear-`/`tool-` prefixes)
//   since weapons/armor/gear/tools are four different source lists
//   sharing one category value and a name collision across them is
//   possible in principle (none observed in the actual data, but the
//   prefix costs nothing and removes the risk).
//
// Run with: node scripts/ingestSrd5eFull.js
// Requires SUPABASE_URL / SUPABASE_SECRET_KEY env vars (service-role
// client -- srd_library only accepts writes from the service-role
// client; see migrations/020_ruleset_foundation.sql's RLS policy).
// Idempotent -- safe to re-run; upserts on (ruleset, category, srd_id).

const { supabase } = require("../lib/supabaseClient");

const RAW_BASE = "https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master";
const SOURCE_EDITION = "5e SRD 5.2.1";

// Exact attribution text from downfallx/dnd-5e-srd-markdown's own
// LICENSE file -- copied verbatim, not paraphrased, same treatment
// ingestSrd5e.js gives its own source's mandated attribution text.
const LICENSE_NOTE =
  "This work includes material taken from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC and is licensed under the Creative Commons Attribution 4.0 International License. Dungeons & Dragons, D&D, Wizards of the Coast, and their logos are trademarks of Wizards of the Coast LLC in the United States and other countries. The official SRD 5.2.1 can be found at: https://www.dndbeyond.com/. The markdown conversion and repository organization are provided by the community (downfallx/dnd-5e-srd-markdown) and are not affiliated with, endorsed by, or sponsored by Wizards of the Coast.";

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

async function fetchText(filename) {
  const url = `${RAW_BASE}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetching ${filename} failed: ${res.status} ${res.statusText}`);
  return res.text();
}

// ============================================================
// Shared parsing helpers
// ============================================================

// Splits a markdown region into `#### EntryName` entries as
// {name, block}. Each block runs until the next #### header, or until an
// earlier ## header if one falls inside first (a handful of spells/magic
// items have a nested "## companion stat block" appendix within their own
// entry -- e.g. Find Steed's "## Otherworldly Steed" -- which belongs to
// that entry's body, not a new top-level entry, since only #### starts a
// real entry here).
function parseHashEntries(text, { stopAtH2 = true } = {}) {
  const entries = [];
  const headerRe = /^#### (.+)$/gm;
  const matches = [...text.matchAll(headerRe)];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    let block = text.slice(start, end);
    if (stopAtH2) {
      const nextH2 = block.search(/^## /m);
      if (nextH2 !== -1) block = block.slice(0, nextH2);
    }
    entries.push({ name: matches[i][1].trim(), block: block.trim() });
  }
  return entries;
}

// Parses one <table>...</table> block into {headers, rows}. Category
// divider rows (<th colspan="N"><em>Category</em></th>, used by the
// Weapons/Armor tables to group rows under a subheading) are tracked as
// row.__category on every following row rather than emitted as their own
// row.
function parseHtmlTable(tableHtml) {
  if (!tableHtml) return { headers: [], rows: [] };
  const headMatch = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/);
  const bodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!bodyMatch) return { headers: [], rows: [] };
  function cellsOf(rowHtml) {
    return [...rowHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    );
  }
  const headers = headMatch ? cellsOf(headMatch[1]) : [];
  const rowHtmls = [...bodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const rows = [];
  let currentCategory = null;
  for (const rowHtml of rowHtmls) {
    const isCategoryRow = /<th[^>]*colspan/.test(rowHtml);
    const cells = cellsOf(rowHtml);
    if (isCategoryRow) {
      currentCategory = cells[0] || null;
      continue;
    }
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ""; });
    if (currentCategory) row.__category = currentCategory;
    rows.push(row);
  }
  return { headers, rows };
}

// Finds "**Label**\n\n<table>...</table>" (the "**Weapons**"/"**Armor**"/
// "**Adventuring Gear**" bold caption immediately preceding its table)
// and returns the raw <table>...</table> substring.
function findNamedTable(text, label, fromIndex = 0) {
  const idx = text.indexOf(`**${label}**`, fromIndex);
  if (idx === -1) return null;
  const tableStart = text.indexOf("<table>", idx);
  const tableEnd = text.indexOf("</table>", tableStart);
  if (tableStart === -1 || tableEnd === -1) return null;
  return text.slice(tableStart, tableEnd + "</table>".length);
}

// Splits on top-level commas only, ignoring commas nested inside parens --
// magic item type descriptors like "Armor (Any Medium or Heavy, Except
// Hide Armor), Uncommon" have a comma inside the parenthetical that isn't
// a real field separator.
function splitTopLevelCommas(str) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// ============================================================
// Spells
// ============================================================

function parseSpells(text) {
  const startIdx = text.indexOf("## Spell Descriptions");
  const region = startIdx !== -1 ? text.slice(startIdx) : text;
  return parseHashEntries(region).map(({ name, block }) => {
    const metaMatch = block.match(/^_(.+?)_/);
    const meta = metaMatch ? metaMatch[1] : "";

    let level = 0;
    let school = null;
    const levelMatch = meta.match(/^Level (\d+) (\w+)/);
    const cantripMatch = meta.match(/^(\w+) Cantrip/);
    if (levelMatch) {
      level = Number(levelMatch[1]);
      school = levelMatch[2];
    } else if (cantripMatch) {
      school = cantripMatch[1];
    }
    const classesMatch = meta.match(/\(([^)]+)\)/);
    const classes = classesMatch ? classesMatch[1].split(",").map((s) => s.trim()) : [];

    const castingTime = (block.match(/\*\*Casting Time:\*\*\s*(.+)/) || [])[1] || null;
    const range = (block.match(/\*\*Range:\*\*\s*(.+)/) || [])[1] || null;
    const components = (block.match(/\*\*Components?:\*\*\s*(.+)/) || [])[1] || null;
    const duration = (block.match(/\*\*Duration:\*\*\s*(.+)/) || [])[1] || null;

    const afterFields = block.split(/\*\*Duration:\*\*.*\n/)[1] || "";
    const higherMatch =
      afterFields.match(/_Using a Higher-Level Spell Slot\._\s*(.+)/) ||
      afterFields.match(/_Cantrip Upgrade\._\s*(.+)/);
    const atHigherLevels = higherMatch ? higherMatch[1].trim() : null;

    const description = afterFields
      .replace(/_Using a Higher-Level Spell Slot\._[\s\S]*$/, "")
      .replace(/_Cantrip Upgrade\._[\s\S]*$/, "")
      .trim();

    return { name, level, school, classes, castingTime, range, components, duration, description, atHigherLevels };
  });
}

// ============================================================
// Feats
// ============================================================

function parseFeats(text) {
  const startIdx = text.indexOf("## Feat Descriptions");
  const region = startIdx !== -1 ? text.slice(startIdx) : text;
  return parseHashEntries(region)
    .filter(({ name }) => name !== "Parts of a Feat") // rules-text header, not a real feat
    .map(({ name, block }) => {
      const metaMatch = block.match(/^_(.+?)_/);
      const meta = metaMatch ? metaMatch[1] : "";
      const categoryMatch = meta.match(/^([\w\s]*?) Feat/);
      const category = categoryMatch ? categoryMatch[1].trim() : null;
      const prereqMatch = meta.match(/Prerequisite:\s*([^)]+)/);
      const prerequisite = prereqMatch ? prereqMatch[1].trim() : null;
      const benefit = block.replace(/^_.+?_\n*/, "").trim();
      const repeatable = /_Repeatable\._/.test(benefit);
      return { name, category, prerequisite, benefit, repeatable };
    });
}

// ============================================================
// Magic Items
// ============================================================

function parseMagicItems(text) {
  const startIdx = text.indexOf("## Magic Items A");
  const region = startIdx !== -1 ? text.slice(startIdx) : text;
  return parseHashEntries(region).map(({ name, block }) => {
    const metaMatch = block.match(/^_(.+?)_/);
    const meta = metaMatch ? metaMatch[1] : "";
    const parts = splitTopLevelCommas(meta);
    const type = parts[0] || null;
    const rarityPart = parts.slice(1).join(", ") || "";
    const rarityMatch = rarityPart.match(/^(Common|Uncommon|Rare|Very Rare|Legendary|Artifact|Varies)/i);
    const rarity = rarityMatch ? rarityMatch[1] : rarityPart || null;
    const attunementMatch = rarityPart.match(/Requires Attunement([^)]*)/i);
    const attunement = attunementMatch
      ? (attunementMatch[1].trim() ? `Requires Attunement${attunementMatch[1]}` : "Requires Attunement")
      : null;
    const description = block.replace(/^_.+?_\n*/, "").trim();
    return { name, type, rarity, attunement, description };
  });
}

// ============================================================
// Classes
// ============================================================

// Parses "#### LevelN: FeatureName" blocks within a region into
// [{level, name, description}], each stopping at the next #### / ### / ##.
function parseLeveledFeatures(regionText) {
  const headerRe = /^#### Level (\d+):\s*(.+)$/gm;
  const matches = [...regionText.matchAll(headerRe)];
  const features = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : regionText.length;
    let block = regionText.slice(start, end);
    const nextHeading = block.search(/^#{2,3} /m);
    if (nextHeading !== -1) block = block.slice(0, nextHeading);
    features.push({ level: Number(matches[i][1]), name: matches[i][2].trim(), description: block.trim() });
  }
  return features;
}

function parseClasses(text) {
  const classHeaderRe = /^## (\w[\w\s]*?)$/gm;
  const matches = [...text.matchAll(classHeaderRe)].filter((m) => m[1].trim() !== "Classes");
  const classes = [];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].trim();
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const region = text.slice(start, end);

    const coreTable = findNamedTable(region, `Core ${name} Traits`);
    const coreFields = {};
    if (coreTable) {
      const rowHtmls = [...coreTable.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
      rowHtmls.forEach((rowHtml) => {
        const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
          m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
        );
        if (cells.length === 2) coreFields[cells[0]] = cells[1];
      });
    }
    const hitDieMatch = (coreFields["Hit Point Die"] || "").match(/D(\d+)/i);
    const hitDie = hitDieMatch ? Number(hitDieMatch[1]) : null;

    const classFeaturesIdx = region.indexOf(`### ${name} Class Features`);
    const subclassHeaderMatch = region.match(/^### .+Subclass:\s*(.+)$/m);
    const subclassIdx = subclassHeaderMatch ? subclassHeaderMatch.index : region.length;

    const featuresRegion = classFeaturesIdx !== -1 ? region.slice(classFeaturesIdx, subclassIdx) : "";
    const features = parseLeveledFeatures(featuresRegion);

    let subclass = null;
    if (subclassHeaderMatch) {
      const subclassRegion = region.slice(subclassIdx);
      subclass = { name: subclassHeaderMatch[1].trim(), features: parseLeveledFeatures(subclassRegion) };
    }

    classes.push({
      name,
      hitDie,
      primaryAbility: coreFields["Primary Ability"] || null,
      savingThrowProficiencies: coreFields["Saving Throw Proficiencies"] || null,
      skillProficiencies: coreFields["Skill Proficiencies"] || null,
      weaponProficiencies: coreFields["Weapon Proficiencies"] || null,
      armorTraining: coreFields["Armor Training"] || null,
      startingEquipment: coreFields["Starting Equipment"] || null,
      features,
      subclass
    });
  }
  return classes;
}

// ============================================================
// Equipment: weapons, armor, adventuring gear, tools
// ============================================================

function parseWeapons(text) {
  const table = findNamedTable(text, "Weapons");
  const { rows } = parseHtmlTable(table);
  return rows.map((r) => ({
    name: r.Name,
    damage: r.Damage,
    properties: r.Properties,
    mastery: r.Mastery,
    weight: r.Weight,
    cost: r.Cost,
    category: r.__category || null
  }));
}

function parseArmor(text) {
  const table = findNamedTable(text, "Armor");
  const { rows } = parseHtmlTable(table);
  return rows.map((r) => ({
    name: r.Armor,
    armorClass: r["Armor Class (AC)"],
    strength: r.Strength,
    stealth: r.Stealth,
    weight: r.Weight,
    cost: r.Cost,
    category: r.__category || null
  }));
}

// Merges the flat Item/Weight/Cost table (every gear item) with the
// #### ItemName (Cost) prose entries (only items with real rules text --
// plain gear like "Backpack" has a table row but no prose entry).
function parseAdventuringGear(text) {
  const sectionStart = text.indexOf("## Adventuring Gear");
  const sectionEnd = text.indexOf("## Mounts and Vehicles");
  const region = text.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

  const table = findNamedTable(region, "Adventuring Gear");
  const { rows } = parseHtmlTable(table);

  const proseByName = new Map();
  parseHashEntries(region).forEach(({ name, block }) => {
    const cleanName = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
    proseByName.set(cleanName.toLowerCase(), block);
  });

  return rows.map((row) => ({
    name: row.Item,
    weight: row.Weight,
    cost: row.Cost,
    description: proseByName.get((row.Item || "").toLowerCase()) || null
  }));
}

// Tools have no heading markup at all -- each entry is a bold-only line
// "**ToolName (Cost)**" followed by **Ability:**/**Weight:**/
// **Utilize:**/**Craft:**/**Variants:** field lines.
function parseTools(text) {
  const sectionStart = text.indexOf("## Tools");
  const sectionEnd = text.indexOf("## Adventuring Gear");
  const region = text.slice(sectionStart, sectionEnd);

  const entryRe = /^\*\*([^*\n]+?)\s*\(([^()\n]+)\)\*\*\s*$/gm;
  const matches = [...region.matchAll(entryRe)];
  const tools = [];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].trim();
    const cost = matches[i][2].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : region.length;
    const block = region.slice(start, end);

    const ability = (block.match(/\*\*Ability:\*\*\s*([^*\n]+)/) || [])[1];
    const weight = (block.match(/\*\*Weight:\*\*\s*([^*\n]+)/) || [])[1];
    const utilize = (block.match(/\*\*Utilize:\*\*\s*([^\n]+)/) || [])[1];
    const craft = (block.match(/\*\*Craft:\*\*\s*([^\n]+)/) || [])[1];
    const variants = (block.match(/\*\*Variants:\*\*\s*([^\n]+)/) || [])[1];

    tools.push({
      name,
      cost,
      ability: ability ? ability.trim() : null,
      weight: weight ? weight.trim() : null,
      utilize: utilize ? utilize.trim() : null,
      craft: craft ? craft.trim() : null,
      variants: variants ? variants.trim() : null
    });
  }
  return tools;
}

// ============================================================
// Ingestion (upsert into srd_library)
// ============================================================

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const { data, error } = await supabase
    .from("srd_library")
    .upsert(rows, { onConflict: "ruleset,category,srd_id" })
    .select("id");
  if (error) throw new Error(`Upserting srd_library rows failed: ${error.message}`);
  return data.length;
}

async function ingestSpells() {
  const text = await fetchText("spells.md");
  const spells = parseSpells(text);
  const rows = spells.map((s) => ({
    ruleset: "5e",
    category: "spells",
    srd_id: slugify(s.name),
    name: s.name,
    data_json: s,
    source_edition: SOURCE_EDITION,
    license_note: LICENSE_NOTE,
    level: s.level
  }));
  return { count: await upsertRows(rows), parsed: spells.length };
}

async function ingestFeats() {
  const text = await fetchText("feats.md");
  const feats = parseFeats(text);
  const rows = feats.map((f) => ({
    ruleset: "5e",
    category: "feats",
    srd_id: slugify(f.name),
    name: f.name,
    data_json: f,
    source_edition: SOURCE_EDITION,
    license_note: LICENSE_NOTE
  }));
  return { count: await upsertRows(rows), parsed: feats.length };
}

async function ingestMagicItems() {
  const text = await fetchText("magic-items.md");
  const items = parseMagicItems(text);
  const rows = items.map((it) => ({
    ruleset: "5e",
    category: "magic-items",
    srd_id: slugify(it.name),
    name: it.name,
    data_json: it,
    source_edition: SOURCE_EDITION,
    license_note: LICENSE_NOTE,
    rarity: it.rarity
  }));
  return { count: await upsertRows(rows), parsed: items.length };
}

async function ingestClasses() {
  const text = await fetchText("classes.md");
  const classes = parseClasses(text);
  const rows = classes.map((c) => ({
    ruleset: "5e",
    category: "classes",
    srd_id: slugify(c.name),
    name: c.name,
    data_json: c,
    source_edition: SOURCE_EDITION,
    license_note: LICENSE_NOTE,
    class_name: c.name
  }));
  return { count: await upsertRows(rows), parsed: classes.length };
}

async function ingestEquipment() {
  const text = await fetchText("equipment.md");
  const weapons = parseWeapons(text);
  const armor = parseArmor(text);
  const gear = parseAdventuringGear(text);
  const tools = parseTools(text);

  const rows = [
    ...weapons.map((w) => ({
      ruleset: "5e",
      category: "items",
      srd_id: `weapon-${slugify(w.name)}`,
      name: w.name,
      data_json: { itemType: "weapon", ...w },
      source_edition: SOURCE_EDITION,
      license_note: LICENSE_NOTE
    })),
    ...armor.map((a) => ({
      ruleset: "5e",
      category: "items",
      srd_id: `armor-${slugify(a.name)}`,
      name: a.name,
      data_json: { itemType: "armor", ...a },
      source_edition: SOURCE_EDITION,
      license_note: LICENSE_NOTE
    })),
    ...gear.map((g) => ({
      ruleset: "5e",
      category: "items",
      srd_id: `gear-${slugify(g.name)}`,
      name: g.name,
      data_json: { itemType: "gear", ...g },
      source_edition: SOURCE_EDITION,
      license_note: LICENSE_NOTE
    })),
    ...tools.map((t) => ({
      ruleset: "5e",
      category: "items",
      srd_id: `tool-${slugify(t.name)}`,
      name: t.name,
      data_json: { itemType: "tool", ...t },
      source_edition: SOURCE_EDITION,
      license_note: LICENSE_NOTE
    }))
  ];
  return {
    count: await upsertRows(rows),
    parsed: rows.length,
    breakdown: { weapons: weapons.length, armor: armor.length, gear: gear.length, tools: tools.length }
  };
}

async function main() {
  console.log("Fetching & ingesting 5e SRD 5.2.1 (downfallx/dnd-5e-srd-markdown, CC-BY-4.0)...\n");

  const spells = await ingestSpells();
  console.log(`Spells: parsed ${spells.parsed}, upserted ${spells.count}`);

  const equipment = await ingestEquipment();
  console.log(`Equipment (items): parsed ${equipment.parsed} (${JSON.stringify(equipment.breakdown)}), upserted ${equipment.count}`);

  const classes = await ingestClasses();
  console.log(`Classes: parsed ${classes.parsed}, upserted ${classes.count}`);

  const feats = await ingestFeats();
  console.log(`Feats: parsed ${feats.parsed}, upserted ${feats.count}`);

  const magicItems = await ingestMagicItems();
  console.log(`Magic Items: parsed ${magicItems.parsed}, upserted ${magicItems.count}`);

  console.log("\nDone. Run scripts/verifySrd5eFullIngest.js against a real Supabase project to spot-check the ingested rows.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("SRD 5e full ingestion failed:", err);
    process.exit(1);
  });
}

module.exports = {
  slugify,
  parseSpells,
  parseFeats,
  parseMagicItems,
  parseClasses,
  parseWeapons,
  parseArmor,
  parseAdventuringGear,
  parseTools,
  LICENSE_NOTE,
  SOURCE_EDITION
};
