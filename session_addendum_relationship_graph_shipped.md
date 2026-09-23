# Session addendum: dossier "Relationships" graph panel

## Why

`claude_marketing/COMPETITOR_WATCH.md` has flagged a visual "entity
relationship graph" as a competitive gap since 2026-08-27, and re-flagged
it on 2026-08-30 when a *third* separately-resourced competitor
(Grimoire/ttrpg.bot, after CharGen and Reality Forge) shipped one —
turning it from a single competitor's flourish into a 3-for-3 pattern
across every resourced competitor in this space. Both entries make the
same observation: Chronicled already has the underlying relationship
data (every cross-category reference a generation makes is resolved and
stored via `lib/entryLinker.js`/`lib/entryLinkRegistry.js`), it's just
never been *shown* — faction Roundups, NPC relationships, notable-NPC
lists, etc. all render as prose lists on their own dossier pages, with
no way to see an entry's whole neighborhood at a glance.

This ships the smallest real slice of that: a one-hop relationship graph
on a single entry's own dossier page. A whole-world graph (every entry,
every connection, laid out at once) is a materially bigger scope — real
force-directed/hierarchical layout, not a radial one — and is
deliberately left for a future session if this smaller version proves
useful.

## What changed

**Backend — `lib/relationshipGraph.js` (new), `buildEntryGraph(worldId, category, entryId)`:**

Returns `{ center, nodes, edges }` for one entry:

- **Forward edges** — walks `lib/entryLinkRegistry.js#getLinkFields()`
  for the entry's own category (the exact same field descriptors
  `lib/entryLinker.js#resolveReferencesForEntry()` uses at generation
  time) and resolves every already-set id field to a real node (name,
  category, locked state) via `entriesRepo.getEntry()`. A dangling id
  (target deleted since the link was made) is silently skipped, not
  thrown.
