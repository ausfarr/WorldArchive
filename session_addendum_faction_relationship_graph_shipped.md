# Faction relationship graph — shipped

## Why

`claude_marketing/COMPETITOR_WATCH.md` (this repo's automated daily
competitor-analysis log) flagged a visual entity-relationship graph as a
recurring competitive pattern across every resourced competitor tracked:
CharGen and Reality Forge both market one (2026-08-19/08-27 entries), and
Grimoire (ttrpg.bot) shipped a full multi-projection knowledge graph as of
2026-08-30, making it "a 3-for-3 pattern across every resourced competitor
in this space" per that entry, and — same entry — "Chronicled already has
the underlying relationship data ... the gap is presentation only."

That's true for one category specifically: factions. `lib/entryLinkRegistry.js`'s
`SHARED_FIELDS.factions` entry is the one place in the schema where a
relationship is already structured data (`{ faction, toId, stance, why }`,
resolved by `lib/entryLinker.js`), not free prose the way an NPC's
relationships or a location's `notableNpcs` read. Every other category's
"relationships" are narrative sentences inside `bodyHtml` — turning those
into graph nodes would mean parsing prose, an actual project. Factions
don't need that: the data to draw a graph from is already sitting in
`faction.relationships[]`.

## What shipped

`lib/factionTemplate.js`:
- `stanceGraphColor(stance)` — buckets the model's free-text `stance` field
  (no fixed enum — see `prompts/factionContentPrompt.js`'s schema comment,
  `stance` is just `"e.g. Rivalry, Uneasy alliance, Open war, Trade
  partner"`) into one of four edge colors via keyword matching. Order
  matters: the rivalry/tension bucket is checked *before* the
  alliance/trade bucket, because "uneasy alliance" contains the substring
  "allian" and would otherwise read as a clean partnership instead of the
  hedged relationship it actually is.
- `truncateGraphLabel(name, max)` — SVG text doesn't wrap, so a long
  faction name would run off its node or collide with a neighbor in the
  radial layout. Truncated to 16 chars with an ellipsis; the full name is
  still available via the node's `<title>` tooltip and the untouched
  `rel-table` right below the graph, so nothing is actually lost.
- `buildRelationshipGraphSvg(faction)` — the graph itself. Center node =
  this faction (filled with `var(--fac-color, ...)`, the same per-entry
  accent-color CSS variable `render.js` already sets, so the graph matches
  each faction's own accent instead of one fixed color); satellite nodes =
  each relationship, placed radially (`2π·i/n`, capped at `MAX_GRAPH_NODES
  = 12` — a safety margin against radial crowding, not a real-world limit,
  since a world's actual faction count is small by design, per CLAUDE.md's
  wizard-driven faction step). A satellite with a resolved `toId` is
  wrapped in `<a href="dossier.html?category=factions&id=...">`, same
  "link when present else plain text" convention the existing `rel-table`
  already used. Returns `""` (not an empty `<svg>` shell) when there are no
  relationships at all, so a faction with none renders exactly as before.
- Wired into `buildFactionBodyHtml()` immediately above the existing
  `<table class="rel-table">` — the table stays, unchanged, since it's the
  only place `why` (a full sentence per relationship) is shown; the graph
  is a compact visual index into it, not a replacement.

`archive/css/style.css` — a `.rel-graph` wrapper (centers/bounds the SVG,
matches the page's max content width) and `.rel-graph-label`/
`.rel-graph-label-center` classes the SVG's own `<text>` elements reference
by class (colors/fonts come from the stylesheet so they stay consistent
with the rest of the dossier page rather than being hardcoded per-node).
Everything color-specific inside the SVG itself (edge stroke, center fill)
has to be an inline attribute, not a stylesheet rule — `--fac-color` only
exists as an inline `style` on the `.sheet` element `render.js` sets per
entry, and CSS custom properties inherit into inline SVG fine, so
`fill="var(--fac-color, ...)"` on the `<circle>` works the same way as
every other CSS-var faction-accent usage already in this file.

## Why this piggybacks PDF export for free

`lib/pdfExport.js` renders `body_html` (the same field this graph is baked
into) through headless Chromium for every export scope. Since the SVG is
generated server-side at faction-save time (same three call sites as
before: `lib/fileWriter.js#saveFactionEntry`, `routes/generateFaction.js`'s
regenerate preview, and the legacy `buildFactionEntryFileContent`), it's
already part of `body_html` by the time any export runs — no PDF-specific
code needed, unlike some past category-coverage gaps in that file (see the
Unreleased section's PDF fixes just above this entry in `CHANGELOG.md`).

## Testing

New `scripts/testFactionRelationshipGraph.js` — a pure-function unit test
(`buildRelationshipGraphSvg`/`buildFactionBodyHtml` only ever touch the
plain object passed in, no DB or API calls anywhere in this feature) —
covers:
- No relationships → `""`, not an empty `<svg>` shell; the plain table
  still renders on its own.
- One relationship → exactly one edge, one satellite node + one center
  node, no link wrapper when `toId` is unresolved.
- Stance-color bucketing across the actual free-text spectrum the model
  writes, including the "uneasy alliance" ordering case above.
- A resolved `toId` produces a `dossier.html?category=factions&id=...`
  link.
- HTML/XML injection in a model-authored faction name, stance, or `why`
  text is escaped, not passed through raw — **this caught a real bug
  during review**: the center node's label used `truncateGraphLabel(faction.name)`
  directly without an `escapeHtml()` wrap (every other text position in the
  function was correctly escaped), which would have let an unescaped
  faction name break the SVG markup. Fixed before this shipped; the test
  stays in the suite so a future edit to this function can't reintroduce
  it silently.
- The 12-node cap: 13 relationships render exactly 12 edges/nodes plus a
  singular/plural-correct overflow note, while the plain `rel-table` below
  still lists all 13 regardless of the graph's cap.

Also ran the full existing offline suite (`testPipeline.js`,
`testEnemyPipeline.js`, `testEntryLinker.js`, `testCampaignStructureRaces.js`,
`testEntryDriftSuggestions.js`, `testSessionAssembly.js`,
`testPdfExportCategoryCoverage.js`, `testPdfExportLockedFilter.js`,
`testEntryMetaPatchRace.js`) — all pass unchanged, confirming nothing about
faction generation, save, regenerate-preview, or export was disturbed.
`npm start` (with dummy env vars) boots cleanly and serves `HTTP 200`.

**Not verified against a live browser/world this session** (no live
Supabase-backed world reachable here) — worth a real click-through next
session, particularly confirming the radial layout reads well with a
realistic relationship count (most beta worlds have 3-5 factions per
CLAUDE.md's wizard-driven faction step) and that the hover `<title>`
tooltip actually surfaces on both desktop and touch devices.

## What this doesn't do (scoped out deliberately)

- No graph for NPCs, Locations, or any other category — their
  "relationships" are prose, not structured data (see "Why" above); adding
  that would mean either constraining those prompts' schemas to structured
  fields (a real prompt/schema change, out of scope for what was a
  presentation-layer feature) or parsing free text (unreliable). A
  world-wide, multi-category knowledge-graph view (what Grimoire actually
  ships) is a much bigger feature and not what this addendum claims to be.
- No interactivity beyond the existing dossier-link navigation (no
  drag/zoom/pan, no client-side JS at all) — it's a static SVG baked into
  `body_html` server-side, which is also exactly why it works in PDF export
  for free. A future version could add client-side interactivity, but that
  would mean it no longer renders in a PDF without separate handling.
