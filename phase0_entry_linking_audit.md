# Phase 0 — Entry Cross-Linking: Audit Findings & Field Registry Design

Pre-implementation audit for the entry cross-linking feature (see the task
brief in this session). Everything below was verified against the real
production Supabase project (`urtixpjyhhqcpzypvbni`) and the current
codebase on `claude/chronicled-entry-cross-linking-tn7i9p` — not against
prior project docs, several of which turned out to be stale (noted below).
This is the design to review before Phase 1 writes any resolver code.

## Infra findings that change the Phase 1 plan

1. **Every linkable field lives at `raw_json.raw.<field>`, not
   `raw_json.<field>`.** Confirmed against a real saved 5e spell
   (`scrap-resonance`): the DB row's `raw_json` is a manifest-shaped
   wrapper (`id, name, subtitle, faction, tags, bodyHtml, footer,
   eyebrow, category, ...`) built by each category's `saveXEntry()`
   (`lib/fileWriter.js`, `lib/rulesets/<id>/<x>Repo.js`), and the actual
   generated content object the templates read (`classes`,
   `relationships`, `notableNpcs`, `locationId`, etc.) is nested one
   level down under `raw_json.raw`. `entriesRepo.getEntry()`'s
   `rowToFullEntry()` spreads `raw_json` onto the returned object, so
   `entry.raw` is what every resolver function should read/patch —
   never `entry.<field>` directly.

2. **`patchEntryMeta()` cannot be reused as-is for re-baking.** It only
   writes the `raw_json` column — by design (its own header comment:
   "shouldn't require... regenerating... Deep Lore"). The `body_html`
   column is separate and mirrored, and `patchEntryMeta` never touches
   it. Backward-resolution needs both updated atomically. **Phase 1
   doesn't need a new helper for this** — see finding 4 below, it's
   cleaner to reuse the existing per-category `saveXEntry()` functions,
   which already build `bodyHtml` and call `upsertEntry` (which writes
   both columns together).

3. **`upsertEntry()` hardcodes `locked: false`.** Confirmed by reading
   `entriesRepo.js:71`. `ensureGhostPlaceholder()` needs either a new
   optional `{ locked }` param on `upsertEntry`, or a small sibling
   function. **Fixture-tested against production** (disposable user/
   world, cleaned up immediately after): inserted a `locked: true` ghost
   row at `(world, "classes", "wizard")`, then ran the literal upsert
   Postgres statement `upsertEntry()` generates
   (`INSERT ... ON CONFLICT (world_id, category, entry_id) DO UPDATE
   SET ...`) with a real entry payload for the same slug. Result: **same
   row id, `locked` flips `true → false`, `body_html`/`raw_json` fully
   replaced, no duplicate.** The `entries_unique_slug` unique index
   (`world_id, category, entry_id`) backs this correctly — ghost
   collision-and-overwrite works exactly as the design assumes, for
   free, once ghost rows use the same `slugify()` real entries use.

4. **Reuse each category's real `saveXEntry()` for re-baking, don't
   reinvent it.** Every category+ruleset already has a small repo
   function (`lib/fileWriter.js`'s `saveNpcEntry`/`saveLogEntry`/etc.
   for shared categories, `lib/rulesets/5e/spellRepo.js`'s
   `save5eSpellEntry`, `lib/rulesets/generic/enemyRepo.js`'s
   `saveGenericEnemyEntry`, etc.) that takes the content object, calls
   the right `buildXBodyHtml` (correctly handling per-ruleset signature
   differences — generic templates need `genericSystem`, echoes enemies/
   survivors need `statLabels`, items need a recomputed
   `weaponSkillLabel`, faction needs `roundupRows`), and calls
   `upsertEntry`. `backfillReferencesFromNewEntry`'s re-bake step should
   call **that existing function** with the patched content, not
   duplicate its template-signature knowledge. This means Phase 1 needs
   a lookup from `(ruleset, category)` to the right save function —
   proposed: add a `repo` slot to `lib/rulesets/index.js`'s `REGISTRY`
   entries (same pattern as its existing `formulas`/`template`/`prompt`
   slots), rather than a bespoke dispatch table living only in
   `entryLinker.js`. Open question for you below.

5. **Ghost-row list rendering is already fully wired, not dead code.**
   `archive/js/render.js:2657`'s `buildEntryCardHtml()` already renders
   `.entry-card.locked` with a working "Fill In" button
   (`FILL_IN_ENDPOINTS[categoryPath]`) for every category except
   factions. It's simply never exercised today because no save path has
   ever written `locked: true`. **Phase 3 needs no new list-rendering
   work** — just confirm `FILL_IN_ENDPOINTS` covers whatever categories
   get ghost rows (need to check `spells`/`classes` are in that map) and
   that the dossier "not yet archived" span (new, Phase 3) links
   correctly once a ghost exists to fill.

6. **Real production data: every sampled Category-B field is currently
   null on every real entry that has one**, across every world in the
   project (5e spell `classes`, 5e npc `relationships`, 5e location
   `notableNpcs`, 5e log `locationId`; same story spot-checked on
   Echoes' 17 factions' `relationships`). This isn't a resolver bug —
   these are small/early test worlds without much cross-referenceable
   content yet — but it means Phase 4's backfill script and Phase 5's
   tests are the first real exercise these fields will get in
   production. Worth knowing going in: this feature's value here is as
   much about *forward* resolution catching up over time as it is about
   the backfill sweep.

7. **No `generic`-ruleset worlds exist in production yet** (0 rows).
   Generic enemies/classes/items/survivors field shapes below are
   verified from code only (`lib/rulesets/generic/*`), not cross-checked
   against real data. Low risk — the code is small and consistent with
   its own header comments — but flagging since Phase 0 asked
   specifically to verify against real data where possible.

