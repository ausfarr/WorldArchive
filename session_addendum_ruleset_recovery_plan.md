# Session Addendum: Multi-Ruleset Recovery Plan

Planning-only session — **no code shipped.** Austin reported the
multi-ruleset system (`session_addendum_ruleset_genericization.md`)
feeling broken/unfinished during real testing. This addendum is the
diagnostic pass that traced every reported symptom to a root cause
against the live repo, plus the decisions locked for the recovery work,
written up per this project's own "scope doc first, then build"
convention — which the original ruleset project itself did not follow
(see "How this happened," below). No build session should start from
this project until a follow-up scoping pass turns the plan below into
concrete per-phase prompts, the same way every other feature in this
repo has been scoped before implementation.

## How this happened (worth stating plainly)

The original ruleset project self-extended twice past its own stopping
points, at Austin's in-session requests ("go ahead and build the rest,"
then "make all last changes possible") — reasonable asks in the moment,
but the result is ~20 phases of real backend work that Austin never saw
scoped or reviewed piece by piece before it existed, unlike every other
feature in this repo's history. The documentation produced
(`session_addendum_ruleset_genericization.md`, the current
`world_forge_scope.md`) is genuinely thorough and honest about what was
deferred — but thorough retroactive documentation of unreviewed work is
not the same thing as the usual scope-doc-first process, and the gap
between "documented as deferred" and "Austin knew this was deferred
before hitting it in testing" is exactly what produced this bug list.
**Going forward: no ruleset-recovery phase below should be built without
a short scoping check-in first, even a quick one** — this project is
the reason that rule exists.

## Diagnostic findings (this session)

Traced every item from Austin's testing notes against the live repo
(fresh clone, not project knowledge). Root causes, not just symptoms:

1. **Nothing in `srd_library` was ever actually imported.** Migrations
   `020`/`021` were written but never applied to production Supabase, and
   `scripts/ingestSrd5e.js` was never run for real (confirmed: the
   original addendum's own "Recommended next session" section says to do
   both — that recommendation was never acted on). This alone explains
   the empty 5e Import dropdown.
2. **`entries_category_check` (a constraint predating the `migrations/`
   folder — the exact "blind spot" already flagged in this project's own
   established learnings) was never updated to allow `'spells'`.** Every
   spell generation attempt (AI or otherwise) fails at the DB layer.
   Confirmed by reading the constraint directly; not present in any
   migration file.
3. **Procedural ("roll randomly") generation has zero ruleset awareness.**
   `lib/proceduralGenerators.js` always builds an Echoes-shaped object
   (`baseName`/`evolvedName`, no top-level `name` field, Echoes' formula
   modules hardcoded). But `routes/confirmEntry.js` *does* dispatch the
   write by ruleset (added for Phase 3/5/6/8) — so on a 5e world, an
   Echoes-shaped procedural class gets handed to `save5eClassEntry`,
   which expects a real 5e-shaped class with a `name` field. That
   mismatch is the exact `null value in column "name"` error. This isn't
   classes-specific — the same crash will hit Items, Enemies, and
   Survivors procedural generation on any 5e/PF2e/Generic world, and
   there's no `spells.json` procedural table in any ruleset, Echoes
   included.
4. **Manual entry mode has zero ruleset awareness.** Built well before
   the ruleset project (`migrations/013_manual_entry_mode.sql`) and never
   revisited by it — grep confirms zero `ruleset` references anywhere in
   the manual-entry code path. It always renders the Echoes-shaped form
   regardless of world ruleset, which is exactly what Austin saw on a 5e
   world.
5. **Spells has no wizard category toggle.** `spells` was added to
   `archive/js/render.js`'s `CATEGORY_LABELS` (nav/homepage) and got its
   own index page in Phase 11, but was never added to
   `prompts/wizardCategoryConfigPrompt.js`'s `CANONICAL_CATEGORIES` or
   `archive/wizard-categories.html`'s toggle list — both still hold the
   original fixed 8 categories from before rulesets existed.
