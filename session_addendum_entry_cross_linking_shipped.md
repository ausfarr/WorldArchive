# Session Addendum — Entry Cross-Linking (Phases 0–4)

Backfilled documentation for a feature that shipped across two merged PRs
(#28, #29) with no CHANGELOG entry or addendum written at the time — same
situation R5 was in before R6 backfilled it (see
`session_addendum_r5_srd_ingestion_and_import_fixes.md`). Reconstructed
from the real commit history (`dde50e3`, `58a9813`, `d36ad5b`, `f081e96`,
`cf0c2fa`) and `phase0_entry_linking_audit.md`, which is the authoritative
design doc for this feature and is not duplicated here — read that file
first for the full field-by-field audit and the "why" behind each design
call. This addendum also covers this session's own contribution: the
regression tests the feature never had, and closing two small stale-doc
loose ends the Phase 0 audit flagged but didn't fix.

## What the feature does

Several entry fields across the app point at other entries by name, then
optionally by id — a 5e spell's `classes: ["Wizard", "Sorcerer"]`, an
NPC's `relationships[].toId`, a Location's `notableNpcs[].toId`, a Log's
`locationId`, a Faction's `relationships[].faction`. Before this feature,
these fields only ever got filled in if the model happened to resolve
them at generation time — a spell generated before its class existed, or
an NPC generated before an ally NPC existed, stayed permanently
unresolved. Entry cross-linking closes that gap with a small,
deterministic resolver — no AI calls, exact-normalized-name-match only
(never fuzzy, never substring), so a match can never misfire; the only
failure mode is a real match not being found yet.

Two reference "types," carried over verbatim from the Phase 0 design:

- **Category A** ("rules/category facts") — a field that names something
  by category independent of what's archived (a spell's class list). The
  model keeps generating these freely; an unresolved name gets a
  "not yet archived" inline span in the rendered body plus a **ghost
  placeholder** — a `locked: true` stub row with no content, just enough
  to make the name clickable and fillable later.
- **Category B** ("narrative world-facts") — relationships, `notableNpcs`,
  `locationId`, faction relationships. These were already grounded-only
  by deliberate prompt design (the model never invents a link, leaves
  null if nothing real fits) — this feature only fixes the *backfill*
  gap for them, generation-time behavior is untouched.

## Architecture

- **`lib/entryLinkRegistry.js`** — declarative field registry, per
  ruleset + category: which fields point where, what shape they're in
  (`ID_POINTER`, `ID_POINTER_ARRAY`, `NAME_ONLY_ARRAY`), and how to match
  them. Four shared categories (npcs, factions, logs, locations — no
  `lib/rulesets/<id>/` variant exists for any of them) apply to every
  ruleset including Echoes automatically; five ruleset-varying categories
  (enemies, classes, items, spells, survivors) are scoped to 5e and
  generic only, per the original task brief — Echoes' own three
  equivalent gaps (`classTemplate.js`'s `evolutionEvent.locationId`,
  `itemTemplate.js`'s `foundAtLocationId`, `survivorTemplate.js`'s
  `relationships[].toId`) were deliberately left out, flagged in the
  registry's own comments as a small, isolated follow-up if ever wanted.
- **`lib/entryLinker.js`** — four functions:
  - `resolveReferencesForEntry(worldId, category, raw)` — forward
    resolution. Builds a normalized-name → row lookup per target
    category the entry references (cached per call), patches whatever
    now matches, returns unresolved Category A names for the caller to
    ghost.
  - `backfillReferencesFromNewEntry(worldId, newCategory, newEntry)` —
    backward resolution. On a brand-new entry's save, scans every OTHER
    entry in the world for a still-unresolved reference naming it,
    patches and **re-bakes** each hit (see below), and cleans up any
    stale ghost placeholder whose slug didn't happen to collide with the
    new entry's real slug.
  - `ensureGhostPlaceholder(worldId, targetCategory, name)` — create-if-
    missing `locked: true` stub, keyed by the same `slugify()` every
    `*Template.js` already uses for entry ids, so a later real entry with
    that name naturally collides and overwrites the ghost via the
    `entries_unique_slug` unique index (no separate cleanup needed for
    the common case — only the "different slug, same normalized name"
    edge case needs the explicit sweep above).
  - `normalizeNameForMatch(name)` — lowercase, strip everything but
    `[a-z0-9]`. The one and only matching function; every field type
    routes through it.
- **Re-baking, not a bespoke JSON patch.** A backward-resolved entry gets
  its `raw_json` *and* `body_html` updated together by calling that
  category's real `save*Entry()` function again with the patched content
  — `lib/fileWriter.js`'s functions for the four shared categories,
  `lib/rulesets/index.js`'s new `repo` slot (added to each ruleset-
  varying category's registry entry) for the other five. This was a
  deliberate Phase 0 finding: `entriesRepo.js`'s `patchEntryMeta()` only
  touches the `raw_json` column by design, never `body_html`, so reusing
  it here would silently desync the rendered page from the patched data.
  Reusing the real save functions instead means a re-bake behaves
  identically to any other save — faction re-bakes even recompute the
  Roundup and sync reciprocal relationships, matching
  `routes/confirmEntry.js`'s faction branch exactly.
