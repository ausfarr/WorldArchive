// lib/loreParsing.js
//
// Generalized version of scripts/ingestWorldBible.js's parsing/tagging
// pattern, for the Wizard's "import an existing doc" path (any user's
// world, not just Echoes' own World Bible). Two real differences from the
// original script:
//
// 1. No Part-numeral exclusion logic (Echoes-specific -- a generic
//    uploaded doc has no "Part VII is formulas, skip it" structure to
//    lean on).
// 2. Category tagging is keyword-based against section TITLES (not the
//    doc's own explicit faction/category structure, since a generic doc
//    won't title sections "Part III — Factions" the way Echoes' does).
//    Sections that don't match any keyword default to matching ALL
//    categories rather than none -- silently dropping uncategorized lore
//    from every future generation is worse than a few prompts getting
//    slightly more context than strictly needed. This is a deliberate
//    completeness-over-precision tradeoff; revisit if it proves noisy.
//
// No faction tagging at all -- see migrations/003_lore_sections.sql's note
// on why (Factions is a later wizard step than Lore).

// Kept in sync with lib/entryLinker.js's own ALL_CATEGORIES -- that file's
// list is the canonical set of generator categories that actually call
// getLoreContext(worldId, { category }) (see lib/loreContext.js), so this
// one should match it exactly. It drifted out of sync when Locations and
// Spells shipped as real generator categories: both were missing here,
// which meant every non-core lore section (the "unmatched title" fallback
// below, plus the resource/culture/history/faction/politics keyword rows)
// silently never applied to a Location or Spell generation -- only the
// three `core: true` rows (geography/overview/glossary) reached them at
// all, since lib/loreContext.js's getRelevantLoreSections() includes core
// sections unconditionally regardless of categoryTags. Same root cause and
// shape as the routes/export.js VALID_CATEGORIES / lib/pdfExport.js
// CATEGORY_ORDER drift fixed earlier -- a duplicated category list that
// wasn't updated when a new category shipped. session-packets is
// deliberately NOT included: every getLoreContext() call site for it
// passes no `category` at all (core sections only), so it was never meant
// to be tagged here in the first place.
const ALL_CATEGORIES = ["factions", "npcs", "enemies", "classes", "items", "spells", "logs", "survivors", "locations"];

// Keyword -> which generator categories would plausibly want this section
// as grounding context. A section can match multiple topics/categories.
const TOPIC_CATEGORY_MAP = [
  { re: /geograph|map|region|territory|climate/i, categories: ALL_CATEGORIES, core: true },
  { re: /overview|introduction|premise|setting/i, categories: ALL_CATEGORIES, core: true },
  { re: /peoples?|population|demograph|species|races?/i, categories: ["npcs", "survivors", "enemies"], core: true },
  { re: /resource|econom|trade|currency|scarcity/i, categories: ["factions", "items"], core: false },
  { re: /cultur|religion|custom|ritual|language/i, categories: ["npcs", "survivors", "factions"], core: false },
  // "magic" is the single most relevant keyword for Spells grounding, but
  // "spells" was missing from this row's categories -- same drift as
  // ALL_CATEGORIES above, fixed the same way.
  { re: /technolog|magic|supernatural|power system/i, categories: ["items", "classes", "enemies", "spells"], core: false },
  { re: /histor|timeline|collapse|founding|origin/i, categories: ["factions", "npcs"], core: false },
  { re: /faction|politic|government|military/i, categories: ["factions", "npcs", "enemies"], core: false },
  { re: /glossary|terminology|lexicon/i, categories: ALL_CATEGORIES, core: true }
];

function detectCategoryTagsAndCore(title) {
  const matched = TOPIC_CATEGORY_MAP.filter((t) => t.re.test(title));
  if (matched.length === 0) {
    // Unmatched -- default to everything rather than nothing (see header note).
    return { categoryTags: ALL_CATEGORIES, core: false };
  }
  const categoryTags = Array.from(new Set(matched.flatMap((t) => t.categories)));
  const core = matched.some((t) => t.core);
  return { categoryTags, core };
}

function cleanText(s) {
  return s.replace(/\r/g, "").trim();
}

function headerLevel(line) {
  const m = line.match(/^(#+)\s+/);
  return m ? m[1].length : 0;
}

function headerTitle(line) {
  return cleanText(line.replace(/^#+\s+/, ""));
}

// Splits raw markdown/plain text into sections by top-level-ish headers
// (# or ##, whichever appears first is treated as the split level).
// Content before the first header (if any) becomes an "Overview" section,
// same fallback ingestWorldBible.js uses for the analogous Echoes bug.
function parseLoreDocument(rawText) {
  const lines = cleanText(rawText).split("\n");
  const headerLines = lines
    .map((line, i) => ({ line, i, level: headerLevel(line) }))
    .filter((l) => l.level > 0 && l.level <= 2);

  if (headerLines.length === 0) {
    // No headers at all -- treat the whole doc as one section.
    const { categoryTags, core } = detectCategoryTagsAndCore("Overview");
    return [{ title: "Overview", content: cleanText(rawText), categoryTags, core, position: 0 }];
  }

  const level1Count = headerLines.filter((l) => l.level === 1).length;
  const level2Count = headerLines.filter((l) => l.level === 2).length;
  // Prefer splitting on ## (level 2) whenever any exist -- the common
  // shape is one # title followed by several ## sections, and splitting
  // on level 1 in that case would swallow every ## subsection into a
  // single giant "preamble" instead of separating them. Only fall back to
  // splitting on # when there are no ## headers at all.
  const splitLevel = level2Count > 0 ? 2 : 1;
  const splitPoints = headerLines.filter((l) => l.level === splitLevel);

  const sections = [];
  let position = 0;

  // Content before the first split-level header.
  if (splitPoints[0].i > 0) {
    const preamble = cleanText(lines.slice(0, splitPoints[0].i).join("\n"));
    if (preamble) {
      const { categoryTags, core } = detectCategoryTagsAndCore("Overview");
      sections.push({ title: "Overview", content: preamble, categoryTags, core, position: position++ });
    }
  }

  for (let s = 0; s < splitPoints.length; s++) {
    const start = splitPoints[s].i;
    const end = s + 1 < splitPoints.length ? splitPoints[s + 1].i : lines.length;
    const title = headerTitle(splitPoints[s].line);
    const content = cleanText(lines.slice(start + 1, end).join("\n"));
    if (!content) continue; // skip empty headers
    const { categoryTags, core } = detectCategoryTagsAndCore(title);
    sections.push({ title, content, categoryTags, core, position: position++ });
  }

  return sections;
}

module.exports = { parseLoreDocument, detectCategoryTagsAndCore, ALL_CATEGORIES };