8. **`world_forge_scope.md` is stale in at least one place**: it claims
   `entries_category_check` doesn't allow `'spells'`. Verified live —
   it does (`ARRAY['factions','npcs','enemies','classes','items',
   'spells','logs','survivors','locations']`). Consistent with this
   session's "don't trust prior docs" instruction; will fix this line
   when Phase 6 updates that file.

## Scope clarification (matters for how the registry is organized)

Of the 9 categories named in the task brief, **4 have exactly one
implementation shared by every ruleset** (no `lib/rulesets/<id>/`
variant exists at all): **npcs, factions, logs, locations**. Their
registry entries below apply universally — Echoes included, automatically,
with no extra work — since there's only one template/prompt file per
category to wire in.

The other 5 (**enemies, classes, items, spells, survivors**) do have
real per-ruleset variants. Per the task's explicit "across both
`lib/rulesets/5e` and `lib/rulesets/generic`" scoping, I audited those
two only — **Echoes' own separate files** (`lib/classTemplate.js`,
`lib/itemTemplate.js`, `lib/enemyTemplate.js`, `lib/survivorTemplate.js`,
and their prompts) are **not** in the registry below, even though two of
them (`lib/itemTemplate.js`'s `foundAtLocationId`, `lib/survivorTemplate.js`'s
`relationships[].toId`) have the identical kind of gap and would take the
identical resolver wiring. Listed at the bottom as a deliberate exclusion
— say the word if you want Echoes folded in too, it's a small addition.

## Field registry (Phase 1's `lib/entryLinkRegistry.js`)

All paths below are relative to `entry.raw` (see finding 1).

### Shared categories (all rulesets, incl. Echoes)

| Category | Field | Shape | Target | Type | Notes |
|---|---|---|---|---|---|
| npcs | `relationships[].toId` (+`toCategory`,`toLabel`) | idPointerArray, dynamic target | factions\|npcs\|enemies\|classes\|survivors | B | existing mechanism, backfill only |
| locations | `notableNpcs[].toId` (+`toLabel`) | idPointerArray | npcs | B | existing, backfill only |
| logs | `locationId` (+`locationContext`) | idPointer | locations | B | existing, backfill only |
| factions | `relationships[].faction` | **nameOnly**, no id field today | factions (self) | B-behaving | **new finding, see below** |

**On `factions.relationships[].faction`:** the prompt already constrains
the model to real archived-faction names only ("the ONLY factions you
may name... do not invent") — it behaves like Category B (grounded-only)
in every way except that it's stored as a bare name string with *zero*
id-linking machinery, unlike every other Category-B field. Wasn't in
your original spec's example list, so flagging explicitly: recommend
adding `toId`/`toLabel` alongside the existing `faction` text field
(keep `faction` as the display fallback) and running it through the same
resolver path as everything else here. **Your call whether this is in
scope for Phase 1 or deferred.**

### Ruleset-specific categories (5e + generic only, per your scoping)

| Category | Ruleset | Field | Shape | Target | Type | Notes |
|---|---|---|---|---|---|---|
| spells | 5e | `classes: string[]` | **Category A** — convert to `[{name,id}]` | classes | A | the flagship example from your brief; generic has no Spells category |
| survivors | 5e | `classes[].classId` | idPointer | classes | B | **already always resolved at generation** (model constrained + code-validated); no null-gap, nothing to backfill |
| survivors | generic | `classId` | idPointer | classes | B | same — already fully resolved |
| enemies | 5e, generic | — | — | — | — | audited every field in both templates/prompts; no cross-category reference of any kind |
| items | 5e, generic | — | — | — | — | same — no cross-category reference (5e's `baseItem` points at a static lookup table, not an entry) |
| classes | 5e, generic | — | — | — | — | same — no cross-category reference |

`survivors.classId`/`classes[].classId` will still get a forward-resolve
pass for defensive consistency (e.g. a manually-edited PC), but the
backward-resolve case can never fire in practice — a Class must already
exist to create a PC against it, so there's never a dangling reference
waiting to be filled in later.

### Explicitly out of scope (Echoes-only, flagged for awareness)

- `lib/classTemplate.js`: `evolutionEvent.locationId` → locations (B, existing)
- `lib/itemTemplate.js`: `foundAtLocationId` → locations, QuestItem-only (B, existing)
- `lib/survivorTemplate.js`: `relationships[].toId` → same shape as NPCs' (B, existing)

**Update, post-Phase-1:** question 2 below was resolved as "fold in" —
all three of these shipped in `lib/entryLinkRegistry.js`'s
`RULESET_FIELDS.echoes` and are wired into the Echoes generate routes.
This section is kept as-written for the historical record of what Phase 0
scoped; see `session_addendum_entry_cross_linking_shipped.md` for what
actually shipped.

## Open questions for you before Phase 1 starts

1. **`factions.relationships[].faction`** — include in Phase 1 (add
   `toId`/`toLabel`), or defer to a later session?
2. **Echoes' own three gaps above** — fold into this pass, or leave for
   later (they're isolated, wouldn't touch anything 5e/generic-shaped)?
3. **Registry shape for re-baking** — OK to add a `repo` slot to
   `lib/rulesets/index.js`'s per-category `REGISTRY` entries (pointing
   at each category's real `saveXEntry` function), so
   `backfillReferencesFromNewEntry` can look up "how do I re-save this"
   the same way the rest of the codebase already looks up
   "how do I render this"? Or would you rather `entryLinker.js` own that
   dispatch table privately instead of extending the ruleset registry?
