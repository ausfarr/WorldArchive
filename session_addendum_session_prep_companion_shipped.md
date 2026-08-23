# Session addendum — Session Prep Companion

**What was built:** a full guided pre-session-prep and post-session-recap
loop layered on top of the existing archive — a real in-world calendar,
generated Session Packets (Tier B prep documents) and Session Chronicles
(in-setting recap journal entries), a world-wide deterministic Timeline
of Events, a persisted DM-facing "Suggested Updates" queue for narrative
drift the archive hasn't caught up to yet, entry-level status fields, and
a browsable month-grid Calendar page — plus quota/billing wiring so both
new generation routes cost the same as every existing one. Spec of
record: `session_prep_companion_scope.md`. Shipped as 9 independently
reviewable commits on `claude/worldarchive-setup-scope-oaogbg`, one per
phase, each with its own regression sweep.

## Working norms this build held to throughout

- **Model writes narrative, code validates structure/math.** Every date
  a model proposes goes through `lib/calendar.js`'s
  `validateWorldDate`/`proposeAndValidateDate` before it's ever stored;
  every cross-entry reference a model proposes (Session Packet tagged
  entries, Chronicle `impliedUpdates`) is resolved against the real
  roster and dropped if it doesn't match a real id — never invented,
  never trusted raw.
- **Escape-and-verify, adapted to this codebase's actual current
  discipline.** The original brief called for round-tripping new
  templating functions through "the same vm-based parser render.js
  uses" — that parser predates the Supabase migration and no longer
  exists in this codebase (confirmed by reading `archive/js/render.js`
  at the start of this build). Substituted the app's real current
  discipline instead: `escapeHtml()` on every interpolated value in
  every new template function (`lib/sessionPacketTemplate.js`, Chronicle
  rendering in `lib/logTemplate.js`, the Suggested Updates list in
  `archive/js/pendingUpdates.js`, the Calendar page's day-detail panel
  in `archive/js/calendarPage.js`). Flagged as a deviation in Phase 1's
  commit message; held consistently for the rest of the build.
- **Persist structured source, not just rendered HTML**, for every new
  content type — Session Packets and Session Chronicles both save their
  full model-shaped object into `raw_json` (via the existing
  `entries.raw_json` column every category already uses), not just the
  `bodyHtml` string.
- **Reference real ids, never invent.** Every new cross-entry reference
  path (Session Packet scene-beat tags, Chronicle `impliedUpdates`,
  regenerate-suggestion targets) resolves against the live roster and
  silently drops anything that doesn't match, the same discipline
  `lib/entryLinker.js` already established for every other category.

## Deviations flagged going in, held throughout

1. **No live Supabase access from this sandbox.** A raw `fetch` probe
   against the live Supabase host returned a 403 from the sandbox's
   egress proxy at the very start of this build, confirming the "dry-run
   against real data" instruction in the original brief wasn't reachable
   here. Every phase's test script instead uses the existing in-memory
   `scripts/lib/fakeSupabase.js` harness (the same one
   `scripts/testPipeline.js`/`testEnemyPipeline.js` already used),
   mounting the real Express routes and mocking only `global.fetch` for
   the Anthropic calls. This means: **none of this feature has been
   exercised against a real Supabase project or real Claude/Gemini
   calls.** The migrations listed below are unapplied and untested
   against live Postgres; apply them by hand, then smoke-test each
   category's generate → confirm flow against a real world before
   trusting this in production.
2. **Session Packet + Chronicle billing bundling**, flagged as an
   assumption going in and formally resolved in Phase 9: a Chronicle
   generated for a quest/campaign that already has a confirmed Session
   Packet is bundled into that Packet's charge (free); a standalone
   Chronicle (no preceding Packet at all) charges its own 5 points. This
   is coarse-grained — "a Packet exists for this quest/campaign at all,"
   not tied to a specific session number — since no per-session pairing
   mechanism exists anywhere else in this codebase. See Phase 9's commit
   message for the full reasoning; flagging again here since it's a real
   product decision Austin should sign off on, not just an implementation
   detail.
3. **The shared `scripts/lib/fakeSupabase.js` test harness had two real
   bugs**, found and fixed mid-build (Phases 7 and 8) because this
   feature's tests were the first ones to actually exercise the code
   paths that exposed them: autoincrement ids were numbers when every
   real table uses `uuid` (string) primary keys, breaking any route that
   round-trips an id through `req.params`; and `.order()`/`.delete()`
   didn't respect chained `.order()` calls or `.select().maybeSingle()`
   respectively. Both fixed in place (see Phase 7/8 commit messages) --
   every prior phase's tests still pass after the fix, since the old
   behavior only coincidentally looked correct for what they happened to
   exercise.

## Per-phase summary

