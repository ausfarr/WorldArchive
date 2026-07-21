// scripts/ingestWorldBible.js
//
// One-time (re-run-when-the-doc-changes) ingestion of the World Bible source
// doc into lore/world_bible_sections.json. Run manually:
//
//   node scripts/ingestWorldBible.js path/to/World-Bible.md
//
// Design notes:
// - Tagging is RULE-BASED, not model-based. The doc's own structure already
//   telegraphs faction/category almost perfectly (Part III factions are
//   literally titled by faction; Part VI classes are per-class headers), so
//   a Claude-tagging pass would mostly be re-deriving what a title regex
//   already tells us — extra cost/latency for no real accuracy gain. Tags
//   land in the output JSON in plain form, so if any are wrong, hand-edit
//   the JSON directly rather than re-running ingestion.
// - Parts VII (Formulas), IX (Prologue script), and X (Production
//   Reference / MVP scope) are excluded entirely — formulas are already
//   deterministically computed in statFormulas.js/itemFormulas.js, and IX/X
//   are dev-scope docs (3-class MVP, cut-feature lists) that no longer
//   match the live archive (8 classes already built) and would risk the
//   model second-guessing itself back toward stale MVP limits.
// - "V2 MVP Class Kits (Production-Ready Subset)" under Part VI is excluded
//   for the same MVP-scope reason, even though it's not under an excluded
//   Part — it's a redundant, narrower subset of the full class trees that
//   are already fed in via the "Detailed Class" sections.

const fs = require("fs");
const path = require("path");

// Exact Part-numeral matches only — do NOT use string prefix matching here.
// "Part VIII".startsWith("Part VII") is true as a plain string comparison
// (VIII starts with VII), which would wrongly exclude Part VIII too. We
// extract just the roman numeral token and compare for exact equality.
const EXCLUDED_PART_NUMERALS = new Set([
  "VII", // Core Systems & Formulas — superseded by statFormulas.js/itemFormulas.js
  "IX",  // The Prologue tutorial script — not lore, not needed by generators
  "X",   // Production Reference / MVP scope — stale, conflicts with live archive
]);

function partNumeral(partTitle) {
  const m = partTitle.match(/^Part\s+([IVX]+)\b/i);
  return m ? m[1].toUpperCase() : null;
}

const EXCLUDED_SECTION_TITLES = [
  "V2 MVP Class Kits (Production-Ready Subset)",
  "V2 MVP Crafting Scope", // same stale-MVP-cap issue (caps at 4-6 weapons total)
];

// Strip markdown bold markers, smart quotes, stray asterisks left over from
// the doc's Word->Markdown export.
function cleanText(s) {
  return s
    .replace(/\*\*/g, "")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\r/g, "")
    .trim();
}

