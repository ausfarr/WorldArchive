# Session Addendum: Ruleset Recovery Phase R3 — Procedural + Manual Entry Revamp (shipped)

Closes out `session_addendum_ruleset_recovery_plan.md`'s Phase R3 — the
largest piece of the recovery plan. Root cause (findings #3/#4/#5/#7/#8
in that addendum): `lib/proceduralGenerators.js` and Manual Mode both
predate or sit outside the ruleset-genericization project and always
produced Echoes-shaped objects, which crashed on write for 5e/generic
worlds the moment `routes/confirmEntry.js`'s per-ruleset dispatch (built
for AI generation) received one. This session gives every category each
ruleset actually has in the registry a REAL procedural generator and a
REAL manual entry form, matching that ruleset's actual schema — same
quality bar as the AI-generation work, not a shared lowest-common-
denominator shape.

Re-cloned the repo fresh at session start and confirmed it matched R1
(PF2e removal) + R2 (small/contained fixes), both already merged to
`main` — no PF2e code anywhere, findings #2/#5/#6/#7/#8 from the recovery
plan already fixed. Built on branch `claude/ruleset-recovery-generators-gtaadk`.

## What shipped

### Backend — procedural generation

- **`lib/proceduralGenerators/shared.js`** — small utilities
  (`weightedPick`/`weightedValue`/`weightedPickN`/`fillTemplate`/
  `slugify`/`dedupeId`/`uniqueId`/`pickFaction`), reimplemented
  independently rather than importing from Echoes'
  `lib/proceduralGenerators.js` (which doesn't export them, and which
  this session's non-goals explicitly forbid touching). No Echoes code
  was read into this file — same small shape, zero shared runtime
  dependency.
- **`lib/proceduralGenerators/5e.js`** — `generate5eEnemyProcedurally`,
  `generate5eClassProcedurally`, `generate5eItemProcedurally`,
  `generate5eSpellProcedurally`, `generate5eSurvivorProcedurally`. Every
  derived/authoritative number is computed by the SAME formula modules
  AI generation already uses, never invented here:
  - Enemies: rolls a target CR band from `lib/rulesets/5e/statFormulas.js`'s
    own `CHALLENGE_THRESHOLDS` table, derives hp/ac/attack-bonus/damage-
    dice from that row, then runs the proposal through the real
    `computeChallengeRating()` — exactly the "model proposes, code
    computes and stores the authoritative result" flow
    `homebrewEnemyGenerator.js` already established, just with a data
    table standing in for the model. `challengeRating.estimated: true`
    on every result, matching the Homebrew badge convention.
  - Classes: real 1-20 shape via `classFormulas.js` — milestone feature
    levels chosen to avoid the 5 ASI levels (auto-inserted by
    `classTemplate.js`), `subclassUnlockLevel` resolved by the same
    core-class-name-match-or-fallback-to-3 logic `routes/generateClass.js`
    uses, never model/table-declared directly.
  - Items: `baseItem` picks a real SRD weapon/armor name;
    `resolvedStats` comes from `itemFormulas.js`'s real `lookupWeapon`/
    `lookupArmor` lookup tables, never fabricated.
  - Spells: a seed pool of real, mechanically-valid spell shapes (level/
    school/casting-time/etc.); cantrip base damage feeds
    `spellFormulas.js`'s real scaling math at render time (nothing here
    invents the 5th/11th/17th-level table).
  - Survivors: **hard-requires a real Class entry from this world's own
    archive** (throws a clear error if none exist yet, matching AI
    Homebrew's own 400 behavior) — HP/proficiency bonus/spell slots
    computed from that class's real `hitDie`/`casterType` via
    `survivorFormulas.js`/`classFormulas.js`, never table-invented.
- **`lib/proceduralGenerators/generic.js`** — `generateGenericEnemyProcedurally`,
  `generateGenericClassProcedurally`, `generateGenericItemProcedurally`,
  `generateGenericSurvivorProcedurally`. Attribute VALUES are rolled
  within this world's own defined attribute list
  (`genericSystem.attributes` — never a hallucinated key); derived stats
  come from `lib/rulesets/generic/statFormulas.js`'s real
  `computeDerivedStats()` when the world opted into a formula layer,
  otherwise a flavor-text-only field, exactly mirroring
  `homebrewEnemyGenerator.js`'s generic counterpart. Classes/Items stay
  deliberately narrative-first (no leveling/rarity system invented —
  Generic has none) per Phase 10's own established rule. Survivors
  requires both a configured attribute system AND a real Class entry,
  throwing a clear error otherwise.
- **`data/proceduralTables/5e/{enemies,classes,items,spells,survivors}.json`**
  and **`data/proceduralTables/generic/{enemies,classes,items,survivors}.json`**
  — new per-ruleset data tables, mirroring the Echoes tables' weighted-
  pool STRUCTURE but with content/fields matching each ruleset's actual
  schema (read directly from each `*Formulas.js`/`*ContentPrompt.js`
  before writing a single row, not guessed).
- **`routes/generateProcedural.js`** — now dispatches by ruleset for
  enemies/classes/items/survivors/spells, the same per-category-then-
  per-ruleset pattern `routes/confirmEntry.js` already established
  (read that file's dispatch before touching this one). `spells` is new
  to `VALID_CATEGORIES` (5e-only — 501s on any other ruleset, matching
  `requireCategoryAvailable.js`'s own `hasCategory()` reasoning). npcs/
  locations/factions/logs are untouched — they fall through to Echoes'
  original `generateProcedurally()` on every ruleset, same as
  `confirmEntry.js`'s `WRITERS` map never branching those categories.
  The result is then handed to `POST /api/confirm-entry`
  (frontend-driven, same two-step flow the original procedural feature
  established), which already dispatches the WRITE by ruleset — no
  changes needed there.

### Backend — manual entry

No dedicated "manual entry backend" existed to extend — Manual Mode has
always worked by building a blank stub client-side and opening the same
bespoke edit-form UI a regenerate/edit action uses, saving through the
shared `/api/confirm-entry` route. The ruleset-dispatch work therefore
lives entirely in the frontend dispatch layer (below) plus reusing the
per-ruleset writers `confirmEntry.js` already has.

### Frontend — manual entry forms

- **`archive/js/rulesetManualForms.js`** (new, ~1000 lines) — real
  per-ruleset edit-form builders: `show5eEnemyEditForm`,
  `showGenericEnemyEditForm`, `show5eClassEditForm`,
  `showGenericClassEditForm`, `show5eItemEditForm`,
  `showGenericItemEditForm`, `show5eSpellEditForm`,
  `show5eSurvivorEditForm`, `showGenericSurvivorEditForm`. Each renders
  the ACTUAL fields that ruleset+category's `*Template.js` and
  `save*Entry` writer expect (ability scores + CR + traits/actions for
  5e Enemies; hit die + caster type + milestone features + subclasses
  for 5e Classes; base-item-resolved stats for 5e Items; level/school/
  cantrip-scaling for 5e Spells; a real linked-Class picker for
  Survivors; this world's own attribute labels for every Generic form).
  Reuses `render.js`'s existing shared field-building helpers
  (`efField`/`efSelect`/`openEditOverlay`/`wireRowEditor`/
  `idSelectOptionsHtml`/`fetchCategoryOptions`/`getFactionLookup`)
  unmodified.
- **Dispatch, not a fork**: `handleManualCreateClick()` and `editEntry()`
  are redeclared in this new file — since both are plain top-level
  `function` declarations in a classic (non-module) script, a same-name
  declaration in a script tag loaded AFTER `render.js` cleanly overrides
  them for every page that loads this file, while leaving
  `render.js` and every Echoes-shaped form
  (`showEnemyEditForm`/`showClassEditForm`/`showItemEditForm`/
  `showSurvivorEditForm`) **completely untouched, byte-for-byte**. Both
  overrides fall back to the exact original Echoes behavior
  (`EDIT_FORM_BUILDERS[category]`) for an `echoes` world, an
  unrecognized ruleset, or any category/ruleset combo without a
  ruleset-specific form — same fail-open convention every other
  ruleset-aware frontend form in this project already follows.
  `editEntry()` reads the ruleset straight off the fetched entry's own
  `ruleset` field (stamped by every `save5eXEntry`/`saveGenericXEntry`
  writer already) rather than a second network round trip.
- **New page, no Echoes button to gate on**: Spells has no
  `EDIT_FORM_BUILDERS` entry at all (no Echoes equivalent), so
  `wireCreateEntryCollapse()` never renders an "Enter Manually" button
  there. `promoteSpellsManualButton()` injects one page-locally, mirroring
  `archive/enemies/index.html`'s existing `promoteImportToStage1()`
  `whenReady`-polling pattern for the identical problem — only shown once
  the ruleset lookup confirms the world is on 5e.
- **Formula duplication, flagged explicitly**: this is a plain static
  frontend with no build step and no bundler to share server-side
  modules with the browser (per `CLAUDE.md`), so a few small, genuinely
  constant tables (5e proficiency-bonus-by-level, hit-die averages, full/
  half/warlock spell-slot counts, a trimmed copy of the SRD weapon/armor
  lookup, the generic single-attribute linear derived-stat formula) are
  copied verbatim into `rulesetManualForms.js`, each commented with its
  canonical `lib/rulesets/**` source file. This re-runs the SAME "code
  computes it, never hand-typed as authoritative" principle every
  generation route follows — a manually-typed entry has no server-side
  generation step to run it through the way Homebrew AI and the
  procedural generators do, so the computation has to happen client-side
  instead. If those canonical files change, these copies need updating
  too — noted in the file's own header for whoever touches
  `lib/rulesets/5e/*.js` next.
- Script tags added (with the new file's own `?v=` cache-busting param)
  to `archive/{enemies,classes,items,survivors,spells}/index.html` only
  — the 4 ruleset-agnostic category pages (npcs/locations/factions/logs)
  are untouched, load only the original `render.js`.
- **Cache version bumped v0.17 → v0.18** via `scripts/bump-cache-version.js`
  (confirmed working — the dead `require("glob")` bug flagged in an
  earlier session's addendum was already fixed before this session
  started) — `rulesetManualForms` added to that script's
  `CACHE_BUSTED_SCRIPTS` list so future bumps cover it automatically.

## NPCs and Locations — confirmed unmodified and correct, left alone

Per the task's explicit instruction, checked rather than assumed:

- **Procedural**: `generateNpcProcedurally`/`generateLocationProcedurally`
  in Echoes' `lib/proceduralGenerators.js` use only narrative fields
  (`roleArchetype`/`traits`/`speech`/`dialogue`/`questHook` for NPCs;
  `regionBiome`/`dangerTags`/`notableFeatures`/`hooksSecrets` for
  Locations) — no reference to Echoes' BODY/REFLEX attribute system
  anywhere. `routes/generateProcedural.js`'s dispatch leaves both
  categories falling through to this unmodified Echoes generator on
  every ruleset, exactly matching `confirmEntry.js`'s `WRITERS` map,
  which never branches npcs/locations by ruleset either.
- **Manual**: `showNpcEditForm`/`showLocationEditForm` in `render.js`
  are equally narrative-only, and `showNpcEditForm` builds its saved
  object via `{...raw, ...explicit fields}` — since `combatProfile`
  (the one ruleset-specific field an NPC can carry, added by the
  "Combatant" upgrade) is never read or explicitly overwritten, it
  passes through the spread untouched on save.
- **Writer**: `WRITERS.npcs`/`WRITERS.locations` in `confirmEntry.js`
  stay the single shared Echoes writer for every ruleset by design
  (`world_forge_scope.md`'s registry explicitly keeps NPCs/Locations
  ruleset-agnostic) — a procedurally-generated or manually-created NPC
  is always Echoes-shaped narrative content regardless of the world's
  ruleset, which is exactly what that shared writer expects. No crash
  risk, no changes needed. **Confirmed working unmodified for 5e/generic
  — left alone, per the task's explicit instruction.**

## Verification

- **`scripts/testProceduralRulesetGenerators.js`** (new, permanent,
  matches repo convention — a standalone `node scripts/test*.js` script,
  no test runner). No real Supabase project is reachable in this
  sandbox (same situation every prior session in this repo's history has
  hit — see `session_addendum_procedural_generation_shipped.md`'s
  "Testing note"), so this script injects a small in-memory fake for
  `@supabase/supabase-js`'s query-builder surface (`from/select/eq/
  order/maybeSingle/single/insert/update/upsert` — the exact subset
  `lib/entriesRepo.js`/`lib/worldConfigRepo.js` actually call) into
  `require.cache` BEFORE requiring any real app module, so the entire
  real code path (generator → formula module → ruleset-specific
  `save*Entry` writer → `build*BodyHtml`) runs completely unmodified
  against fake data — a genuine end-to-end run of the real write path,
  not a hand-shaped assertion. Covers all 9 new generator functions:
  every one is asserted to produce a saved `entries` row with its
  category's real required fields present (computed `challengeRating`,
  `subclassUnlockLevel`, `resolvedStats`, valid spell `level`, computed
  `hitPoints`/`derivedStats`, etc.), plus the "no Classes yet" and "no
  attribute system configured" error paths for both rulesets' Survivors
  generator. **Ran the full suite 25 consecutive times** (randomized
  weighted picks) with zero failures — catches edge cases a single run
  wouldn't (and did, during development — see "Bugs caught" below).
- **Headless-browser verification** (Playwright, against the real
  running Express app — dummy env vars, no real Supabase, same
  established pattern as this project's own Phase 11 verification
  passes — `archive/js/auth.js`, the Supabase CDN script, and the
  handful of `/api/*` calls each page needs are stubbed via route
  interception; not committed to the repo, ad hoc verification script
  matching how prior UI passes in this project were run). **19
  assertions, all passing**, across every new manual form:
  - 5e Enemies: real fields render (Challenge Rating, STR/DEX/etc.),
    Echoes' Tier field does NOT render; a filled-in save posts a
    correctly 5e-shaped entry.
  - Generic Enemies: this world's own configured attribute labels
    (tested with "Might"/"Grit") render as field labels, 5e's Challenge
    Rating field does NOT render; a save computes `derivedStats` via the
    real linear formula and uses only this world's real attribute keys.
  - 5e Classes: Hit Die/Caster Type render, Echoes' 1-99 `baseName`
    field does NOT; a save gets a code-computed `subclassUnlockLevel`.
  - Generic Classes: a "Leans On" attribute picker renders, no hit-die/
    leveling fields.
  - 5e Items: Base Item/Rarity render; a save with `baseItem: "longsword"`
    resolves real SRD stats (`damageDice: "1d8"`, `damageType: "slashing"`)
    via the embedded lookup table.
  - Generic Items: an optional attribute-boost field renders, no
    rarity/value fields.
  - 5e Spells: the page gets a brand-new "Enter Manually" button (none
    existed before this session); Level/School fields render; a save
    posts a valid `level` 0-9 with `cantripBaseDamage`.
  - 5e Survivors: a real Class picker (populated from the world's actual
    archive) renders; a save computes `hitPoints`/`proficiencyBonus`
    from the chosen class's real `hitDie`/level via the client-side
    formula mirror.
  - Generic Survivors with no attribute system configured: a clear
    alert, not a broken form.
- **Repo-wide sweep**: `node -c` on every touched/new `.js` file, a full
  server boot with dummy env vars (clean start, static route returns
  200), and unauthenticated hits against the new/touched routes
  (`/api/generate-procedural`, `/api/confirm-entry`) confirmed 401s
  (middleware runs correctly) rather than 404s/500s.

## Bugs caught and fixed during this session (before shipping)

1. `generate5eItemProcedurally`'s weapon/armor/wondrous branches read
   `weightedPick(...).baseItem`/`.name` directly instead of
   `weightedPick(...).value.baseItem`/`.value.name` — `weightedPick()`
   returns the whole `{value, weight}` row, not its inner `value`. Every
   generated item had `name: undefined` and `id: "undefined"`. Caught by
   the test script's first real run, not by inspection — a concrete
   argument for actually executing the generator against a real write
   path instead of only reading the code.
2. Two test-script assertions initially checked `savedEntry.challengeRating`/
   `savedEntry.subclassUnlockLevel` at the wrong nesting level (top-level
   instead of `.raw.*`) — `rowToFullEntry()` spreads the stored
   `entryMeta` at top level, and `entryMeta.raw` is where the actual
   enemy/class content object (containing those fields) lives. Fixed the
   assertions, not the generators — the generator output was correct;
   the test read the wrong path.
3. Playwright route-interception ordering: the test harness's
   `**/api/entries/classes*` stub and its broader `**/api/entries/**`
   catch-all were unintentionally racing (whichever matched last took
   precedence), causing the 5e Survivor manual form's real-Class-list
   fetch to see an empty list even when one was stubbed. Fixed by
   merging into one handler that branches on the URL path — a test-
   harness bug, not a product bug, but worth noting since it initially
   looked exactly like a real "Survivors can't find its Classes" defect
   until traced.

## Explicitly flagged, not fixed (per this session's non-goals)

- **Genre-awareness was not extended to the new 5e/Generic tables.**
  Echoes' procedural system has a full 5-bucket genre-detection layer
  (`detectGenreBuckets`/`filterByGenre`, built in a follow-up session
  after the original procedural feature shipped). Replicating that for
  9 new category+ruleset combinations was out of scope for this
  session's effort budget — 5e is inherently D&D-fantasy-flavored by
  definition, and Generic worlds already define their own flavor via
  attributes/lore, which softens the need somewhat, but this is a real,
  honest gap versus Echoes' quality bar specifically on genre variety
  (not on schema correctness or formula accuracy). Flagged as a
  reasonable follow-up, not silently dropped.
- **Data table depth is a reasonable floor, not the "genre-expanded"
  depth Echoes' tables eventually reached** (Echoes' post-expansion
  tables run 40-190 rows per pool; this session's new tables run
  roughly 10-30 rows per pool — closer to Echoes' ORIGINAL pre-expansion
  depth). A world generating dozens of entries procedurally in one
  category will start noticing repeats sooner than an Echoes world
  would. Same honest tradeoff Echoes' own original addendum flagged
  before its later genre-expansion pass — a good first-ship floor, not
  the ceiling.
- **5e Items' manual/procedural rarity-vs-value sanity check
  (`rarityValueWarning`) is not computed** for manually-created items
  (the procedural generator does call it) — would need a third small
  copied table client-side; skipped as a minor, purely informational
  nicety rather than duplicating more data for a warning-only field.
- **R4-scoped 5e PC fields were intentionally NOT added** — skill
  proficiencies, saving-throw proficiencies, passive Perception,
  initiative bonus, real Backgrounds/Feats, and multiclassing are all
  explicitly out of scope per
  `session_addendum_ruleset_recovery_r4_5e_completeness_scope.md`
  (a separate, already-scoped future phase). Both the procedural
  generator and manual form for 5e Survivors match AI Homebrew
  generation's CURRENT schema exactly (confirmed by reading
  `prompts/rulesets/5e/survivorContentPrompt.js` directly) — this is
  parity with what exists today, not a new gap introduced by this
  session.
- **Nothing Echoes-specific was touched.** No bugs were found in
  Echoes' existing procedural/manual code during this session (the one
  pre-existing gap noticed — NPCs/Locations' `combatProfile` field only
  ever being read via `entry.raw.combatProfile`, not `entry.combatProfile`
  — was already found and fixed in R2, confirmed unchanged and correct
  here, not re-touched).

## The "done" matrix — final state

| Ruleset | Category | Procedural | Manual |
|---|---|---|---|
| echoes | factions, npcs, enemies, classes, items, logs, survivors, locations | **Real** (unchanged, reference implementation) | **Real** (unchanged, reference implementation) |
| 5e | enemies | **Real** — real CR math via `computeChallengeRating` | **Real** — full stat-block form |
| 5e | classes | **Real** — real 1-20 shape via `classFormulas.js` | **Real** — full class-sheet form |
| 5e | items | **Real** — resolved SRD weapon/armor stats | **Real** — base-item stat resolution |
| 5e | spells | **Real** — real cantrip scaling hookup | **Real** — brand-new manual entry point (none existed) |
| 5e | survivors | **Real** — requires + builds on a real Class | **Real** — real Class picker + computed HP/prof/slots |
| 5e | npcs, locations | **Real** (Echoes' shared ruleset-agnostic path, confirmed working, untouched) | **Real** (same) |
| generic | enemies | **Real** — this world's real attributes + formula | **Real** — this world's real attribute labels |
| generic | classes | **Real** — narrative-first, no invented leveling | **Real** — narrative-first, no invented leveling |
| generic | items | **Real** — narrative-first, no invented rarity | **Real** — narrative-first, no invented rarity |
| generic | survivors | **Real** — requires + builds on a real Class | **Real** — real Class picker + real formula |
| generic | npcs, locations | **Real** (Echoes' shared ruleset-agnostic path, confirmed working, untouched) | **Real** (same) |
| generic | spells | **N/A — correctly absent** (Phase 10's own scope decision; Generic has no Spells category, unrelated to this session) | **N/A — correctly absent** |

Every cell the registry says a ruleset should have is real and verified.
No PF2e anything was touched (it's gone as of R1). No cell was silently
skipped.

## Suggested next session

- **Phase R4** (already scoped in
  `session_addendum_ruleset_recovery_r4_5e_completeness_scope.md`) —
  5e PC sheet completeness (skills/saves/passive/initiative/real
  Backgrounds+Feats/multiclassing), the Items type-picker gap, and the
  `5e-bits/5e-database` license verification that would unblock real
  Import/Reflavor for Spells/Items/Classes. Per that doc's own rule and
  this project's re-established convention: a short scoping check-in
  before building, not a straight continuation.
- **Genre-awareness for the new procedural tables** (flagged above) is a
  reasonable follow-up if procedural generation sees real usage on 5e/
  Generic worlds outside the default fantasy assumption.
- **Phase R4 (full end-to-end verification)** from the original recovery
  plan — a real browser session against the real DEPLOYED app (not this
  sandbox's stubbed/mocked verification) is still the one checkpoint
  nothing in this recovery effort has been able to run. Worth doing
  once Austin has a moment, same standing note every addendum in this
  project's history has carried forward.