6. **The Import/Reflavor/Homebrew mode picker is real and does branch
   correctly by ruleset** (`archive/enemies/index.html`, Phase 11) — but
   it's nested inside the "Generate with AI" panel, so Import (free, not
   actually AI generation) reads as a hidden sub-option of an AI feature
   rather than its own first-class action. Confirmed UX gap, not a bug.
7. **NPC Combatant button label persistence** — the backend correctly
   sets `isDefaultProfile: false` on upgrade and the page reloads after a
   successful upgrade, so the simple upgrade-then-reload path works.
   Likely cause of Austin's repro: the NPC regenerate path's "preserve an
   already-upgraded Combatant's stats" logic (Phase 7) may not be
   explicitly preserving the `isDefaultProfile` flag itself alongside the
   rest of `combatProfile`, silently flipping a real Combatant back to
   "default" on a later narrative regenerate. Needs a two-step repro
   (upgrade → confirm label → regenerate NPC narrative → recheck label)
   to confirm before fixing — flagged, not root-caused with certainty.
   **Confirmed separately:** the button is not gated by the account's
   AI-toggle at all — it shows and fires a real AI call for every 5e/pf2e
   NPC regardless of that setting. Real gap, needs the same
   `requireAiEnabled` treatment every other generation entry point has.
8. **Portrait generation on any non-Echoes entry crashes.** Reported
   symptom: generating an image on an imported 5e enemy fails with
   `Cannot destructure property 'body' of 'attributes' as it is
   undefined.` Root cause confirmed: `routes/generateEntryImage.js` (the
   one shared portrait route used by every portrait-supporting category)
   hardcodes its `CATEGORY_SAVE_FN` lookup to `lib/fileWriter.js`'s
   Echoes-only `save*Entry` functions — unlike `routes/confirmEntry.js`,
   it never dispatches by ruleset. `saveEnemyEntry` calls
   `lib/enemyTemplate.js`'s body-HTML builder, which unconditionally
   destructures `enemy.attributes.{body,reflex,...}` — a field that
   doesn't exist on a 5e enemy's differently-shaped stat block. Same
   structural risk confirmed for at least Classes too
   (`lib/classTemplate.js` hard-requires `cls.baseName`/`cls.evolvedName`,
   which a 5e class also doesn't have) — likely present for every
   portrait category on any non-Echoes ruleset, not just the one that's
   actually crashed so far. **This is the same disease as findings #3 and
   #4/5/7** (a system that predates or sits outside the ruleset project's
   own dispatch pattern, never updated to use it) — a third confirmed
   instance, not a one-off. The fix is contained, though: the correct
   per-ruleset save functions already exist (built for `confirmEntry.js`
   — `save5eEnemyEntry`, `saveGenericEnemyEntry`, etc.) — this route just
   needs the same ruleset-dispatch pattern applied to it, across all six
   portrait-supporting categories.

## Decisions locked this session

1. **Scope-doc-first, resumed.** This addendum is the plan; a follow-up
   scoping session turns each phase below into real prompts before any
   phase is built, matching this project's established process. No
   "build everything, document after" this time.
2. **Procedural generation and manual entry get a full revamp** to the
   same quality bar as AI generation — real per-ruleset schemas, not a
   fail-open/hide-the-button patch. This is the single biggest chunk of
   the recovery work; see Phase R3 below.