function headerLevel(line) {
  const m = line.match(/^(#+)\s+/);
  return m ? m[1].length : 0;
}

function headerTitle(line) {
  return cleanText(line.replace(/^#+\s+/, ""));
}

// --- Faction / category tagging rules -------------------------------------

const FACTION_KEYWORDS = [
  { key: "preservation", re: /preservation/i },
  { key: "ferro_kings", re: /ferro-kings/i },
  { key: "the_board", re: /\bthe board\b/i },
  { key: "glitch_kin", re: /glitch-kin/i },
  { key: "colony", re: /\bcolony\b|\bthe silo\b/i },
];

function detectFactionTags(partTitle, sectionTitle) {
  const hay = `${partTitle} ${sectionTitle}`;
  const tags = FACTION_KEYWORDS.filter((f) => f.re.test(hay)).map((f) => f.key);
  return tags.length ? tags : [];
}

// Part-level defaults for which generator categories a section is relevant
// to. Section-level overrides layered on top where a title is more specific
// than its Part (e.g. a named faction section under Part III).
const PART_CATEGORY_DEFAULTS = {
  "Part I": ["core"],
  "Part II": ["core"],
  "Part III": ["factions", "npcs", "enemies"],
  "Part IV": ["survivors", "logs", "factions"],
  "Part V": ["logs", "enemies"],
  "Part VI": ["classes"],
  "Part VIII": ["items"],
  Appendix: ["core"],
};

function detectCategoryTags(partKey, sectionTitle) {
  const base = PART_CATEGORY_DEFAULTS[partKey] || [];
  // Class sections are also useful to NPCs occasionally referencing a
  // profession-turned-class, but keep it simple: category defaults cover
  // the common case, hand-edit the JSON for edge cases.
  return base;
}

function partKeyFor(partTitle) {
  const numeral = partNumeral(partTitle);
  if (numeral) return `Part ${numeral}`;
  if (/appendix/i.test(partTitle)) return "Appendix";
  return partTitle;
}

// --- Parser ------------------------------------------------------------

function parseWorldBible(mdText) {
  const lines = mdText.split("\n");

  let currentPartTitle = null;
  let currentPartExcluded = false;
  let currentSection = null; // { level, title, contentLines: [] }
  const sections = [];

  function flushSection() {
    if (!currentSection) return;
    const content = cleanText(currentSection.contentLines.join("\n")).trim();
    if (content.length > 0) {
      sections.push({
        partTitle: currentPartTitle,
        sectionTitle: currentSection.title,
        content,
      });
    }
    currentSection = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const level = headerLevel(line);

    if (level === 1) {
      // New Part (or the lone Table of Contents / top title lines) — flush
      // whatever section we were building under the previous Part.
      flushSection();
      currentPartTitle = headerTitle(line);
      currentPartExcluded = EXCLUDED_PART_NUMERALS.has(
        partNumeral(currentPartTitle)
      );
      // Some Parts have framing content directly under the "#" header,
      // before any "##" subsection (e.g. Part VIII's Base+Effector+Binder
      // recipe rule, or Part III's "class war" framing line). Capture that
      // as its own "— Overview" section so it isn't silently dropped.
      currentSection = {
        level: 1,
        title: "Overview",
        contentLines: [],
        excluded: currentPartExcluded,
      };
      continue;
    }

    if (level === 2) {
      flushSection();
      const title = headerTitle(line);
      if (currentPartExcluded || EXCLUDED_SECTION_TITLES.includes(title)) {
        currentSection = null; // signal: don't collect content for this one
        currentSection = { level, title, contentLines: [], excluded: true };
      } else {
        currentSection = { level, title, contentLines: [], excluded: false };
      }
      continue;
    }

    if (level >= 3) {
      // ### and deeper: fold into the current ## section as sub-content
      // (keeps e.g. a class's full tier breakdown as one coherent chunk)
      // rather than fragmenting into tiny separately-tagged pieces.
      if (currentSection && !currentSection.excluded) {
        currentSection.contentLines.push(line);
      }
      continue;
    }

    // Plain content line
    if (currentSection && !currentSection.excluded && !currentPartExcluded) {
      currentSection.contentLines.push(line);
    }
  }
  flushSection();

  // Drop anything marked excluded that slipped through, and anything with
  // no real content (e.g. the standalone "Table of Contents" header).
  return sections.filter((s) => !EXCLUDED_SECTION_TITLES.includes(s.sectionTitle));
}

function tagSection(section) {
  const partKey = partKeyFor(section.partTitle);
  const isCore =
    partKey === "Part I" || partKey === "Part II" || partKey === "Appendix";
  return {
    id: `${partKey.replace(/\s+/g, "-").toLowerCase()}__${section.sectionTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}`,
    part: section.partTitle,
    title: section.sectionTitle,
    core: isCore,
    factionTags: detectFactionTags(section.partTitle, section.sectionTitle),
    categoryTags: detectCategoryTags(partKey, section.sectionTitle),
    content: section.content,
  };
}

function ingest(inputPath, outputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  const sections = parseWorldBible(raw).map(tagSection);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(sections, null, 2));
  return sections;
}

// CLI entry point
if (require.main === module) {
  const inputPath = process.argv[2] || "World-Bible.md";
  const outputPath = process.argv[3] || "lore/world_bible_sections.json";
  const sections = ingest(inputPath, outputPath);
  console.log(`Parsed ${sections.length} sections -> ${outputPath}`);
  const totalChars = sections.reduce((n, s) => n + s.content.length, 0);
  console.log(`Total content: ~${Math.round(totalChars / 4)} tokens (rough estimate)`);
  console.log("\nSection index:");
  for (const s of sections) {
    console.log(
      `  [${s.core ? "CORE" : "    "}] ${s.part} > ${s.title}  ` +
        `(faction: ${s.factionTags.join(",") || "-"}; category: ${s.categoryTags.join(",")})`
    );
  }
}

module.exports = { parseWorldBible, tagSection, ingest };