**Phase 1 — Assembly plumbing** (`lib/sessionAssembly.js`,
`routes/adminSessionPrep.js`). `assembleSessionContext(worldId, {questId,
campaignId})` resolves a Quest or Campaign's full roster, prior
Chronicles, and dungeon maps into one shape every later phase builds on.
Admin-gated test endpoint only — no real UI caller until Phase 4.

**Phase 2 — Minimal Calendar** (`migrations/030`, `lib/calendar.js`,
`routes/wizardCalendar.js`, `archive/settings.html`). New
`world_config.calendar_config` jsonb column — months, days/week, era
name, current date. Settings-page editor with a "Generate for me" AI
assist, same pattern as Stat System/Style Guide.

**Phase 3 — Entry-level structured dates** (`lib/calendar.js` extended,
`lib/dateContext.js`, `lib/logDateSuggestions.js`,
`lib/pendingEntryUpdatesRepo.js` stub, `migrations/031`). Founding/birth/
appointed/death/created/discovered/resolved date fields added to
Factions, NPCs, Survivors, Items, Logs — model-proposed, code-validated,
sanitized on every write path including manual edit (`routes/
confirmEntry.js`). A Log that's the "first mention" of an undated fact
creates a reviewable suggestion rather than silently backfilling another
entry's date.

**Phase 4 — Session Packet generation (Tier B)** (`migrations/032`,
`prompts/sessionPacketPrompt.js`, `lib/sessionPacketTemplate.js`,
`routes/generateSessionPacket.js`, `archive/session-packets/`). Full
generative prep document — opening read-aloud, scene beats tagged to
real roster entries, NPC voice reminders, a complications deck, open
threads. New `session-packets` archive category, added to the
`entries.category` CHECK constraint following the `spells` (migration
024) precedent rather than getting a dedicated table, since it's
narrative content like every other generated category, not a structural
reference like Campaign Modules/Arcs. Always goes through preview →
confirm, even for a brand-new Packet (never direct-saves).

**Phase 5 — Recap page + Session Chronicle** (`lib/sessionChronicle.js`,
`prompts/sessionChroniclePrompt.js`, `routes/generateSessionChronicle.js`,
`archive/session-recap/`). A Chronicle is a Logs sub-type (`logType:
"Journal"`, `log.sessionChronicle = {questId, campaignId, sessionNumber,
worldDate}`), reusing the existing Logs write path rather than a new
category. Session numbering is global (one running count across the
whole world, not per-Quest/Campaign). Date defaults to the world's
`current_date` but is fully DM-editable before confirming.

**Phase 6 — Timeline of Events** (`migrations/033`, `lib/timelineRepo.js`,
`lib/timelineEvents.js`, `archive/timeline/`). Three deterministic
trigger sources: every confirmed Chronicle (Trigger 1), a Log's resolved
date when it isn't a Chronicle (Trigger 3 — "canonical date wins," so a
Chronicle's own date isn't double-counted), and an opt-in checkbox on any
Regenerate (Trigger 2). Never AI-generated — pure aggregation of data
that already exists.