3. **Pathfinder 2e is being removed, not just deprioritized.** Rationale
   (Austin's call, this session): PF2e currently has Homebrew tier only,
   in every category, with no path to a real Import/Reflavor tier without
   resolving an unresolved ORC-vs-CUP licensing question Austin has no
   strong reason to chase down right now. Homebrew-only PF2e offers
   nothing a user can't already get from **Generic** (fully custom
   system) or **5e** (real official content when structure is wanted) —
   it's pure maintenance surface (a third ruleset to keep in sync through
   the procedural/manual revamp, the wizard, every form) for zero current
   users. Since no real worlds exist on PF2e yet (Austin is still the
   only tester), this is a clean removal, not a deprecation flag —
   nothing migrates, nothing needs a fallback path. The PF2e code stays
   in git history and the registry pattern (`lib/rulesets/index.js`)
   still supports adding a ruleset back the same way later, if real
   demand ever shows up.

   **Ruleset lineup after removal: `echoes` (admin-only), `5e`,
   `generic`.** "Generic" is and remains the answer to "what does
   homebrew look like" — a world defines its own attributes, optional
   derived-stat formulas, and (per Phase 10) narrative-first
   Classes/Items/NPCs/Player Characters with no invented numeric system.
   Nothing about Generic changes because of this decision; it was never
   PF2e-dependent.

   **Removal scope** (for the follow-up scoping session to size, not
   built here): 8 PF2e-dedicated files (`lib/rulesets/pf2e/`,
   `prompts/rulesets/pf2e/`, `scripts/ingestSrdPf2e.js`, 5
   `scripts/testPf2e*.js` files) plus PF2e branches scattered across 19
   shared files (every `generate*.js` route, `confirmEntry.js`,
   `requireCategoryAvailable.js`, `entryTemplate.js`, every ruleset-aware
   frontend form, `wizard-stats.html`, `wizard.js`, migration `020`'s
   CHECK constraint). Needs a real pass to confirm nothing PF2e-specific
   is load-bearing for 5e/Generic before deleting (e.g. shared registry
   plumbing that happens to also list a `pf2e` key should have that key
   removed, not the plumbing itself).

## Recovery plan — phases for the follow-up scoping session

Ordered by dependency, not necessarily build order — that's a call for
the scoping session itself, informed by the earlier "where should we
start" prioritization (Austin picked "write it up" this round; the DB
unblock and small fixes are both still on the table for next).

- **Phase R0 — Database unblock.** Apply migrations `020`/`021` for
  real, add the missing `entries_category_check` update for `spells`
  (new migration, not a hand edit to an existing one), run
  `scripts/ingestSrd5e.js` for real, verify `srd_library` actually has
  201 rows and the 5e Import dropdown populates. Blocking for everything
  else — nothing else can be verified end-to-end until this is done.
- **Phase R1 — PF2e removal.** Per the decision above. Should land before
  R3 (procedural/manual revamp) so that revamp only has to target
  Echoes/5e/Generic, not four rulesets.
- **Phase R2 — Small/contained fixes.** Spells wizard toggle
  (`CANONICAL_CATEGORIES` + `wizard-categories.html`), Import promoted to
  its own button instead of nested in the AI-generate panel, NPC
  Combatant button gated behind `requireAiEnabled`, the
  Combatant-button-persistence repro/fix from finding #7, and
  `routes/generateEntryImage.js`'s ruleset-dispatch fix from finding #8
  (reuse the per-ruleset save functions that already exist for
  `confirmEntry.js`, across all six portrait categories, not just
  Enemies).
- **Phase R3 — Procedural + manual entry, ruleset-aware revamp.** The
  large one. Needs real per-ruleset schemas for both systems, across
  every category each ruleset actually has (including Spells, which has
  neither a procedural table nor a manual form in any ruleset today).
  Same "model/code split" and verification bar as the original AI
  generation work — this is a full parallel build, not a bugfix, sized
  accordingly.
- **Phase R4 — Full end-to-end verification.** Once R0-R3 land: a real
  browser session against the real deployed app, one full generate cycle
  (AI + procedural + manual, every implemented mode) in every category
  for both Echoes and 5e, plus a fresh Generic world walkthrough. This is
  the check the original project's own "Recommended next session"
  section asked for and never got — do not skip it this time.

## Open items carried over, unchanged by this session

- 5e Import/Reflavor for Spells/Classes/Items remains blocked on the same
  "Tabyltop hasn't shipped structured spell/item JSON yet" finding —
  nothing new to do here until that changes upstream.
- Differential billing (`BILLING_ENABLED=true` path) still verified by
  code reading only, not a live test — unaffected by this plan, revisit
  whenever billing actually goes live.
- Survivors → "Player Characters" rename still deferred as cosmetic/
  risky — unaffected by this plan.
