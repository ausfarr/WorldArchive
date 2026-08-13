# Claude Code Session Prompt — R5: SRD Ingestion Unblock + Import/Generate Split + Small Fixes

Clone `ausfarr/WorldArchive` fresh at the start of this session — do not
rely on any stale project-knowledge summary for current file structure.
Work in Accept Edits mode. **Checkpoint with one commit per phase below,
and stop after each phase for review — do not self-extend past a phase
boundary even if the next one looks like an obvious continuation.** This
project's own history (`session_addendum_ruleset_recovery_plan.md`) is
the reason that rule exists — read that file and
`session_addendum_r4_5e_completeness_shipped.md` first for context before
touching anything, since this session picks up directly where R4 left
off.

Every phase below was scoped in a chat session against the real repo
(fresh clone, not stale project knowledge) — this isn't a guess at what
might be wrong, it's diagnosed root causes. Where a phase says "confirmed
via direct inspection," take that as read rather than re-diagnosing from
scratch, but DO re-verify anything you're about to build against, since
the repo may have moved since this prompt was written.

---

## Phase 1 — DB unblock: `entries_category_check` missing `'spells'`

**Root cause (confirmed):** `entries.category` has a CHECK constraint
that predates the `migrations/` folder (same "blind spot" class of bug
as the old Locations issue — see that migration's own history). No
migration through `023` ever adds `'spells'` to it. Every attempt to
write a spell entry — AI-generated OR procedural ("Roll Randomly") —
generates fine and then fails silently at the final DB write. This is
almost certainly why Austin is seeing "Roll Randomly doesn't work" for
Spells specifically (and would equally break AI-generated Spells'
confirm-entry step, whether or not he's hit that yet).

**Fix:** new migration, `migrations/024_spells_category_check.sql`.
Follow the exact pattern the Locations fix used (drop + re-add the
constraint with the full current category list) — do NOT hand-edit an
existing migration file. The authoritative current category list is
`archive/js/render.js`'s `CATEGORY_LABELS`: `factions`, `npcs`,
`enemies`, `classes`, `items`, `spells`, `logs`, `survivors`,
`locations`. Confirm this list against any other place categories are
enumerated (`lib/entriesRepo.js`, `routes/confirmEntry.js`'s `WRITERS`
map) before writing the constraint, in case something's been added since
this prompt was written.

**Verification:** `node -c` on the new file isn't meaningful for SQL —
instead, read the migration back and confirm the CHECK clause literally
contains all 9 values, and confirm no other code path assumes a
different/shorter category list that this migration would now be
inconsistent with.

**Austin must run this by hand in the Supabase SQL editor** — same as
every migration in this repo. State this plainly in the session
addendum; don't imply it auto-applies.

---

## Phase 2 — World Info: Attributes/Skills showing on non-Echoes worlds

**Root cause (confirmed):** `/api/wizard/review` (`routes/wizardReview.js`)
never returns the world's `ruleset` in its response payload at all, so
`archive/world-info.html`'s `renderContent()` has no way to gate the
Attributes/Skills sections — they always render (as an empty "Not
configured yet." state) regardless of ruleset. `CANONICAL_STATS` and the
weapon/field-skill display in that file are Echoes' own stat/skill
system (`stat_system_json`/`skill_system_json`) — a 5e or Generic world
was never going to populate those columns in the first place, since
neither uses them.

**Fix:**
1. `routes/wizardReview.js` — add `ruleset: await getRuleset(req.worldId)`
   to the response (reuse `getRuleset` from `lib/worldConfigRepo.js`,
   already imported elsewhere in this codebase's routes).
2. `archive/world-info.html`'s `renderContent(data)` — only render the
   Attributes and Skills sections when `data.ruleset === 'echoes'` (or
   is missing/undefined, to fail open for any pre-ruleset world data).
   For every other ruleset, skip both sections entirely — same "absent
   entirely, not just empty" treatment the Races/Species section already
   gets for non-5e worlds (read that block first and match its pattern).

**Explicitly out of scope this phase (flag, don't build):** a Generic
world has its own `generic_system_json` attribute system and arguably
deserves its own World Info section reading from it instead of just
disappearing — that's a real future enhancement, not a bug fix. Leave a
one-line TODO comment where the gate goes, but don't build the Generic
section now.

**Verification:** headless-browser or direct-render check (same
`playwright-core`, temp-installed, `--no-save` pattern prior sessions in
this repo have used) confirming the Attributes/Skills sections are
present for an Echoes-ruleset payload and absent for a 5e-ruleset
payload.

---

## Phase 3 — NPC/Survivors import button placement

**Root cause (confirmed):** `archive/js/render.js`'s
`wireImportCharacterButton()` (shared by the NPCs and Survivors index
pages) appends the "Import Character" button directly onto `#gen-form`,
landing it as a second always-visible top-level button next to
"+ Create Entry" — outside the staged-reveal flow entirely. Enemies'
own Import button (a different, page-local implementation,
`promoteImportToStage1()` in `archive/enemies/index.html`) instead lives
*inside* Stage 1 of the "+ Create Entry" collapse, next to "Generate
with AI" / "Enter Manually" / "Roll Randomly" — appearing only after the
user clicks "+ Create Entry".

**Fix:** change `wireImportCharacterButton()` in `render.js` so the
button is inserted into `#create-entry-stage1-row` instead of appended
to `#gen-form`. `wireCreateEntryCollapse()` already runs synchronously
before `wireImportCharacterButton()` is called on both the NPCs and
Survivors pages (confirm this ordering is unchanged in both
`archive/npcs/index.html` and `archive/survivors/index.html` before
relying on it) — so `#create-entry-stage1-row` will already exist in the
DOM by the time this function runs; no polling/`whenReady` needed, unlike
the enemies page's page-local version (which needed it for a different
reason — don't copy that complexity over unnecessarily).

Since this is shared code, this fixes both NPCs and Survivors in one
change — that's intentional, confirmed with Austin.

**Verification:** headless-browser pass confirming the Import button is
absent at Stage 0, appears in the Stage 1 row alongside the other three
buttons after clicking "+ Create Entry", and still opens the same
paste/upload modal on click — on both the NPCs and Survivors pages.

---

## Phase 4 — SRD ingestion: `downfallx/dnd-5e-srd-markdown`

**Context:** the prior session's R4 addendum
(`session_addendum_r4_5e_completeness_shipped.md`) verified
`5e-bits/5e-database` and correctly rejected it (blanket MIT+OGL
license, no CC-BY-4.0 anywhere, and no Spells data at all in its
`src/2024/` directory). Austin separately found
**`downfallx/dnd-5e-srd-markdown`** — a different repo, already
independently verified in the scoping chat for this session:

- Its `README.md` states plainly: *"The complete D&D 5e (2024) System
  Reference Document 5.2.1 converted to clean, developer-friendly
  Markdown format... released under the Creative Commons Attribution 4.0
  International License"* — genuine, unambiguous CC-BY-4.0, not a
  blanket-repo MIT+OGL statement like the rejected source.
- It ships the exact WotC-mandated attribution text (reproduce this
  verbatim into `LICENSE_NOTE`, same as `scripts/ingestSrd5e.js` already
  does for the monster source — do not paraphrase it).
- It has real content for every category the old source was missing:
  `spells.md` (500+ spells), `equipment.md` (weapons/armor/gear/tools),
  `classes.md` (all 12 core classes + subclasses), `feats.md`,
  `magic-items.md`.
- Confirmed reachable from this sandbox's network egress (raw file URLs
  200 OK): `https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/{spells,equipment,classes,feats,magic-items}.md`.

**Re-verify this yourself before ingesting anything** — clone the repo
fresh, read the actual README/LICENSE content directly rather than
trusting this summary, same diligence bar Phase 4 of R4 applied to the
rejected source. If anything about the license looks different from
what's described above, stop and flag it rather than proceeding.

**What to build:** `scripts/ingestSrd5eFull.js` (new file, don't touch
`scripts/ingestSrd5e.js` — that one owns monsters from a different
source and should stay untouched, matching this project's "each source
gets its own script" convention). Follow `ingestSrd5e.js`'s existing
shape closely (idempotent upsert on `(ruleset, category, srd_id)`,
`LICENSE_NOTE` constant reproduced verbatim, `slugify()` for `srd_id`,
service-role Supabase client, `node scripts/ingestSrd5eFull.js` run
instructions in the file header).

Ingest **all five categories** this session (Austin's call): Spells,
Equipment (→ `srd_library.category = 'items'`, matching the existing
`items` category convention used elsewhere in this schema — confirm
against `migrations/020`'s own comment listing valid category values,
extending it if needed for `'feats'`/`'magic-items'` as new category
strings), Classes, Feats, Magic Items.

**This is real markdown/HTML-table parsing, not a structured JSON
ingest** — the source files mix prose, `##`/`###` headers, and embedded
raw `<table>` HTML (confirmed by sampling `spells.md` directly: it opens
with prose and preparation-rules tables before the actual per-spell
stat-block entries begin further down the file). Treat this with the
same rigor the old scope doc demanded before it was rejected: **"if
unsure, flag rather than guess."** Concretely:

- Write a real parser per file (regex/markdown-AST, your choice) that
  isolates individual entries (one spell/class/feat/item each) from the
  surrounding rules prose — don't naively ingest section headers or
  rules-text tables as if they were entries.
- Store the full parsed record in `data_json`, mirroring the level of
  fidelity `ingestSrd5e.js` already achieves for monsters (name, and
  every mechanically relevant field: for spells — level, school, casting
  time, range, components, duration, classes, description, at-higher-
  levels text; for classes — hit die, primary ability, saving throw
  proficiencies, subclass list; for items — cost, weight, damage/AC/
  properties as applicable; for feats — prerequisite, benefit text; for
  magic items — rarity, attunement, effect text).
- **Mandatory spot-check verification, same bar as the Goblin cross-check
  `ingestSrd5e.js`'s own header documents:** hand-verify at least 5 spells
  (include Fireball, Fire Bolt, and Cure Wounds — commonly-known enough
  to sanity-check by hand), 3 classes (hit die + primary ability), and 3
  items against their real, well-known SRD stats before trusting the
  parser on the full file. Write these checks into the script's own
  header comment or a companion `scripts/verifySrd5eFullIngest.js`, the
  same way this project always documents its verification trail rather
  than asserting correctness silently.
- If any category's source formatting turns out to be too irregular to
  parse reliably within reasonable effort (real risk, especially for
  `magic-items.md` and `classes.md`'s subclass tables) — **stop and flag
  that specific category as deferred, ship the others.** Do not guess at
  a lossy parse just to hit "all five" if one category's real structure
  resists it. Partial, verified success beats complete, unverified
  success, per this project's own established standard.

**No live Supabase in this sandbox** (standing limitation, same as every
prior session) — the script itself should be fully written and
syntax-checked, but Austin has to trigger the real run himself. **This
repo has no shell access on Render and no local dev environment, so
`node scripts/ingestSrd5eFull.js` is not something Austin can actually
run directly** — same reason `routes/adminIngestSrd.js` exists as an
HTTP wrapper around `scripts/ingestSrd5e.js`. Build the equivalent for
this script: export the ingestion function(s) from
`scripts/ingestSrd5eFull.js` the same way `ingestSrd5e.js` exports
`ingestMonsters`, then add a new admin-gated GET route (either a new
`routes/adminIngestSrdFull.js`, mirroring `adminIngestSrd.js` exactly —
`isAdminEmail` check, mount it in `server.js` the same way the existing
one is mounted — or a second route added to the existing file if that
reads cleaner; your call). Route it at something like
`/api/admin/ingest-srd-5e-full`, and have it return a per-category count
in its JSON response (spells/items/classes/feats/magic-items upserted)
so Austin can see the result without checking Supabase directly.

Austin triggers it the same way the original ingestion was triggered:
while logged into the app, open the browser's dev tools (F12) → Console,
and run
`authFetch('/api/admin/ingest-srd-5e-full').then(r => r.json()).then(console.log)`
— `authFetch` is already a global on every page (`archive/js/auth.js`)
and attaches the Bearer token a plain URL visit wouldn't have. State the
exact route path and this console command in the session addendum so
it's easy to find later.

---

## Phase 5 — Wire real Import/Reflavor/Homebrew into Items and Classes

**Context:** Items and Classes currently have **zero** import
capability — no mode picker, no SRD dropdown, nothing (confirmed: no
`mode-btn-import` or SRD-picker markup exists in either
`archive/items/index.html` or `archive/classes/index.html` today).
Enemies' existing three-tier pattern (`routes/generateEnemy.js`'s
`handle5eEnemyGenerate`, `archive/enemies/index.html`'s mode-btn UI) is
the proven template — read it in full before starting this phase.

Build the same three-tier pattern (Import / Reflavor / Homebrew) for
Items and Classes on 5e worlds, now that Phase 4 actually populates
`srd_library` for both categories:

- `routes/generateItem.js` — add a `handle5e...Generate`-style dispatch
  (or extend the existing 5e branch if one already exists — check
  first) with the same `mode` contract (`import`/`reflavor`/`homebrew`),
  `srdLibraryId` lookup via `getSrdEntry`, `recordImport`/
  `isAlreadyImported` bookkeeping, and generation-cap refund on Import,
  mirroring `handle5eEnemyGenerate` structurally.
- `routes/generateClass.js` — same pattern.
- `archive/items/index.html` / `archive/classes/index.html` — add the
  mode-btn picker + SRD dropdown, mirroring Enemies' markup and
  `updateModeVisibility()`/submit-label logic.

**Build this with the corrected Import/Generate split from the start**
(see Phase 6 below for why) — don't build the old nested version and
then immediately redo it. Import is its own Stage-1 action showing ONLY
the SRD picker; "Generate with AI" is its own Stage-1 action showing
ONLY Reflavor/Homebrew. There is no reason to build the confusing
version first.

**Verification:** same bar as Phase 4 of R4 — server boot test,
`node -c` on every touched file, headless-browser pass confirming the
new mode-btn UI renders and the right fields show/hide per mode, for
both Items and Classes.

---

## Phase 6 — Fix Import vs Generate-with-AI showing the same screen

**Root cause (confirmed):** on Enemies today, both the "Import (free)"
button and "Generate with AI" button reveal the exact same Stage-2 panel
— all three mode buttons (Import/Reflavor/Homebrew) visible together,
just with a different one pre-clicked (`promoteImportToStage1()`'s click
handlers in `archive/enemies/index.html`). That's why Austin sees them
as "the same thing."

**Scope, confirmed with Austin (the smaller of two options considered —
no new paste-text/file-upload import, no backend importText path):**

- Clicking **Import** shows ONLY the SRD-database picker (the dropdown +
  Import submit button) — hide the Reflavor/Homebrew mode buttons
  entirely while in this view, not just leave them visible-but-unselected.
- Clicking **Generate with AI** shows ONLY Reflavor/Homebrew (the mode
  toggle between just those two, plus their respective fields) — Import
  is not reachable from this button at all.
- Both are still reachable from Stage 1's two separate buttons, same as
  today — this is purely about what's visible after the click, not a
  new entry point.

Implementation approach: rather than showing/hiding individual
`.mode-btn` elements ad hoc, cleanest is two distinct sub-views inside
Stage 2 (e.g. toggle a `data-source` attribute or two separate
`<div>`s) that `promoteImportToStage1()`'s two click handlers switch
between, instead of both just calling the existing single
`updateModeVisibility()` against the full 3-button set. Keep the
underlying `mode` value/submit contract to the backend completely
unchanged (still `import`/`reflavor`/`homebrew`) — this is a
presentation-layer fix only.

**Apply this same split to Items and Classes** (Austin: "carry this
wherever else needed") — since Phase 5 builds their mode-btn UI fresh,
build it with this split baked in from the start rather than fixing it
twice. Extract the shared "two-sub-view Stage 2" logic into `render.js`
if the markup ends up identical across all three category pages, rather
than copy-pasting three page-local implementations — use judgment on
whether the categories' field layouts are similar enough to make that
worthwhile, or whether page-local (matching Enemies' current pattern) is
actually cleaner given each category's different field set. Either is
fine; document which you chose and why in the session addendum.

**Verification:** headless-browser pass on all three pages (Enemies,
Items, Classes) confirming Import-clicked view shows zero Reflavor/
Homebrew UI and AI-clicked view shows zero Import/SRD-picker UI.

---

## Verification bar for the whole session (apply throughout, not just at the end)

- `node -c` syntax check on every modified/new `.js` file, every phase.
- Server boot test with dummy env vars after each phase.
- Headless-browser pass (real Chromium via `playwright-core`, temp-
  installed `--no-save`, real running Express app, stubbed `/api/*`
  calls via route interception) per phase, matching R3/R4's established
  pattern — this sandbox has no reachable Supabase project, same
  standing limitation every prior session has carried.
- One commit per phase, stop after each for Austin's review.
- Produce `session_addendum_r5_srd_ingestion_and_import_fixes.md` at the
  end (or incrementally per phase, your call), documenting exactly what
  shipped, what got deferred/flagged (especially any SRD category from
  Phase 4 that didn't parse cleanly), and what Austin still needs to run
  by hand (migration 024, the ingestion script).

## What NOT to do

- Don't touch `scripts/ingestSrd5e.js` (monsters) — different source,
  stays as-is.
- Don't build paste-text/file-upload import for Enemies/Items/Classes —
  explicitly descoped this session (see Phase 6).
- Don't build a Generic-ruleset World Info Attributes section — flagged
  as future work in Phase 2, not built now.
- Don't self-extend into R4's "Suggested next session" items (a real
  browser click-through against a live deployed app) — separate,
  unrelated future session.
