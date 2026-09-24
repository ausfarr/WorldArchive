// lib/loreDateExtraction.js
//
// Bug batch 1, Phase 4 (session_addendum_bug_batch_1.md): "Find dates in
// lore" -- AI extraction of dated events from the world's lore prose,
// reviewed by the DM before anything reaches the Timeline.
//
// Austin's decisions (asked in-session):
//   - Cost: one full generation (enforceGenerationCap), refunded on failure.
//   - Vague dates allowed but MARKED: world_date carries
//     precision ('day'|'month'|'year') + approximate, rendered "c. Year 512";
//     year/month-precision events stay off the Calendar grid (which needs a
//     real day). Placeholder monthIndex 0 / day 1 fill the unused parts so
//     every stored world_date still validates and sorts like any other.
//   - Review: Timeline page checklist; nothing is written until the DM
//     confirms selected proposals.
//
// "Model proposes, code validates" (same split as lib/calendar.js):
//   1. Every date must pass validateWorldDate against the current calendar
//      (month/day ranges, ±year bounds around current_date).
//   2. The supporting quote must appear VERBATIM (whitespace/case/quote-
//      mark normalized) in the lore that was sent. A proposal whose quote
//      can't be found is dropped -- that's the hallucination guard, since
//      the model can otherwise produce a plausible-sounding event the lore
//      never mentions.
//   3. Possible duplicates of existing Timeline events (any source type --
//      structured entry dates, chronicles, earlier lore extractions) are
//      FLAGGED, not dropped, and start unticked in the checklist: the DM
//      is the judge of "is this the same founding?", code only offers a
//      strong hint.
//   4. /confirm re-validates everything the browser sends back (never
//      trusts the client's copy) and dedupes against existing lore_date
//      events by key, under a per-world lock.
//
// Scope note: only lore_sections prose is read. Entry prose (a faction's
// Origin text, an NPC's backstory) is not scanned here -- those entries'
// structured date fields already reach the Timeline via
// lib/timelineEvents.js, and scanning every entry's body would multiply
// cost for mostly-duplicate results.

const { listLoreSections } = require("./loreRepo");
const { listTimelineEvents, createTimelineEvent, TimelineSourceTypeNotAllowedError } = require("./timelineRepo");
const { validateWorldDate, formatCalendarContextForPrompt, formatWorldDate } = require("./calendar");
const { callClaudeExpectingJson, buildCacheableSystemPrompt } = require("./claude");
const { buildLoreDateExtractionPrompt } = require("../prompts/loreDateExtractionPrompt");
const { withLock } = require("./asyncLock");

// Bounds prompt cost as lore grows (~15k tokens). Sections past the cap
// are left out whole (never cut mid-section) and the response says so.
const MAX_LORE_CHARS = 60000;
const MAX_PROPOSALS = 40;
const PRECISIONS = new Set(["day", "month", "year"]);

