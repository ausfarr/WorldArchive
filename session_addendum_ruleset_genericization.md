# Session Addendum: Multi-Ruleset Genericization (Phases 1–3 shipped)

Full architectural detail for the multi-ruleset genericization project.
Linked from `CHANGELOG.md`'s Unreleased section. Folds in the running
`SESSION_LOG.md` kept during the build (that file remains in the repo as
the literal decision trail; this addendum is the polished, complete
record).

## One-paragraph summary

Added a `ruleset` dimension to worlds (`world_config.ruleset`, permanent
once wizard setup completes) so a world can be built on real D&D 5th
Edition instead of only Austin's bespoke "Echoes of the Neon" system,
which stays fully intact and admin-only. Built the shared foundation
(schema, a `lib/rulesets/index.js` registry every generation route
dispatches through, a canonical SRD content library, license
infrastructure) and proved the whole pattern end-to-end on one category —
the Bestiary — with real, verified 5e Challenge Rating math and a
three-tier generation model (Import / Reflavor / Homebrew). Pathfinder
2e, every other content category, the Generic ruleset, ruleset-aware edit
forms, and differential billing are scoped and explicitly deferred, not
built — see "What's deferred" below.

## What shipped

### Phase 1 — Ruleset Foundation

- `migrations/020_ruleset_foundation.sql`: `world_config.ruleset` (default
  `'echoes'`, CHECK-constrained to `echoes | 5e | pf2e | generic`),
  `srd_library` (shared canonical content, RLS with an authenticated-read
  policy), `world_srd_imports` (tenant-scoped join table tracking which
  world imported which library row, and under which entry id).
- `lib/rulesets/index.js`: the registry every generation route will
  dispatch through — `ruleset -> { category -> { formulas, template,
  prompt } }`. Echoes' entry points at the exact files every route
  already imported before this project; nothing about Echoes changed.
  Explicit `require()` per filled-in entry (not directory
  auto-discovery), so a missing module fails loudly at server boot.
- Wizard Step 1 got a Ruleset picker (`archive/wizard.html`,
  `routes/wizard.js`'s new `/wizard/ruleset-options` and
  `/wizard/set-ruleset`), server-filtered to hide Echoes from non-admins
  (`lib/adminAccess.js`'s existing `isAdminEmail()` — no second admin
  check introduced). **Lock-timing decision**: the spec says "permanent";
  the wizard's established pattern is a live, editable draft until Review
  & Confirm. Resolved as: editable like any other Step 1 field until
  `setup_completed_at` is set, at which point `worldConfigRepo.setRuleset()`
  refuses unconditionally and no route calls it again. This matches how
  every other wizard field behaves pre-completion while still satisfying
  "no route ever changes an existing, in-use world's ruleset."

### Phase 2 — SRD Data Ingestion

- `scripts/ingestSrd5e.js` ingests 201 real 5e monsters from
  `Tabyltop/CC-SRD` (verified CC-BY-4.0 — see "Licensing research"
  below), upserting into `srd_library` on `(ruleset, category, srd_id)`.
  Classes/Spells/Items are explicitly **not** ingested — no verified
  CC-BY-4.0 *structured* dataset exists for them (see deferred list).
- `scripts/ingestSrdPf2e.js` is written but intentionally inert — see
  "Open question for Austin" below.
- `archive/licenses.html` carries the real, verbatim-required SRD
  5.1 CC-BY-4.0 attribution plus an honest PF2e status note. Every
  `archive/*.html` page's footer links to it.

### Phase 3 — Bestiary (5e proof of concept for the whole pattern)

