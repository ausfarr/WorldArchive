# Addendum — v0.9 Manual Mode, Piece 3: Manual Wizard Path (shipped)

Follow-up to `session_addendum_field_assist_shipped.md`. Closes out the
three-piece v0.9 plan from `session_addendum_manual_entry_mode_shipped.md`
(Piece 1: full manual entry, Piece 2: field-level "Help me", Piece 3:
manual wizard path). **v0.9 is now fully shipped.**

## State check at session start

Cloned the repo fresh and confirmed it matches
`session_addendum_field_assist_shipped.md` exactly — `lib/version.js` at
`v0.10`, all 24 pages cache-busted, `lib/fieldAssistFields.js`,
`migrations/015_field_assist_points.sql`, the generalized
`enforceGenerationCap`/`enforceFieldAssist`, and `pointsToGenerations()`
all present and matching. No drift since that addendum.

## The real finding: most of "Piece 3" was already built

Before writing any code, read through all 8 wizard steps expecting a
real build. It mostly wasn't needed — the free-text-field pattern used
in Steps 1, 4, 5, 6, and 7 was already manual-first, with "Generate for
me" as pure optional assist rather than a gate:

- **Step 1 (Seed/Vision):** plain inputs/selects; only Core Tension has
  a Generate button.
- **Steps 2–3 (Lore):** "Import Existing" already lets you paste or
  upload a doc with zero AI calls — this path pre-existed.
- **Step 4 (Factions):** every field (concept, politics, government,
  economy, military, tensions) is a free-text input; Generate is
  per-slot and optional.
- **Step 5 (Stats & Skills):** stat labels and skill names are plain
  text inputs.
- **Step 6 (Style Guide):** every style field is a textarea/color
  input, fully typeable.
- **Step 7 (Categories):** labels/toggles are manual; Generate is
  optional.
- **Step 8 (Review):** no AI calls at all.
- No save route on any step has server-side validation that requires a
  field to have been AI-generated — manual-only saves already worked.

**The one real gap:** `archive/wizard-style.html`'s `save-style` handler
unconditionally fired `POST /world-art/generate-mood-board` and
`POST /world-art/generate-faction-banners` the instant Step 6 was
saved — regardless of whether any Generate button on that page was
ever touched. Un-gated by the points cap by design (bounded, one-time
setup cost, same reasoning as the map backdrop), but it did call Claude
Haiku (art prompt) + Gemini (image) on every world, every time. That
auto-fire was the actual scope of Piece 3.

## What shipped

### 1. Step 6 now offers a real choice instead of auto-firing

`archive/wizard-style.html`: "Save & Continue" now only saves the style
guide fields, then swaps in an **art-choice panel** — "Generate World
Art" or "Skip for now" — instead of immediately calling the two art
routes and redirecting.

- **Generate World Art** — same behavior as before (parallel mood-board
  + faction-banners calls, same loading overlay), then redirects to
  Step 7.
- **Skip for now** — redirects to Step 7 immediately. Zero Claude/Gemini
  calls for a world that goes this route.

### 2. Skipped art stays generatable/uploadable later, same pattern as entry portraits

New shared script `archive/js/worldArtActions.js`, mirroring
`portraitActions.js`'s "no portrait yet" pending-slot pattern
(Generate Image / Upload Image buttons, reusing the existing
`.portrait-slot` / `.portrait-actions` / `.portrait-action-btn` CSS
classes rather than inventing new ones):

- **World mood board** — `world-info.html`'s `loadWorldMoodBoard()` now
  renders a pending slot (via `renderMoodBoardPendingSlot`) instead of
  just hiding the section when no board exists yet.
- **Faction banner** — `render.js`'s `renderFactionBanner()` now renders
  a pending slot (via `renderFactionBannerPendingSlot`) on a faction's
  dossier page instead of leaving the section empty when that faction
  has no banner yet.

### 3. New routes in `routes/worldArt.js`

- `POST /world-art/generate-faction-banner/:factionId` — single-faction
  generate, extracted from the existing batch loop into a shared
  `generateOneFactionBanner()` helper so both the batch (wizard) and
  single (dossier page) routes share one code path. Same generate-once
  guard as the batch route (skips work, returns existing URL, if a
  banner's already there).
- `POST /world-art/upload-mood-board` — accepts a base64 data URL,
  writes straight through `saveWorldMoodBoard` (upsert:true, so it also
  works to replace an existing board).
- `POST /world-art/upload-faction-banner/:factionId` — same shape,
  through `saveFactionBanner` + the existing `patchEntryMeta` bridge.
- All three new routes deliberately **not** gated by
  `enforceGenerationCap` (generate routes: bounded/generate-once, same
  reasoning as the original auto-fire; upload routes: user's own file,
  no AI spend — same reasoning as `/entries/:category/:id/upload-image`).

No changes to `lib/fileWriter.js` — `saveWorldMoodBoard` and
`saveFactionBanner` already accepted raw buffers with `upsert: true`,
so the upload routes reuse them directly with no new storage-layer
code.

### 4. Cache-busting version bump

`lib/version.js`: `v0.10` → `v0.11`. All 24 `archive/**/*.html` pages'
`?v=v0.10` query params on `render.js`/`mapLayout.js`/
`portraitActions.js`/`worldArtActions.js` bumped to `?v=v0.11` via a
Python one-liner (same manual-equivalent-of-the-script approach as last
session — `scripts/bump-cache-version.js` still can't run standalone,
`glob` still isn't in `package.json`'s dependencies; unchanged from the
prior addendum's note, still worth fixing whenever it's convenient).

## Scope decisions locked this session

- **Where the choice belongs:** on the Step 6 page itself, not a
  separate global "manual mode" toggle. There's no `manualMode` flag
  anywhere in the codebase (confirmed by grep before starting) and
  Piece 2's addendum already established that manual is a per-action
  choice, not a tier — this follows the same philosophy rather than
  introducing a new session-level concept.
- **Skipped art isn't lost forever** — it stays available via
  Generate/Upload on World Info (mood board) and each faction's dossier
  page (banner), matching how a skipped/failed entry portrait already
  works. Explicitly Austin's call over the alternative (drop it, force
  the user back through some other flow).
- **Reused the portrait pending-slot pattern exactly** rather than
  building bespoke UI — same CSS classes, same Generate/Upload-label
  shape, same disable-buttons-during-request behavior. Keeps the visual
  language consistent across "any image anywhere in the app that isn't
  there yet."

## Not addressed this round

- No "regenerate" button for world art still — same pre-existing gap as
  before (`world_forge_scope.md`'s open art-regeneration item). The new
  generate-once guard on the single-faction route has the same
  limitation as the batch route it was extracted from.
- The single mood-board generate route (`/world-art/generate-mood-board`)
  was left as-is; only the frontend trigger point changed (choice panel
  instead of auto-fire). No backend behavior change to that route
  itself.
- `glob` still not added to `package.json` — flagged again, not fixed.

## Still needed before this is live

Nothing new. Same standing items as before (Stripe entry-pack price ID,
running any pending migrations) — this piece touched no billing tables
and required no new migration.

## v0.9 status: complete

All three pieces (manual entry, field-level assist, manual wizard path)
are shipped. Reasonable next candidates for the next session: the
remaining tester-feedback item from the Aug 2026 sprint, the image
generation usage cap (flagged as needing resolution before scaling past
beta), or the Quest/questline generator (top of the post-tester-feedback
roadmap).