- **Wired into every save path** (`routes/confirmEntry.js`,
  `routes/generate*.js` for the direct-save "new"/"fill" branches,
  `lib/campaignEntryGenerators.js`) — every entry, regardless of how it
  was created, gets both a forward resolve pass at save time and triggers
  a backward sweep for anything that was waiting on it.

## What's genuinely new this session (this addendum's own contribution)

1. **`scripts/testEntryLinker.js`** — the resolver had zero regression
   coverage before this. Uses the shared `scripts/lib/fakeSupabase.js`
   in-memory fake (same one `testPipeline.js`/`testEnemyPipeline.js` use)
   to exercise, offline: `normalizeNameForMatch`'s edge cases; forward
   resolution for `NAME_ONLY_ARRAY` (the spell/classes flagship example,
   both the archived-match and still-unresolved-plus-ghost-reported
   cases), an already-resolved field being left alone (never re-matched,
   never re-ghosted); forward resolution for `ID_POINTER_ARRAY` with a
   dynamic target category (npc relationships) including the "no match
   found, never invents a link" case; the faction self-referential
   bare-name-label case; backward resolution actually patching AND
   re-baking (`body_html` recomputed, not left stale) via the real
   `save5eSpellEntry` path; backward resolution correctly skipping an
   already-resolved row; stale-ghost cleanup when a ghost's slug doesn't
   match the real entry's slug; and `ensureGhostPlaceholder`'s
   create-then-idempotent-second-call behavior. All 24 checks pass. Run
   with `node scripts/testEntryLinker.js`.

   Deliberately never exercises a **classes** rebake: `lib/rulesets/
   index.js`'s classes `repo` slot calls `lib/fileWriter.js`'s
   `getPortraitUrl()`, which calls `supabase.storage.from(...).getPublicUrl()`
   — outside `fakeSupabase.js`'s query-builder-only surface (it has no
   `.storage` mock). Spells — the OTHER flagship example, and the side
   that actually gets rebaked in the spell↔class backward-resolution
   test — have no portrait at all (`spellRepo.js`'s own comment), so the
   test suite gets real coverage of `getRebakeFn`'s ruleset-registry
   dispatch without needing a storage fake. If a future session wants
   direct classes-rebake coverage, `fakeSupabase.js` would need a
   `.storage.from().getPublicUrl()` stub added to its fake surface first.

2. **Fixed a stale line in `world_forge_scope.md`** — it claimed
   `entries_category_check` still didn't allow `'spells'`; confirmed via
   `migrations/024_spells_category_check.sql` that this was fixed in R6
   and the doc just never caught up. Flagged (not silently rewritten,
   per the audit's own "if unsure, flag rather than guess" convention)
   with a note pointing at the fixing migration and this addendum.

3. **This CHANGELOG entry and this addendum**, backfilling Phases 0–3
   (design + resolver + registry + wiring + ghost-row rendering) and
   Phase 4 (the backfill script) from the real commit history, since
   neither was written at the time they shipped.

## What's still genuinely incomplete

**Phase 4's production backfill has never run for real.** The prior
session wrote and fake-tested `scripts/backfillEntryLinks.js` (a one-off,
idempotent, forward-only sweep over every existing world/entry, reusing
`resolveReferencesForEntry` — deliberately NOT calling
`backfillReferencesFromNewEntry` per-entry too, since a single forward
pass over every entry already converges to the same fixed point a full
backward sweep would, without the O(entries²) cost of rescanning the
whole world once per entry) but paused before running it against
production: this sandbox's network policy blocks the real Supabase host
outright. **Reconfirmed this session** — `curl` to the project's Supabase
host through the egress proxy returns a 403 CONNECT tunnel failure, same
finding R6 hit for the same reason (see
`session_addendum_r6_srd_content_backfill.md`). Per Phase 0's own
finding #6, this backfill's real-world impact is small right now (every
sampled Category-B field was null on every real entry across every world
in the project at audit time — early/test worlds without much
cross-referenceable content yet) but only grows as worlds accumulate more
entries; whoever has real DB network access next should either run
`node scripts/backfillEntryLinks.js --dry-run` first to see the real
diff, or use the hybrid approach the paused commit message sketched
(fetch via an MCP tool with real Supabase access, run the tested code
locally, write back via that same tool).

**Two follow-ups noted in Phase 0 but never picked up, still open:**
Echoes' own three equivalent reference-field gaps (see above — a small,
isolated addition if ever wanted), and there's no way from within this
sandbox to verify the resolver's `getRuleset()`/`getCategory()` calls
against real per-world data beyond what Phase 0's live production audit
already sampled.