- `lib/rulesets/5e/statFormulas.js`: the DMG's real Challenge Rating
  algorithm (defensive CR from HP/AC, offensive CR from damage-per-round/
  attack-bonus/save-DC, averaged with the DMG's own round-up-on-.5 rule).
  Table cross-checked against an independent reference implementation; a
  transcription bug in that reference (CR-25's save DC) was caught and
  fixed here. See "Bugs caught and fixed" and "Important finding" below —
  this formula, applied literally, does **not** reliably reproduce a real
  monster's officially printed CR, which is expected/documented 5e
  behavior, not an implementation defect.
- `lib/rulesets/5e/enemyTemplate.js`: a genuinely different HTML
  stat-block layout from Echoes' attribute table (AC/HP/Speed, six
  ability scores + modifiers, saving throws, skills, resistances/
  immunities, senses/languages, CR with an "(estimated — review before
  play)" badge on Homebrew entries, traits, actions, legendary actions).
- `prompts/rulesets/5e/enemyContentPrompt.js`: Reflavor and Homebrew
  prompt builders (Import needs no prompt — direct DB copy).
- `routes/generateEnemy.js`: dispatches on `world.ruleset` at the top of
  the handler. The entire pre-existing Echoes code path was moved
  verbatim into its own function (`handleEchoesEnemyGenerate`) — diffed
  against the original file to confirm every statement is unchanged, not
  just moved. A `pf2e`/`generic` world gets an explicit `501` (with its
  generation-cap spend refunded), never a silent fallback to Echoes'
  code.
- `routes/confirmEntry.js`'s shared regenerate-confirm write path now
  branches per-ruleset for the `enemies` category only — Echoes' writer
  (`saveEnemyEntry`) is untouched; a new `lib/rulesets/5e/enemyRepo.js`
  handles the 5e write path.
- `scripts/test5eStatFormulas.js`: hard-asserted unit tests (ability
  modifiers, dice-average parsing, 3 hand-traced real-monster CR
  component checks, the DMG's own worked averaging example, proficiency
  bonus lookup) plus an informational sweep across all 201 ingested
  monsters.

## Licensing research (the part with real legal exposure)

**5e — resolved.** This project's own scope doc suggested
5e-bits/5e-database as a starting point. Checked its actual `LICENSE.md`/
`README.md` directly: the data is licensed under **OGL 1.0a**, not
CC-BY-4.0 — a materially different, more restrictive license with real
ongoing ambiguity after Wizards' disputed 2023 "deauthorization" attempt.
Rejected it, along with every other community 5e-SRD-JSON project found
by search (`BTMorton/dnd-5e-srd`, `soryy708/dnd5-srd`, `vorpalhex/srd_spells`
— all OGL 1.0a). Found and verified `Tabyltop/CC-SRD` instead: its
`README.md` states plainly it's a direct conversion of the official SRD
5.1 under CC-BY-4.0, with WotC's exact mandated attribution text
included. Spot-checked its Goblin and Ancient Red Dragon entries against
real SRD stat blocks (AC/HP/attacks/CR) — exact matches. 201 monsters
total ("hundreds," satisfying the Phase 2 checkpoint).

**Gap**: Tabyltop's repo only ships *structured* per-item JSON for
monsters — Classes/Spells/Items exist only as one large full-text SRD
dump, not per-record data. Turning that into structured rows needs a real
text parser, genuine future engineering, not ingested here.

**PF2e — blocked, deliberately not ingested.** This project requires
ORC-licensed content specifically, not Paizo's Community Use Policy
(CUP) — a separate, more restrictive fan-content license typically
incompatible with a paid commercial product. The most complete structured
PF2e dataset found (`Pf2ools/pf2ools-data`) explicitly reproduces Paizo's
rules text under CUP, not ORC (its own README says so). `paizo.com` was
unreachable from this build's sandboxed network egress policy, so
Paizo's own `/licenses` page — the authoritative source for what's
actually released under ORC — could not be checked directly.

## PF2e update — Homebrew tier unblocked, Import/Reflavor still blocked

Revisited after the initial pass, at Austin's request, checking two
specific sources (`legacy.aonprd.com`, a Paizo `PZOCUP...` PDF). Both
confirmed dead ends (OGL 1.0a + wrong ruleset era; Community Use Policy,
same problem as before) — but the research surfaced a real path: PF2e's
own monster-design MATH (GM Core's "Building Creatures" level/tier budget
tables) is game-balance numbers, not literary text, the same legal
category as the 5e DMG's CR table this project already uses. Found and
programmatically extracted (not hand-transcribed) a verified MIT-licensed
encoding of these tables (`miki4920/pf2e-monster-maker`), built
`lib/rulesets/pf2e/statFormulas.js`, `lib/rulesets/pf2e/enemyTemplate.js`
(a real, level-centric, trait-tagged PF2e stat block — genuinely
different layout from both Echoes' and 5e's), and
`prompts/rulesets/pf2e/enemyContentPrompt.js` + a `routes/generateEnemy.js`
pf2e branch — **Homebrew tier only**. `scripts/testPf2eStatFormulas.js`
hard-asserts known table values, a full monotonicity sweep (catches the
kind of transcription bug already found once in the 5e table), and
`buildCreatureBudget()` assembly across every role template.

This does not change the Import/Reflavor answer — those need actual
monster CONTENT under a verified ORC license, a separate question from
the math being safe. Requesting `mode !== 'homebrew'` on a pf2e world
gets an explicit 501, not a silent fallback.

**Verification is weaker here than the 5e table**: no second independent
PF2e source could be reached to cross-check every value (this sandbox's
network egress policy blocks essentially every TTRPG-adjacent domain
tried, including Wikipedia and the Wayback Machine, leaving only GitHub's
raw content host reachable). Confidence rests on internal consistency
(monotonicity across all 26 levels × 4 tiers, zero anomalies) and general
domain knowledge spot-checks, not independent cross-referencing. **Flagged
prominently in the module's own header comment — Austin should verify a
few rows against his own GM Core before trusting this for anything real.**

## Phase 4/5 update — Spells and Classes (5e, Homebrew tier)

Continued past the original Phases 1-3 stopping point at Austin's
request ("go ahead and start building out the rest... just as detailed,
not rushed"). Two more categories shipped with the same rigor:

**Spells** (`lib/rulesets/5e/spellFormulas.js`/`spellTemplate.js`,
`prompts/rulesets/5e/spellContentPrompt.js`, `routes/generateSpell.js`):
a brand-new category with no Echoes equivalent at all. This surfaced and
fixed a real bug in `middleware/requireCategoryAvailable.js` — its
`ruleset === 'echoes'` bypass was only ever safe because every
previously-gated category had a real Echoes registry entry; it broke for
a category Echoes has never had. Fixed by relying purely on
`hasCategory()`. The one genuinely formulaic piece of 5e spell design —
cantrip damage scaling at character levels 5/11/17 — is implemented and
verified against two real SRD cantrips (Fire Bolt, Chill Touch); no
"spell power budget" formula was invented, because the source material
doesn't have one. Frontend nav/index page deliberately not built (same
reasoning as Bestiary — `CATEGORY_LABELS` drives homepage behavior for
every world regardless of ruleset, and touching it without a real page
behind it risked breaking existing worlds).

**Classes** (`lib/rulesets/5e/classFormulas.js`/`classTemplate.js`/
`classRepo.js`, `prompts/rulesets/5e/classContentPrompt.js`,
`routes/generateClass.js`): real 1-20 leveling — proficiency bonus by
level, Ability Score Improvement levels, the correct subclass-unlock
level per class (Cleric/Sorcerer/Warlock 1st, Druid/Wizard 2nd, the rest
3rd — verified), and full spell slot tables for every caster type
including Warlock's structurally different Pact Magic. All cross-checked
against an independent source (5e-bits/5e-database's per-level JSON,
used only to verify NUMBERS — that project's actual content stays
excluded on the same OGL-1.0a grounds established in Phase 2). One
documented simplification: the base Ability-Score-Improvement pattern
(4/8/12/16/19) is implemented; Fighter's and Rogue's extra ASIs (6/14
and 10 respectively) are not modeled, flagged explicitly rather than
silently dropped.

Both categories: Homebrew tier only (no canonical CC-BY-4.0 data
available for either), PF2e and Generic-ruleset variants explicitly
deferred (not attempted), frontend UI deferred to Phase 11 alongside
Bestiary's.

## Phase 6 update — Items (5e, Homebrew tier)

`lib/rulesets/5e/itemFormulas.js`: real SRD weapon and armor lookup
tables (all 14 Simple + 21 Martial weapons, all 12 armors + shield) plus
the DMG's magic item rarity value-range table, cross-referenced against
5e-bits/5e-database's equipment JSON for numbers only (not a content
source). Unlike Bestiary/Classes, Items really is "mostly a lookup
table, not a derived formula" as the scope doc anticipated — the
verification bar here is correct transcription, not formula correctness,
which `scripts/test5eItemFormulas.js` hard-asserts against known SRD
stats. Homebrew generation resolves a magic weapon/armor's real damage
dice/AC from these tables plus the model's proposed base item + magic
bonus; a loose rarity-vs-price sanity check warns (never blocks) when a
proposed value looks off for its stated rarity. Same pattern as every
other category so far: Homebrew tier only, PF2e/Generic and frontend UI
deferred.