**Phase 7 — Entry drift suggestions, status fields, persisted queue**
(`migrations/034`, `lib/pendingEntryUpdatesRepo.js` formalized,
`lib/sessionChronicleSuggestions.js`, `routes/pendingUpdates.js`,
`archive/pending-updates/`). A Chronicle can propose `impliedUpdates` —
narrative implications for already-archived entries (an NPC's status
should flip, a faction's write-up is stale) — validated against the real
roster at both generate-preview and confirm time, since the archive can
change in between. Status fields (NPCs/Factions/PCs always, Boss-tier
Enemies, QuestItems) default and carry-forward centrally in
`routes/confirmEntry.js`, since the AI schema never proposes `status` at
all. A genuine status flip (hand-edited or applied from a suggestion)
auto-fires a Timeline event — Trigger 2 extended, no separate opt-in
needed for a real state change. "Act" on a regenerate-type suggestion
never auto-applies: it pre-fills the suggestion's text into the normal
DM-reviewed regenerate/confirm flow via a new `revisionNote` parameter
threaded into 4 prompt builders' existing `regenerateBlock`.

**Phase 8 — Full Calendar Page** (`migrations/035`,
`lib/calendarNotableDatesRepo.js`, `archive/calendar/`). Year-at-a-glance
month grid built from `calendar_config`, overlaying Timeline events (a
different *view* of Phase 6's data, not a new source) plus DM-added
recurring notable dates (own table, not a `calendar_config` field, since
that column gets fully overwritten by the Settings page's save action).
Explicitly deferred per the scope doc's own note: the optional
"generate a holiday for me" AI helper, continuous cross-month weekday
alignment (no epoch reference exists anywhere in this data model), and
multi-era/mid-campaign calendar resets.

**Phase 9 — Quota/billing wiring** (`routes/generateSessionPacket.js`,
`routes/generateSessionChronicle.js`). Both routes now cost
`POINTS_PER_GENERATION` (5) like every pre-existing generate route,
subject to the bundling rule described above for Chronicles. Both
refund on a downstream failure via the existing `req.refundGeneration()`
contract.

## Migrations to apply by hand, in order

No migration runner in this project — apply each against the Supabase
project via the SQL Editor (or CLI), in this numeric order, before this
code goes live. **Renumbered from 029-034 to 030-035** while merging
this branch with `main` (PR #48): main had independently landed its own
`migrations/029_split_generation_quotas.sql` in the time this feature
was being built, so this feature's original 029 (`calendar_config.sql`)
collided with it. Renumbered this feature's six migrations up by one to
resolve the collision — no other migration on `main` overlaps with this
range, and none of these six migrations execution-order-depend on
`029_split_generation_quotas.sql` or vice versa (different tables/
columns entirely), so the renumbering is purely cosmetic/ordering, not a
functional change. If `029_split_generation_quotas.sql` was already
applied against the live Supabase project before these six are applied,
that's fine — apply this feature's six in order starting from 030
regardless of what's already there.

- `030_calendar_config.sql` — `world_config.calendar_config` jsonb column
- `031_pending_entry_updates.sql` — `pending_entry_updates` table (Phase 3 stub)
- `032_session_packets_category.sql` — adds `'session-packets'` to `entries.category`'s CHECK constraint
- `033_timeline_events.sql` — `timeline_events` table
- `034_pending_entry_updates_payload.sql` — adds `payload` jsonb column to `pending_entry_updates`
- `035_calendar_notable_dates.sql` — `calendar_notable_dates` table

## What's untested against a live world (explicit, per the working norms)

- **Every generation route this feature touches or adds** — Session
  Packet, Session Chronicle, the 5 existing categories now with date
  fields, the billing wiring's actual point deduction against a real
  `world_config` row and real `check_and_increment_generation_count`
  RPC — has only run against `fakeSupabase`'s in-memory fake, never a
  real Postgres round-trip. The fake models the real schema closely
  (matching column names/types, including the uuid-id fix made mid-build),
  but a live smoke test of each category's full generate → confirm →
  re-render cycle is still owed before this ships to real users.
- **The full HTML/JS verification for this delivery** started as a real
  headless-Chromium check (via the `puppeteer-core` + pre-installed
  Chromium already in this environment) navigating every changed/new
  archive page and watching for real parse/script errors — a
  meaningfully stronger check than a regex tag-balancer. It had to be
  abandoned: this sandbox's egress proxy blocks or resets connections to
  the CDN hosts every page depends on (`unpkg.com` for `supabase-js` and,
  on `map.html`, Leaflet's CSS/JS), the same category of restriction
  already flagged for live Supabase access, and stubbing out just the
  Supabase CDN request still left other pages hanging past a workable
  timeout. Fell back to the same static, offline verification Phases 7-8
  already used: real tag-balance checking, `new Function()` syntax
  validation on every inline `<script>` block, and (new for this final
  pass) confirming every local `<script src>`/stylesheet reference
  actually resolves to a real file on disk. All 21 changed/new archive
  pages pass every check; the two pre-existing "tag mismatch" hits on
  `map.html`/`world-info.html` are confirmed (via `git diff`) to be
  JS-string-embedded HTML inside unrelated `<script>` blocks that predate
  this feature, not real defects, and not something this sandbox lets me
  verify with a real browser either. **A real browser smoke test of at
  least the new pages (Calendar, Timeline, Suggested Updates, Session
  Packets, Recap) against a real dev server is still owed.**
- **`BILLING_ENABLED=true`'s trial/subscription/credit-tier path** for
  the two new routes is untested — Phase 9's test exercises the legacy
  flat-cap flow only (`BILLING_ENABLED` unset, this project's default),
  same as every other generate route's own test coverage in this repo.
  The wiring reuses `enforceGenerationCap`/`enforceEntryCapOnGenerate`
  unchanged, so it should behave the same way the 7 pre-existing routes
  already do under real billing, but that's inference from shared code,
  not a direct test.
- **PDF/export and portrait-image paths** were not touched or tested for
  the new `session-packets` category or Chronicles — `lib/pdfExport.js`
  should pick both up for free (they're regular `entries` rows like
  everything else), but that inference hasn't been verified by an actual
  export.

## Deliverable

A repo-relative zip of every file this feature added or changed across
all 9 phases (87 files against the pre-Phase-1 base commit
`df62933`), no wrapper folder, ready for GitHub's "Add file → Upload
files" flow if that's a more convenient review path than the 9 commits
already on `claude/worldarchive-setup-scope-oaogbg`.