class MissingLoreDateMigrationError extends Error {
  constructor() {
    super("Saving lore dates needs database migration 039 (timeline_events 'lore_date' source type), which hasn't been run yet.");
    this.code = "migration_039_required";
  }
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLoreText(sections) {
  const parts = [];
  let used = 0;
  let truncated = false;
  for (const s of sections) {
    const block = `## ${s.title}\n${s.content || ""}`;
    if (used + block.length > MAX_LORE_CHARS && parts.length) { truncated = true; break; }
    parts.push(block);
    used += block.length;
  }
  return { loreText: parts.join("\n\n---\n\n"), truncated, sectionsUsed: parts.length };
}

// Turns one raw model proposal into { summary, worldDate, sectionTitle,
// quote } or null. `loreNorm` is the normalized lore text for the quote
// check; pass null to skip it (the /confirm re-validation, where the quote
// was already verified at extraction time and isn't load-bearing).
function normalizeProposal(p, calendarConfig, loreNorm) {
  if (!p || typeof p !== "object") return null;
  const summary = typeof p.summary === "string" ? p.summary.trim().replace(/\s+/g, " ") : "";
  if (summary.length < 3 || summary.length > 200) return null;
  const precision = PRECISIONS.has(p.precision) ? p.precision : null;
  if (!precision || !Number.isInteger(p.year)) return null;

  let monthIndex = 0;
  let day = 1;
  if (precision === "month" || precision === "day") {
    if (!Number.isInteger(p.monthIndex)) return null;
    monthIndex = p.monthIndex;
  }
  if (precision === "day") {
    if (!Number.isInteger(p.day)) return null;
    day = p.day;
  }
  const approximate = p.approximate === true || precision !== "day";
  const worldDate = { year: p.year, monthIndex, day, precision, approximate };
  if (!validateWorldDate(worldDate, calendarConfig).valid) return null;

  const quote = typeof p.quote === "string" ? p.quote.trim() : "";
  if (loreNorm !== null) {
    const q = normalizeText(quote);
    if (q.length < 8 || !loreNorm.includes(q)) return null;
  }
  return {
    summary,
    worldDate,
    sectionTitle: typeof p.sectionTitle === "string" ? p.sectionTitle.trim().slice(0, 200) : "",
    quote: quote.slice(0, 300)
  };
}

const STOPWORDS = new Set(["the", "and", "of", "a", "an", "in", "on", "at", "to", "was", "were", "is", "by", "for", "from", "with", "its", "their", "his", "her"]);
function significantWords(s) {
  return new Set(normalizeText(s).replace(/[^a-z0-9' ]/g, " ").split(" ").filter((w) => w.length >= 3 && !STOPWORDS.has(w)));
}

function datesCompatible(a, b) {
  if (!a || !b || a.year !== b.year) return false;
  const aDay = !a.precision || a.precision === "day";
  const bDay = !b.precision || b.precision === "day";
  const aMonth = aDay || a.precision === "month";
  const bMonth = bDay || b.precision === "month";
  if (aMonth && bMonth && a.monthIndex !== b.monthIndex) return false;
  if (aDay && bDay && a.day !== b.day) return false;
  return true;
}

// Heuristic duplicate check against one existing event: same (compatible)
// date AND overlapping wording -- either half the significant words shared,
// or the existing event's subject (the part after "Founded: " etc. on an
// entry_date event) named in the proposal. Returns the existing summary or null.
function duplicateOf(proposal, existingEvents) {
  const pWords = significantWords(proposal.summary);
  const pNorm = normalizeText(proposal.summary);
  for (const e of existingEvents) {
    if (!datesCompatible(proposal.worldDate, e.worldDate)) continue;
    const eWords = significantWords(e.summary);
    let shared = 0;
    eWords.forEach((w) => { if (pWords.has(w)) shared++; });
    const overlap = shared / Math.max(1, Math.min(pWords.size, eWords.size));
    const colon = (e.summary || "").indexOf(": ");
    const subject = colon > 0 ? normalizeText(e.summary.slice(colon + 2)) : "";
    if (overlap >= 0.5 || (subject.length >= 4 && pNorm.includes(subject))) return e.summary;
  }
  return null;
}

function loreDateKey(summary, worldDate) {
  const d = worldDate || {};
  return `lore|${normalizeText(summary)}|${d.year}-${d.monthIndex}-${d.day}-${d.precision || "day"}`;
}

function formatExistingForPrompt(events, calendarConfig) {
  return events
    .filter((e) => e.worldDate)
    .slice(0, 200)
    .map((e) => `- ${formatWorldDate(e.worldDate, calendarConfig)}: ${e.summary}`)
    .join("\n");
}

// The AI call. Returns { proposals, truncated, droppedCount }. Callers
// check for a calendar and lore first (routes/timeline.js) so a doomed
// request is never charged.
async function extractLoreDateProposals(worldId, calendarConfig, sections) {
  const { loreText, truncated } = buildLoreText(sections);
  const existing = await listTimelineEvents(worldId);
  const { staticText, dynamicText } = buildLoreDateExtractionPrompt({
    calendarContext: formatCalendarContextForPrompt(calendarConfig),
    existingTimelineText: formatExistingForPrompt(existing, calendarConfig),
    loreText
  });

  const result = await callClaudeExpectingJson({
    systemPrompt: buildCacheableSystemPrompt(staticText, dynamicText),
    userMessage: "Extract the dated events now.",
    maxTokens: 4000,
    requiredKeys: ["events"]
  });

  const rawEvents = Array.isArray(result.events) ? result.events.slice(0, MAX_PROPOSALS) : [];
  const loreNorm = normalizeText(loreText);
  const seen = new Set();
  const proposals = [];
  for (const raw of rawEvents) {
    const p = normalizeProposal(raw, calendarConfig, loreNorm);
    if (!p) continue;
    const key = loreDateKey(p.summary, p.worldDate);
    if (seen.has(key)) continue;
    seen.add(key);
    const dup = duplicateOf(p, existing);
    proposals.push({
      ...p,
      dateLabel: formatWorldDate(p.worldDate, calendarConfig),
      possibleDuplicateOf: dup
    });
  }
  proposals.sort((a, b) => (a.worldDate.year - b.worldDate.year) || (a.worldDate.monthIndex - b.worldDate.monthIndex) || (a.worldDate.day - b.worldDate.day));
  return { proposals, truncated, droppedCount: rawEvents.length - proposals.length };
}

// Writes the DM-selected proposals. Each is re-validated (never trusting
// the browser's copy) and deduped against existing lore_date events.
// Returns { created, skippedDuplicate, skippedInvalid }.
async function confirmLoreDateEvents(worldId, events, calendarConfig) {
  const counts = { created: 0, skippedDuplicate: 0, skippedInvalid: 0 };
  const list = Array.isArray(events) ? events.slice(0, MAX_PROPOSALS) : [];
  await withLock(`timeline-lore-date:${worldId}`, async () => {
    const existingKeys = new Set(
      (await listTimelineEvents(worldId)).filter((e) => e.sourceType === "lore_date").map((e) => loreDateKey(e.summary, e.worldDate))
    );
    for (const raw of list) {
      const wd = (raw && raw.worldDate) || {};
      const p = normalizeProposal({
        summary: raw && raw.summary,
        year: wd.year,
        monthIndex: wd.precision === "year" ? null : wd.monthIndex,
        day: wd.precision === "day" ? wd.day : null,
        precision: wd.precision,
        approximate: wd.approximate,
        sectionTitle: raw && raw.sectionTitle
      }, calendarConfig, null);
      if (!p) { counts.skippedInvalid++; continue; }
      const key = loreDateKey(p.summary, p.worldDate);
      if (existingKeys.has(key)) { counts.skippedDuplicate++; continue; }
      try {
        await createTimelineEvent(worldId, {
          sourceType: "lore_date",
          sourceId: p.sectionTitle ? `lore:${p.sectionTitle}` : "lore",
          sourceCategory: "lore",
          sessionNumber: null,
          worldDate: p.worldDate,
          summary: p.summary,
          linkedEntryIds: [],
          linkedFactionIds: []
        });
      } catch (err) {
        if (err instanceof TimelineSourceTypeNotAllowedError) throw new MissingLoreDateMigrationError();
        throw err;
      }
      existingKeys.add(key);
      counts.created++;
    }
  });
  return counts;
}

module.exports = {
  extractLoreDateProposals,
  confirmLoreDateEvents,
  listLoreSections,
  normalizeProposal,
  duplicateOf,
  buildLoreText,
  MissingLoreDateMigrationError,
  MAX_LORE_CHARS
};