## Open question for Austin

**Has Paizo released actual Player Core / GM Core / Monster Core rules
TEXT under the ORC license itself** — as opposed to the ORC license just
being a legal template Paizo published for *other* publishers' own
original content? Those are different things, and the answer determines
whether Pathfinder 2e (Phase 9) can ever get a canonical import library
or ships Homebrew-only indefinitely. Check `paizo.com/licenses` directly,
or ask Paizo. If the answer is "no such release exists," the PF2e path
mirrors 5e's Homebrew tier only — never ingest CUP-licensed content into
`srd_library` regardless of how complete a dataset looks.

## Important finding (changes how CR should be presented to users)

Feeding real SRD monsters' real stats through the DMG's own CR formula
does not reliably reproduce their officially printed CR — verified by
hand-tracing the real Goblin (AC 15, HP 7, +4/1d6+2 attack) through the
algorithm: computes to CR 1/2, not its printed CR 1/4. Confirmed this
isn't an implementation bug by tracing the identical inputs through an
independent reference implementation (same result). This is a documented
property of 5e itself — the DMG frames the method as a starting estimate
for homebrewers, and WotC's own low-CR monsters are known to be hand-
tuned via playtesting, not purely formula-derived (the low end of the CR
scale has especially coarse bands). **Consequence, already implemented**:
Homebrew-generated monsters show their computed CR with an "(estimated —
review before play)" badge; Import/Reflavor entries show the real,
unmodified printed CR with no such badge.

