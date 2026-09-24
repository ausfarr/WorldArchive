// lib/timelineDecorate.js
//
// Bug batch 1 audit, items 6-7 (session_addendum_bug_batch_1.md): Timeline
// events are an append-only historical record, so their stored text is
// never rewritten -- but what the Timeline DISPLAYS should follow the
// world as it is now:
//   - entry_date summaries ("Founded: The Iron Pact") are rebuilt from the
//     entry's CURRENT name, so a rename shows up immediately;
//   - every linked entry gets its real name (the page used to show ids);
//   - a source or linked entry that has since been deleted is flagged,
//     and the page renders it as plain text instead of a 404 link.
// Read-time only: one listEntries() per referenced category, nothing
// written. Used by GET /timeline-events (Timeline + Calendar pages).

const { listEntries } = require("./entriesRepo");

async function decorateTimelineEvents(worldId, events) {
  const categories = new Set();
  for (const e of events) {
    if (e.sourceCategory && e.sourceCategory !== "lore") categories.add(e.sourceCategory);
    (e.linkedEntryIds || []).forEach((ref) => ref && ref.category && categories.add(ref.category));
    if ((e.linkedFactionIds || []).length) categories.add("factions");
  }
  const names = new Map(); // "category|id" -> name
  const factionKeys = new Map(); // faction matching key -> { id, name }
  await Promise.all([...categories].map(async (cat) => {
    let rows = [];
    try {
      rows = await listEntries(worldId, cat);
    } catch (err) {
      console.error(`Timeline decorate: listing ${cat} failed:`, err && err.message);
      return;
    }
    for (const r of rows) {
      names.set(`${cat}|${r.id}`, r.name);
      if (cat === "factions") factionKeys.set(r.faction || r.id, { id: r.id, name: r.name });
    }
  }));
  const loaded = (cat) => categories.has(cat);

  return events.map((e) => {
    const out = { ...e };
    const hasEntrySource = e.sourceCategory && e.sourceCategory !== "lore";
    if (hasEntrySource && loaded(e.sourceCategory)) {
      const liveName = names.get(`${e.sourceCategory}|${e.sourceId}`);
      out.sourceDeleted = liveName === undefined;
      if (e.sourceType === "entry_date" && liveName) {
        const colon = (e.summary || "").indexOf(": ");
        if (colon > 0) out.summary = `${e.summary.slice(0, colon)}: ${liveName}`;
      }
    }
    out.linkedEntries = (e.linkedEntryIds || []).filter((ref) => ref && ref.entryId).map((ref) => {
      const name = names.get(`${ref.category}|${ref.entryId}`);
      return { category: ref.category, entryId: ref.entryId, name: name || null, deleted: loaded(ref.category) && name === undefined };
    });
    out.linkedFactions = (e.linkedFactionIds || []).map((key) => {
      const f = factionKeys.get(key);
      return { key, id: f ? f.id : key, name: f ? f.name : null, deleted: !f };
    });
    return out;
  });
}

module.exports = { decorateTimelineEvents };