- **Backward edges** — mirrors `entryLinker.js#backfillReferencesFromNewEntry()`'s
  per-category field-relevance filter, but checks an *already-resolved*
  id instead of matching an unresolved name (that function's job is
  finding NEW matches; this one is reading what's already there).
  Deliberately does **not** skip `noBackfill` fields — that flag only
  disables backward name-matching (since those fields, e.g. a Survivor's
  class, are always resolved at generation time, not backfilled), it
  doesn't mean the id relationship isn't real. A Class's graph should
  still show every Survivor who plays it.
- **Edge labels** — an item's own `type` (npc/survivor relationships) or
  `stance` (faction relationships) field wins when present; otherwise a
  fixed per-field default (`DEFAULT_FIELD_LABELS`, e.g. `locations →
  notableNpcs` = "notable at"). Every field the registry currently
  declares has an entry; a lookup miss falls back to "related to" but
  should never actually happen.

New route: `GET /api/entries/:category/:id/graph` (`routes/entries.js`),
same auth/tenant-scoping as every other `/api/entries/*` route (goes
through the global `resolveTenant` middleware, no special-casing here).

**Frontend — `archive/js/render.js#renderRelationshipGraph()`, wired into
`renderDossier()`:**

Fetches the graph and renders a hand-rolled SVG: the entry in the
center, up to 20 linked entries arranged in a ring around it (a
truncation note shows if there are more), each a small dot with its
category above and name below (not text-inside-circle — a circle wide
enough to fit "Dockside Warrens" at a readable size would dwarf the
graph once there are more than a handful of nodes; labels living outside
the dot keep every node the same visual weight regardless of name
length, the same tradeoff `archive/js/mapLayout.js`'s location pins
already make on the world map). Each node is a real `<a href="dossier.html?...">`
link. A locked/ghost target (referenced but not yet generated) renders
with a dashed ring via `.graph-node-locked`. No charting library — matches
this codebase's no-build-step, no-new-dependency convention; the world
map (`mapLayout.js`) and calendar page both already do their own
from-scratch layout math rather than pulling in a library for something
this small.

Fire-and-forget, same pattern as `renderFactionBanner()` — a slow/failed
fetch just leaves the panel empty (or, if the entry genuinely has no
links, renders nothing at all rather than an empty box), never blocks
the rest of the dossier page.

New CSS in `archive/css/style.css` (`.graph-*` classes, `.relationship-graph`),
using the same theme variables (`--fac-color`, `--neon-primary`, `--ink*`,
`--font-mono`/`--font-display`) every other panel already uses, so it
inherits each faction's accent color automatically via the existing
`--fac-color-override` mechanism `renderDossier()` already sets.

`archive/dossier.html` gets one new empty slot,
`#relationship-graph-zone`, between the dungeon-map zone and the export
zone.

`v1.3` cache-version bump (`node scripts/bump-cache-version.js v1.3`) —
UI-affecting change (new JS function, new CSS, new HTML slot).

## Testing

`node scripts/testRelationshipGraph.js` (new, offline, no real
credentials — same `scripts/lib/fakeSupabase.js` in-memory fake
`testEntryLinker.js`/`testPipeline.js` already share) covers: a missing
entry returns `null` rather than throwing; forward `ID_POINTER_ARRAY`
(npc relationships, dynamic target, `item.type` as label) and
`ID_POINTER` (log → location, default label) edges; a dangling id is
skipped without crashing; a backward edge surfaces correctly (a log's
own `locationId` shows up as an incoming edge on that location's graph);
a locked/ghost row is excluded from the backward scan; faction
self-referential relationships use `stance` as the label, both forward
and via the backward scan on the *other* faction (which declares no
relationships of its own); a `noBackfill` field (generic ruleset's
`survivor.classId`) still produces a backward edge on the Class's graph;
and two array items pointing at the same target with the same label
collapse into a single edge, not a duplicate.

Full existing suite re-run after this change, all still pass:
`testEntryLinker.js`, `testPipeline.js`, `testEnemyPipeline.js`,
`testEntryDriftSuggestions.js`, `testCampaignStructureRaces.js`,
`testSessionAssembly.js`, `testPdfExportCategoryCoverage.js`,
`testPdfExportLockedFilter.js`, `testEntryMetaPatchRace.js`.

Server boot verified (`npm start`, no crash, `GET /version.js` returns
`v1.3`, `GET /api/entries/npcs` correctly 401s with no auth token —
confirms the new route file changes didn't break Express's route
registration). Visual verification done via a throwaway local preview
harness (not committed) that loaded the real `css/style.css` +
`js/render.js` with a stubbed `authFetch()` returning a fixture graph,
screenshotted, then deleted — no real Supabase writes were made for this
verification pass.

## Known gaps / deliberately out of scope

- **Locked/ghost nodes link to a dossier page that can't render them.**
  `renderDossier()` has no locked-entry handling (`entriesRepo.js`'s
  `searchEntries()` comment already flags this as a pre-existing gap for
  the site-wide search dropdown) — clicking a dashed "not yet generated"
  node in the graph lands on the same blank "Entry not found" page a
  locked search result already does. Showing the node is still useful
  signal (something references this, but it isn't archived yet); fixing
  the click-through is a separate, pre-existing gap this session didn't
  take on.
- **Whole-world graph** — explicitly out of scope for this slice, per
  the "why" section above.
- **N+1 `getEntry()` calls per forward edge** — each resolved forward
  link does its own `getEntry()` round-trip (for the target's current
  name/locked state) rather than trusting the label already stored on
  the source entry. Deliberate: labels are only *sometimes* kept in sync
  (`ID_POINTER_ARRAY`'s forward-resolve re-syncs them, but nothing
  re-syncs them again later if the target is renamed), and the edge
  count per entry is small in practice (single digits to low teens), so
  correctness was judged worth more than the extra round-trips here.

## Follow-up (2026-09-23): stance-colored faction edges

Merged to `main` 2026-09-23 as part of the Sept 1-21 backlog reconciliation.
A second, independent implementation existed on `claude/hopeful-rubin-2p5a67`
(Sept 3): a faction-only graph server-rendered into the faction template
(`lib/factionTemplate.js#buildRelationshipGraphSvg`). This general version was
kept -- every category, real route, async client render -- and that branch was
closed as superseded. The one idea worth keeping from it was coloring faction
relationships by stance, now in `archive/js/render.js`:

- `STANCE_BUCKETS` / `stanceBucket()` bucket a free-text stance by keyword into
  hostile (`--neon-primary`), strained (amber), or allied (`--neon-cyan`);
  anything else keeps the generic edge style. Checked in that order, so hedged
  phrasing ("uneasy alliance") reads as strained, not friendly.
- Two false positives in the original regexes are fixed with whole-word
  matching: bare `war` matched "wary", bare `ally` matched "formally" /
  "mutually".
- Only faction<->faction lines are colored (the only edge kind whose label is a
  stance). When both factions list a stance toward each other the line takes
  the more severe one (`mostSevereStanceBucket()`).
- A small legend renders under the graph only when a colored line is drawn.
- `scripts/testRelationshipGraphStanceColors.js` pins the buckets, the two
  regex fixes, and the end-to-end render (loads the real render.js in a vm).

Known cosmetic follow-up, not addressed here: node names sit below each node,
so on nodes in the top half of the circle the edge line crosses the name text.

