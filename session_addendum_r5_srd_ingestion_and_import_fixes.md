# Session Addendum: R5 — SRD Ingestion + Import/Reflavor Fixes (shipped)

Written retroactively by the R6 session (see `session_addendum_r6_srd_content_backfill.md`)
— R5 itself shipped six phases plus two follow-up commits, all on
2026-08-13, with no addendum file and no CHANGELOG entry ever written.
Reconstructed from the real commit messages (`git log --oneline | grep
"R5 Phase"`, `git show` on each of the eight commits) rather than from
`session_prompt_r5_srd_ingestion_and_import_fixes.md`'s original plan,
which may not match what was actually shipped. Where a commit's own
message already documents verification method and findings in detail,
this addendum summarizes rather than repeats it.

## Phase 1 — `entries_category_check` missing `'spells'`

`entries.category`'s CHECK constraint predates the `migrations/` folder
and was never updated when the `spells` category was added later —
every spell write (AI-generated or procedural "Roll Randomly") failed
silently at the DB layer. This was the confirmed root cause of Spells'
"Roll Randomly doesn't work" report.

New `migrations/024_spells_category_check.sql` — drops and re-adds the
constraint with the full current 9-category list (`factions`, `npcs`,
`enemies`, `classes`, `items`, `spells`, `logs`, `survivors`,
`locations`), same drop+re-add pattern `migrations/020`/`022` already
used for `world_config_ruleset_check`. Idempotent-safe. **Requires
Austin to run it by hand in the Supabase SQL editor** — no session
before R6 had a way to confirm whether this had actually happened (see
R6's Phase 0 for the first real attempt at checking).

## Phase 2 — Gate World Info Attributes/Skills to Echoes rulesets

`/api/wizard/review` never returned the world's `ruleset`, so
`world-info.html` had no way to hide the Attributes/Skills sections on
non-Echoes worlds — they always rendered as an empty "Not configured
yet." state regardless of ruleset, since `stat_system_json`/
`skill_system_json` are Echoes-only concepts.

`routes/wizardReview.js` now includes `ruleset` in its response
(reusing `getRuleset` from `lib/worldConfigRepo.js`); `world-info.html`'s
`renderContent()` only renders both sections when `ruleset` is
`'echoes'` or missing/undefined (fails open for pre-ruleset world data)
— same "absent entirely, not just empty" treatment the Races/Species
section already gets for non-5e worlds. A Generic-ruleset attribute
section reading from `generic_system_json` was flagged as a real TODO,
not built here.

Verified via a direct-render headless Chromium pass calling the page's
own `renderContent()` with `echoes`/`5e`/undefined ruleset payloads.

## Phase 3 — Move Import Character into the Stage 1 create-entry row

`wireImportCharacterButton()` (shared by NPCs and Survivors) previously
appended the "Import Character" button directly onto `#gen-form`,
landing it as a second always-visible top-level button next to
"+ Create Entry" — outside the staged-reveal flow entirely. Moved into
`#create-entry-stage1-row` (before the Cancel button), matching
Enemies' own Import button placement: visible only after "+ Create
Entry" is clicked, alongside Generate with AI / Enter Manually / Roll
Randomly. Fixed both NPCs and Survivors in one change since the
function is shared.

Verified via headless Chromium against the real running app on both
pages.

## Phase 4 — Ingest real SRD Spells/Equipment/Classes/Feats/Magic Items

The biggest phase. New `scripts/ingestSrd5eFull.js` (kept separate from
`scripts/ingestSrd5e.js`, which stays untouched — that one owns
Monsters from a different source). Source: `downfallx/dnd-5e-srd-markdown`,
re-verified fresh this session (cloned directly, read `README.md` and
`LICENSE`): genuine, unambiguous CC-BY-4.0 for the real SRD 5.2.1 text
— distinct from the already-rejected `5e-bits/5e-database`'s blanket
MIT+OGL statement (see R4 Phase 4's own verification for that earlier
rejection).

Real markdown/HTML-table parsing, not structured JSON — a dedicated
parser per category:
- **Spells, Feats, Magic Items** share a `#### Name` + italic-meta-line
  shape.
- **Classes** are `## ClassName` sections with a 2-column Core Traits
  table, leveled features, and exactly one SRD sample subclass per
  class.
- **Equipment** splits into clean Weapons/Armor HTML tables plus two
  more irregular prose shapes for Adventuring Gear and Tools.

All five categories parsed cleanly — none needed to be deferred.
Equipment goes into `srd_library.category = 'items'` (existing
convention); `feats`/`magic-items` are two new category strings, safe
to add without a migration since `srd_library.category` has no CHECK
constraint, only a documentation comment (not hand-edited — extended in
the ingestion script's own header instead, per this project's "don't
edit shipped migrations" convention).

`scripts/verifySrd5eFullIngest.js` is the mandatory spot-check trail as
a runnable script: re-fetches the source fresh and re-runs the real
parsers, asserting real known values for Fireball/Fire Bolt/Cure
Wounds/Magic Missile/Shield (spells), Fighter/Wizard/Sorcerer (classes),
Chain Mail/Studded Leather/Longsword (equipment), and Bag of
Holding/Cloak of Protection/Ring of Protection (magic items) — all
passed at the time this phase shipped. A `--live` flag adds the same
checks against real `srd_library` rows once actually run.

**Real finding, flagged not reconciled this session:** the free SRD's
Feats list (17 feats total) does not overlap with R4 Phase 5's
hand-authored fallback list (Athlete, Durable, Dual Wielder, Great
Weapon Master, Lucky, Mobile, Resilient, Sentinel, Tough) — those are
full-PHB-only feats, not real SRD content. (R6 Phase 3 later replaced
the hand-authored list with the real 17 and built the real Background →
Origin Feat mechanic on top of it.)

No live Supabase reachable in this sandbox — the phase's own commit
message states Austin needs to run `node scripts/ingestSrd5eFull.js`
for real, with `SUPABASE_URL`/`SUPABASE_SECRET_KEY` set.

## Phase 5 — Wire Import/Reflavor/Homebrew into Items and Classes

Both categories previously had zero import capability on 5e worlds —
Homebrew tier only. Now that Phase 4 populates `srd_library` for both,
they get the same three-tier pattern Enemies already had: `import`
(zero AI cost, direct copy), `reflavor` (AI rewrites narrative only,
mechanics untouched), `homebrew` (unchanged).

New `lib/rulesets/5e/srdItemMapper.js` and `srdClassMapper.js` convert a
`srd_library` row's raw `data_json` into the shapes `itemTemplate.js`/
`classTemplate.js` already expect — same role `srdMonsterMapper.js`
plays for Enemies. The class mapper reuses `classFormulas.js`'s own
hand-verified saving-throw/subclass-unlock tables rather than
re-parsing ingested text, since an imported class's name always matches
one of the 12 core classes exactly.

Built with the corrected Import/Generate UI split from the start (per
what became Phase 6's scope, rather than shipping Enemies' then-current
nested version and redoing it): `archive/items/index.html` and
`archive/classes/index.html` each get two separate Stage-2 sub-views —
clicking "Import (free)" reveals ONLY the SRD picker; clicking
"Generate with AI" reveals ONLY a Reflavor/Homebrew toggle — never both
at once.

Verified: `node -c` on every touched/new file and extracted inline
`<script>` blocks; server boot test (every new/touched route 401s, not
404/500); mapper output hand-checked against real parsed SRD data
(Fighter d10/Str-Dex/subclass Champion at level 3; Longsword/Chain
Mail/Studded Leather mechanics all correct); headless Chromium pass on
both pages.

## Phase 6 — Fix Import vs Generate-with-AI showing the same screen

Root cause on Enemies (Items/Classes already shipped correctly in Phase
5): both "Import (free)" and "Generate with AI" revealed the exact same
Stage-2 panel — all three mode buttons visible together, just with a
different one pre-clicked — so Import read as a hidden sub-option of an
AI feature rather than its own first-class action. Applied the same
two-separate-sub-views fix to Enemies.

Extracted the shared promotion/toggle mechanics into
`archive/js/render.js` (`whenReady`/`promoteImportToStage1`) and
`archive/css/style.css` (`.mode-btn`/`.mode-btn-tag`/`.mode-btn-active`)
once a third page needed the identical logic Items/Classes' page-local
copies already had — removed those now-redundant page-local copies.
Each category's actual field layout stays page-local; only the
promotion/toggle mechanics are shared.

Verified: `node -c`; server boot test; headless Chromium pass on all
three pages confirming Import-clicked shows zero AI UI and vice versa;
re-ran the Phase 2 and Phase 3 verification scripts to confirm the
shared `render.js`/`style.css` changes didn't regress them.

## Follow-up 1 — Real-usage bug fixes found after the 6-phase session

Reported by Austin against a real running instance, plus a full audit
of the same code paths the six phases built:

1. **Classes:** a static "Generates a full Level 1-99 progression tree"
   hint (Echoes-only text) showed on every ruleset regardless of which
   form actually rendered. Gated behind `wireEchoesClassForm()`.
2. **Spells never got Import/Reflavor wiring** — Phase 4 ingested real
   SRD spell data, but Phase 5's scope was explicitly Items/Classes
   only. Added `lib/rulesets/5e/srdSpellMapper.js`,
   `buildReflavorSpellSystemPrompt`, `routes/generateSpell.js` mode
   dispatch, and the same corrected-split mode-btn UI.
3. **CC-BY-4.0 attribution gap:** `enemyTemplate.js` already rendered a
   "Source: import/reflavor" badge + license text for Import/Reflavor
   entries, but `itemTemplate.js`/`classTemplate.js`/`spellTemplate.js`
   (built this session) never did, despite storing the same
   `srdSourceId`/`srdLicenseNote` fields. Added the identical badge +
   license-note block to all three, plus fixed `classTemplate.js`'s
   manifest tag (hardcoded `"homebrew"` regardless of real
   `sourceMode`).
4. **Regenerate was broken on every Import/Reflavor-sourced entry, all
   four categories** — a pre-existing gap from the original ruleset
   project, not new this session, but fixed everywhere it appeared:
   the generic card "Regenerate" button only ever posts
   `{ fillExistingId }`, never `srdLibraryId`, so the route's own
   "Import/Reflavor mode requires srdLibraryId" check always fired.
   Added `lib/srdLibraryRepo.js`'s `getSrdEntryBySlug()` (safe:
   `(ruleset, category, srd_id)` is unique) so every generate route can
   recover `srdLibraryId` server-side from the entry's own saved
   `srdSourceId`.
5. **`srd_library`'s default query limit (200)** silently truncated the
   Spells Import/Reflavor picker to 200 of 349 real spells. Bumped to
   500.

Verified: `node -c`; server boot test; full headless Chromium
regression across all four 5e mode-btn pages plus the Phase 2/Phase 3
verification scripts, all still passing.

## Follow-up 2 — Remove FACTION field from 5e Items

Austin's call after reviewing: 5e Items never needs a faction concept
at all (unlike Enemies/NPCs/Locations, where "faction-issued gear" is a
real fit) — removed from all three tiers, not just selectively.
`factionOptionsText` stays in the Reflavor/Homebrew prompt context as
grounding for the model's flavor text — unrelated to the user-facing
field being removed.

## The "done" matrix — final state at end of R5

| Phase | Item | Status |
|---|---|---|
| 1 | `spells` added to `entries_category_check` | **Shipped**, migration written, needs Austin to run it |
| 2 | World Info Attributes/Skills gated to Echoes | **Shipped**, verified headless |
| 3 | Import Character moved to Stage 1 row | **Shipped**, verified headless |
| 4 | Real SRD Spells/Equipment/Classes/Feats/Magic Items ingested | **Shipped**, not yet run against production |
| 5 | Import/Reflavor/Homebrew for Items + Classes | **Shipped**, verified headless |
| 6 | Import vs Generate-with-AI UI fix (Enemies) | **Shipped**, verified headless |
| — | Spells Import/Reflavor (follow-up) | **Shipped** |
| — | CC-BY-4.0 attribution badges (Items/Classes/Spells) | **Shipped** |
| — | Regenerate fix for all Import/Reflavor entries | **Shipped** |
| — | Items FACTION field removed | **Shipped** (Austin's call) |

## Explicitly flagged, not fixed / not built by R5

- **The real 260 Magic Items ingested but never wired to anything** —
  Phase 4 ingested `srd_library.category = 'magic-items'` in full, but
  Phase 5's Import/Reflavor scope was Items (mundane equipment) and
  Classes only, and no later R5 phase or follow-up picked Magic Items
  back up. Zero route/UI references anywhere in the repo at the end of
  R5. (Closed by R6 Phase 4.)
- **The 17 real Feats ingested but never wired to Backgrounds** — R4
  Phase 5's hand-authored Feats/Backgrounds fallback stayed in place;
  Phase 4's real ingestion of `feats`/`backgrounds`-shaped data (feats
  only — Backgrounds specifically were never ingested by R5 at all,
  since `character-origins.md` was the one source file R5's ingestion
  script never touched) sat unused. (Closed by R6 Phases 1 and 3.)
- **No migration verification** — Phase 1's `migrations/024` was
  written but never confirmed live; no session before R6 had real
  Supabase access to check.
- **No CHANGELOG entry, no addendum** — this document and the R6
  CHANGELOG update close that gap retroactively.

## Suggested next session (as it stood at the end of R5)

- Ingest `character-origins.md` (Backgrounds + Species) — the one
  source file this ingestion pass never touched.
- Wire the real 260 Magic Items into Items' Import tier.
- Replace R4 Phase 5's hand-authored Backgrounds/Feats with the real
  ingested ones, including the real 2024 Background → Origin Feat
  mechanic.
- Confirm migration `024` (and any others still pending) are actually
  live against production.

(All four picked up by R6 — see `session_addendum_r6_srd_content_backfill.md`.)
