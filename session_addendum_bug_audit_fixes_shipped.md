# Session Addendum: App-Wide Bug Audit & Fixes

Full-app audit requested by Austin ("find any and all bugs — generation
bugs, non-efficiencies, wasted-token generation, glitches") followed by a
"go fix everything" pass, with one explicit exception: the wizard's
generation calls stay outside the points/cap system by design (setup-time
AI assist shouldn't burn a new world's generation budget before it's even
archived anything) — everything else was fair game.

## How the audit ran

Seven parallel research passes covered: the core generation pipeline
(routes/generate*.js, lib/claude.js, prompts/), the data layer
(lib/entriesRepo.js, lib/roster.js, lib/fileWriter.js), middleware/caps/
billing, the frontend (archive/js/*.js, archive/*.html), PDF/image/map
compositing, the wizard + field-assist, and campaign/procedural
generation. Findings were compiled, prioritized (data-loss/correctness →
money leaks → bugs/glitches → efficiency), and fixed in that order across
20 commits on `claude/app-bug-audit-pgoqu8`.

## Fixes shipped, by category

**Data loss / correctness**
- Wizard auto-reset (`ensureWizardSession()`) wiped an already-completed
  world's entire config with no confirmation whenever sessionStorage's
  continuing-session flag was absent — which happens on any stale
  bookmark, reopened tab, or typed URL to a wizard page. `POST
  /api/wizard/reset` now refuses the auto-reset (409) once
  `setup_completed_at` is set, unless `force:true` (which "Start Over"
  now passes, since it's already an explicit confirmed action).
- Faction Roundup only aggregated NPCs/Enemies/Logs; Survivors and
  Locations both carry a real `faction` field and were silently omitted.
- Every image Storage upload hardcoded `contentType: "image/png"`
  regardless of the real bytes (Gemini can return JPEG) — mislabeling
  portraits, banners, mood boards, and map backdrops. Real `mimeType` now
  threaded through every generate/upload call site.
- `save-factions` didn't validate faction `name` was non-empty — an
  empty slot could become a permanent, unnamed live Factions page.
- Log regenerate silently lost its type (Audio/Journal/Terminal): the
  fallback that guessed a log's type parsed `subtitle` for a
  "Terminal — Faction"-shaped string, but a log's actual stored subtitle
  is "Character(s): ..." — never that shape. Since the frontend sends no
  `logType` on regenerate, this guess was the *only* source of it, and
  it failed every single time. Now reads the already-available
  `existingEntry.logType` field directly.

**Money leaks**
- `requireAiEnabled` (the account-level AI kill switch) was missing from
  World Art, dungeon/battle maps, Campaign Arc/Quest generation, and
  every wizard `/generate-*` route — an AI-disabled account could still
  trigger real spend through any of them.
- Stripe webhook had no idempotency: a redelivered `checkout.session.
  completed`/`invoice.payment_succeeded` (Stripe retries on any non-2xx)
  could double-credit an account or reset a subscription's usage for a
  free extra month. New claim-then-process lock via a `stripe_webhook_
  events` table.
- No refund path existed anywhere: a failed generation (API error, parse
  failure, bad input) permanently burned the point/cap/credit already
  deducted. New `refund_generation_count`/`refund_subscription_
  generation` RPCs, wired into every generation route's failure paths.
- Map backdrop, world mood board, and faction banner generation all did
  an unlocked check-then-act (exists? → generate) — two near-simultaneous
  requests could both pass the check and both pay for a real Claude+
  Gemini call. Now serialized per-resource via a new in-process async
  lock (`lib/asyncLock.js`).
- Quest slot-fill (`generate-slot-entry`) was missing the entry cap
  middleware every other creation path has, and discarding a Quest
  preview didn't delete already-generated (real, paid-for) slot entries.

**Other bugs / races**
- `lib/roster.js`'s context builders issued up to 60 redundant `getEntry`
  calls per generation, fetching fields already present on the manifest
  row for free (and one field, `tic`, was dead — never populated to
  begin with). Also fixed an accidental duplicate-text bug this caused
  in the log roster context.
- Deleting an entry left dangling references behind: a dead link in its
  faction's already-baked Roundup table, and a stale pointer in any
  Quest that referenced it. Deleting a Quest left a stale pointer in any
  Campaign that referenced it. Both now clean up (best-effort) on delete.
- `routes/confirmEntry.js`'s entry-cap check-then-write had no lock,
  letting concurrent creates slightly exceed a world's entry cap.
- Pending-stage ids in the Campaign Arc planner used `Date.now() +
  Math.random()*1000`, which could collide within one synchronous batch
  and remove the wrong stage later. Now a monotonic counter.
- Site search had no request-sequencing guard — a slower, stale response
  could overwrite a newer query's results.
- Generate Backdrop was the one AI button in the app that didn't
  explicitly disable itself during the request (relied only on the
  overlay).

**Efficiency**
- `listEntries`/`searchEntries` had no bound: roster/faction-roundup
  builders fetched every row (including locked placeholders) then
  filtered client-side; search had no LIMIT at all. Pushed `locked:
  false` into the query and capped search at 200 results.
- Neither `lib/pdfExport.js` nor `lib/dungeonMapCompositor.js` capped how
  many headless Chromium processes could run concurrently, and PDF
  export's `page.setContent` (which fetches real Storage image URLs) had
  no explicit timeout. New shared `chromiumSemaphore` (2 concurrent) +
  explicit 45s timeout.
- `readFileAsDataUrl` was reimplemented identically 4 times; consolidated
  into `auth.js` (the one file every relevant page already loads first).
- The pre-paint theme-cache bootstrap script was byte-identical across 5
  pages; extracted to `archive/js/themeBootstrap.js`.
- `billingRepo.getCreditBalance` summed every ledger row in JS; now a
  single `get_credit_balance` RPC does the SUM server-side.
- `loreRepo.backfillFactionTags` updated one row at a time in a loop;
  now one batched `.in(ids)` update.
- `scripts/bump-cache-version.js`'s regex only matched
  render.js/mapLayout.js/portraitActions.js — `worldArtActions.js` had
  already drifted to a stale version no rerun could ever have caught
  (the regex didn't match its filename at all), and `campaignArc.js`/
  `campaignModule.js` had no cache-busting whatsoever. Extended to a
  maintained list covering every app JS file.

## Reviewed, no change made (intentional design, not a bug)

- **`buildFactionRoundup`'s per-faction scan stays uncapped.** Unlike
  `lib/roster.js`'s prompt-context builders (which summarize/truncate by
  design), the Roundup table is real, complete, user-visible archive
  content — silently truncating it would be a product behavior change,
  not a transparent perf fix.
- **`routes/wizardReview.js`'s `/wizard/confirm` doesn't hard-block on
  missing stat/skill/style/category config.** Graceful defaults exist
  for all of them (e.g. `DEFAULT_STAT_LABELS`), and the Review page
  already shows "Not configured yet." per section before the confirm
  button — matches the wizard's deliberate "AI-optional, Finish As-Is"
  design rather than being a silent trap.
- **`mapLayout.js` recomputes its force-directed layout on every page
  load, not memoized.** Explicitly documented as a deliberate
  simplification in the file's own header comment — persisting
  coordinates would mean storing x/y per location and reconciling with a
  live simulation, which defeats the point of computing the layout at
  all.
- **Wizard generation stays outside `enforceGenerationCap`.** Per
  explicit instruction this session — wizard AI assist is free of the
  points/cap system by design, though it now still respects the account
  AI toggle (`requireAiEnabled`), which costs nothing extra to check.

## Migrations added (apply by hand against Supabase, in order)

- `017_stripe_webhook_idempotency.sql`
- `018_generation_refund.sql`
- `019_credit_balance_sum_rpc.sql`