## Bugs caught and fixed (during this build, before shipping)

1. `averageDamageFromDice()` can return a fractional average (e.g.
   "1d6+2" → 5.5), but the DPR lookup table's bands are contiguous whole
   numbers — an unrounded 5.5 wouldn't match any band. Fixed by rounding
   before the lookup. Caught by testing against real monster data, not
   code inspection.
2. A transcription bug in the independent reference CR table used to
   cross-check `CHALLENGE_THRESHOLDS` (CR-25's save DC listed as 11,
   breaking an otherwise-monotonic sequence across neighboring rows) —
   used the correct value (21) in this codebase's own table.
3. An early draft of the Reflavor route branch conflated `srdLibraryId`
   (the `srd_library` row's UUID primary key) with `srdSourceId` (the
   human-readable slug stored on a saved entry for display) — caught and
   fixed before it shipped; the route now requires `srdLibraryId`
   explicitly on every reflavor call, including regenerate.
4. **Real product-correctness gap, caught and fixed while writing this
   addendum**: only `routes/generateEnemy.js` was made ruleset-aware.
   Every other mechanically-Echoes-specific generation route (Classes,
   Items, Survivors — all three assume Echoes' BODY/REFLEX attribute
   system, 1–99 leveling, or the fixed weapon-skill list) was untouched,
   which meant a real user picking the 5e ruleset today could still
   generate an NPC/Class/Item/Survivor and silently get Echoes-flavored
   mechanics with no warning. Added `middleware/requireCategoryAvailable.js`
   and wired it into `generateClass.js`/`generateItem.js`/`generateSurvivor.js`
   — a non-Echoes world now gets an explicit 501 from those routes
   instead of silently wrong output. NPCs/Factions/Locations/Logs were
   deliberately left ungated — they have no mechanical stats in any
   ruleset today (verified by checking their prompt schemas for
   attribute fields) and are meant to stay shared/ruleset-agnostic per
   `world_forge_scope.md`'s registry design.

## What's deferred (explicitly, not silently)

Every phase below is scoped in the original session prompt but not
built. Each one is a substantial standalone subsystem in its own right —
attempting shallow, unverified versions of all of them in the time
remaining would have meant skipping the verification rigor Phases 1–3
demonstrated is actually necessary (real licensing checks, real formula
verification, real tests against real data). Better to ship 3 phases
solid than 13 phases unverified.

- **Phase 4 (Spells)** — new category end-to-end; blocked in part on the
  same "no structured CC-BY-4.0 spell dataset" gap noted above.
- **Phase 5 (Classes)** — the spec's own words: "biggest single rework."
  Needs real 1–20 leveling tables, correct per-class subclass-unlock
  levels, and real spell-slot progression tables for 5e, PLUS the
  Generic ruleset's world-configurable leveling system.
- **Phase 6 (Items)** — rarity bands + real mundane weapon/armor lookup
  tables.
- **Phase 7 (NPCs)** — default lightweight combat profile + "Combatant"
  upgrade path reusing Phase 3's monster pipeline (this one should be
  comparatively fast once Phase 5's class system exists, since NPCs
  mostly reuse other phases' work).
- **Phase 8 (Player Characters / Survivors rework)** — depends on Phase 5
  (a Player Character is "a Class instance with a name/background" per
  the spec).
- **Phase 9 (Pathfinder 2e)** — blocked on the open licensing question
  above for anything beyond Homebrew-only.
- **Phase 10 (Generic/Homebrew ruleset)** — world-configurable attributes
  and an optional derived-stat formula layer; needs Phase 5's leveling
  system as a dependency for the class side.
- **Phase 11 (Ruleset-Aware Edit Forms)** — `archive/js/render.js`'s edit
  forms are still Echoes-shaped. The 5e Bestiary's backend API contract
  (`mode`, `srdLibraryId`, `targetCr` on `POST /api/generate-enemy`) is
  real and tested at the function level, but no frontend UI exists yet
  for the three-tier picker (mode selection, SRD browse/import). This is
  the most immediately actionable next slice of work — the backend for
  one full category already exists and just needs a UI.
- **Phase 12 (Differential Billing)** — Import already refunds its
  generation-cap spend immediately (implemented ad hoc in
  `routes/generateEnemy.js` rather than waiting for this phase, since a
  free import shouldn't cost points even before the full billing rework
  lands), but Reflavor's reduced cost and the entry-cap import-bypass are
  not built. Zero practical impact today since `BILLING_ENABLED` is off
  by default.
- **Phase 13 (Regression Pass)** — done incrementally after every phase
  in this build (server boot smoke tests, route dispatch checks, `node
  -c` syntax checks on every touched file, `scripts/test5eStatFormulas.js`
  passing) rather than as one final pass, since that's effectively what
  "checkpoint after every phase" already required. Full DB-backed
  regression (a real Echoes generation cycle end-to-end,
  `scripts/testTenantIsolation.js` against the real project) could not
  be run in this sandboxed environment — no real Supabase/Anthropic/
  Gemini credentials were available. **Austin should run the real
  Phase 1 checkpoint and `scripts/testTenantIsolation.js` against the
  actual Supabase project before trusting this further.**

## Recommended next session's starting point

1. Apply `migrations/020_ruleset_foundation.sql` by hand against Supabase
   (per this repo's usual migration process), then run
   `node scripts/ingestSrd5e.js` for real.
2. Verify the real Phase 1 checkpoint (non-admin ruleset picker options,
   admin sees all 4, pre-migration worlds read `ruleset='echoes'`) and
   `scripts/testTenantIsolation.js` against production data.
3. Build Phase 11's frontend for the 5e Bestiary specifically (mode
   picker, SRD browse/import UI) — the backend contract already exists
   and is tested; this is the fastest path to something Austin can
   actually click through.
4. Resolve the PF2e ORC-vs-CUP licensing question directly with Paizo
   before writing `scripts/ingestSrdPf2e.js` for real.
5. Phase 5 (Classes) is the correct next backend phase — Phases 7 and 8
   both depend on it.
