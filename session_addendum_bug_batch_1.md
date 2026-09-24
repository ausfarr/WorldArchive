# Session addendum — Bug batch 1

Four bugs found by Austin while testing, fixed across five phases, one
commit per phase. This file records the decisions and each phase's
architectural detail; `CHANGELOG.md`'s `## Unreleased` bullets link here.
Sections are appended phase by phase.

## Decisions (made by Austin, not re-litigated)

1. **Canceled subscribers fall back to the free tier** (monthly free
   generations + free image allowance). Purchased credits still work.
2. **Calendar becomes a new required wizard step** after Lore, before
   Factions, with AI-generate and manual entry. The calendar editor is
   removed from Settings; already-completed worlds reach it through the
   calendar step's edit mode (Phase 3).
3. **The calendar step ships non-AI presets** (Earth, High Fantasy tenday,
   Sci-Fi Standard Cycle, Wild West 1878, Post-Collapse, Sword & Sorcery),
   available with AI on or off.
4. **Timeline gets structured date events from every save path, plus a
   backfill.** AI extraction of dates from lore/history prose is in scope,
   implemented fully (Phase 4).

Phase 0 follow-up answers:

- **Free accounts can't spend purchased credits** (the free branch of
  `middleware/enforceGenerationCap.js` never touches `credit_ledger`; only
  the subscription RPC does). Initially deferred; Austin decided after
  Phase 2 to fix it — see "Phase 2 follow-up" below.
- `BILLING_ENABLED=true` in production.
- Timeline `entry_date` dedupe key is enforced for every caller, including
  `/confirm-entry` (Phase 4).
- Wizard Start Over / Delete World clear `calendar_config` (Phase 3), now
  that the calendar is a wizard step.

## Phase 0 corrections to the original bug trace

- Procedural generation does **not** bypass `/confirm-entry` —
  `routes/generateProcedural.js` only returns an entry; the frontend saves
  it through `/confirm-entry`.
- `scripts/bump-cache-version.js` no longer needs `glob` (plain `fs` scan);
  it just doesn't cover every script (`calendarPage.js`, `timeline.js` are
  bumped by hand).
- There were ten near-identical local "after save" linking helpers, not
  four (`routes/generate*.js`, `lib/campaignEntryGenerators.js`,
  `routes/confirmEntry.js`).

## Phase 1 — relationship graph on wizard-generated factions

**Bug:** `POST /api/wizard/upgrade-factions` (`routes/wizardReview.js`)
ran every faction's Deep Lore generation in parallel and saved each one
straight through `saveFactionEntry()`. It never ran
`resolveReferencesForEntry` (so `relationships[].toId` stayed empty),
`syncReciprocalRelationships`, `backfillReferencesFromNewEntry`, or
`ensureGhostPlaceholder`. `lib/relationshipGraph.js#buildEntryGraph` only
draws edges for resolved ids, so wizard factions showed no relationship
graph until the DM edited and re-saved each one through `/confirm-entry`,
which does run all four.

**Fix:**

- New `lib/afterEntrySave.js`:
  - `linkAfterSave(worldId, category, saved, unresolvedGhosts)` — the
    backfill + ghost-placeholder steps, extracted verbatim from
    `routes/confirmEntry.js`'s `afterSave()`, which now calls it (same
    order, identical behavior). Phase 4 moves the other generate routes
    onto the same helper when it adds timeline events there.
  - `linkWizardFactionsSequentially(worldId, factionIds)` — the wizard
    post-pass. For each upgraded faction, **one at a time**: re-read the
    row fresh, resolve references, save (persisting the resolved ids),
    sync reciprocal relationships, then `linkAfterSave`.
- `routes/wizardReview.js` runs that post-pass after `Promise.allSettled`
  settles, over the factions that upgraded. The response gains
  `linkFailed: [...ids]`; the frontend ignores it (the factions themselves
  are saved either way).

**Why sequential, and why re-read:** the generations stay parallel because
each only writes its own row. `syncReciprocalRelationships` writes into
*other* factions' rows (that's why it was originally left out of the
wizard path — see its header comment in `lib/factionDeepLore.js`), so the
post-pass runs one faction at a time. Each iteration re-reads its row
rather than reusing the object the generation returned, because an earlier
iteration's reciprocal sync or backfill may already have written to it;
saving the stale copy would drop that write.

**Ordering matters:** `syncReciprocalRelationships` appends
`{ faction, stance, why }` *without* a `toId`; the `backfillReferencesFromNewEntry`
that runs after it is what resolves that appended item's id. Same order
`/confirm-entry` has always used.

**Failure handling:** per-faction try/catch; failures are logged and
returned in `linkFailed`, never thrown — the review step and the other
factions' linking always complete.

**Test:** `scripts/testWizardFactionGraph.js` drives the real
`POST /wizard/save-factions` → `POST /wizard/upgrade-factions` routes with
only the Anthropic call stubbed (three factions: one names both others,
one names it back, one names nobody). Asserts every `relationships[]` item
has a `toId`, the missing reciprocal is added once, existing reciprocals
aren't duplicated, and `buildEntryGraph` returns the edges immediately.
Fails 7 of 13 checks against the pre-fix `routes/wizardReview.js`; passes
all 13 with the fix. Runs against `fakeSupabase` by default; `--live` runs
the same flow against real Supabase with a disposable user/world deleted
in a `finally` block (same pattern as `scripts/testTenantIsolation.js`).

## Phase 2 — canceled subscription behavior + billing UI

**Bug:** `middleware/enforceGenerationCap.js` (text and image) branched on
`if (subscription)`, so any `subscriptions` row, including
`status='canceled'`, went to the subscription RPCs. Those zero the monthly
quota for any status other than `'active'`, and the free-tier branch was
never reached. A canceled subscriber therefore had no free generations,
no free image, and only their purchased credits. `/billing/status` sent
them the `subscribed` payload, and Settings rendered "44 of 50
remaining… Renews <past date>". `handleSubscriptionUpdated` synced status
only, so a portal cancellation (Stripe keeps it `active` with
`cancel_at_period_end`) still said "Renews".

**Tier selection — `lib/billingTier.js#billingTierFor`** (single source,
pure):

| `subscriptions` row | tier | text generations | images | entries |
|---|---|---|---|---|
| none | `free` | monthly free allowance | free allowance | 30 + purchased |
| `canceled` / `unpaid` / `incomplete_expired` | `lapsed` | free allowance, **then purchased credits** | free allowance only | 30 + purchased |
| `active` | `subscribed` | plan quota, then credits | plan quota | unlimited |
| `past_due` | `lapsed` (Phase 2 follow-up) | same as lapsed | same as lapsed | 30 + purchased |

- The lapsed credit fallback reuses `check_and_spend_subscription_generation`:
  for a non-active row it already zeroes the quota and spends
  `credit_ledger`. No new RPC or migration was needed, and refunds go back
  through `refund_subscription_generation` with the reported `source`.
- Entry cap: `enforceEntryCap.js` and `routes/billing.js#buildEntryCapStatus`
  already agreed (active-only unlimited). Both now call the same
  `isActiveSubscription()`.
- **Lapsed subscriber's first fallback request usually resets
  immediately.** `free_cycle_reset_at` only moves when the free branch
  runs, so for a subscriber it is typically months old. Their first request
  after lapsing resets both counters and they start a fresh allowance.
  Intended (confirmed by the live test).

**Webhook / data:**

- Migration `037_subscription_cancel_at_period_end.sql` adds
  `subscriptions.cancel_at_period_end boolean not null default false`.
  **Fail-safe without it:** `lib/billingRepo.js` retries any write naming
  the column without it when PostgREST answers PGRST204/42703 about that
  column (verified live against the un-migrated production schema). Reads
  treat an absent column as `false`.
- `customer.subscription.updated` → new `syncSubscriptionFromStripe()`:
  status + `current_period_start/end` + `cancel_at_period_end`, each only
  when present in the event (never overwrites a stored value with null).
  It doesn't touch the usage counters.
- Period fields via `stripePeriodFields()`: the subscription's top-level
  fields (the pinned stripe@17 API shape every handler already used),
  falling back to `items.data[0]` (newer API versions), else null.
- `customer.subscription.deleted` now also syncs the period and clears
  `cancel_at_period_end`. It clamps `current_period_end` to Stripe's
  `ended_at` when that is earlier, so an immediate Dashboard cancel doesn't
  claim it "ended" on a future date. That column is what Settings shows as
  "Your subscription ended on <date>".
- `cancel_at_period_end=true` with status `active` needs nothing beyond the
  label: full access continues until Stripe sends
  `subscription.deleted`.
- **Extra bug fixed (found while verifying resubscribe):**
  `upsertSubscription({ resetUsage })` reset only `used_this_cycle`.
  `used_images_this_cycle` (migration 029) was never reset by anything, so
  a subscriber's "10 images/month" was really 10 images ever, and a
  resubscriber came back with their old image usage. `resetUsage` now
  zeroes both, on checkout (subscribe/resubscribe) and renewal.
- Resubscribe: `checkout.session.completed` upserts on `user_id`, which
  overwrites the canceled row's subscription id and status and resets both
  counters. A late `subscription.deleted` for the old id then matches no
  row.

**UI** (`/billing/status` payloads built by `buildBillingStatusPayload`,
rendered by `archive/settings.html`):

- Active: unchanged. Active + `cancelAtPeriodEnd`: "Cancels on <date>"
  plus a note that the account moves to the free tier afterwards.
- `state: "lapsed"`: "Your subscription ended on <date>", then the free
  generations/images remaining, the next reset date, credits, and the
  entry cap, with **Resubscribe** and **Manage Billing** buttons. The
  payload deliberately omits `monthlyQuota`/`remainingThisCycle`/
  `currentPeriodEnd`, so no render path can show "N of 50" or a past
  "Renews" date.

**Free-tier monthly allowance — verified live**
(`scripts/testFreeTierAllowance.js`, disposable user, no AI/Stripe calls):
a fresh world spends exactly 10 generations, then gets `free_cap_reached`.
It gets 1 image, then `free_image_cap_reached`. A 27-day-old cycle does
not reset. A 32-day-old cycle resets both counters on the next request.
`/billing/status` reports remaining counts and `nextResetAt` correctly
before and after. The same script also walks a lapsed subscriber through
free, then credits, then blocked, and back to the paid path via
resubscribe. One real bug found: `nextResetAt` used JS
`setMonth(+1)` in server-local time, so Jan 31 displayed as ~Mar 3 while
Postgres's `interval '1 month'` resets on Feb 28. It now uses
`addOneMonthLikePostgres()` (UTC, clamped to month end).

**Flagged, not changed:**

- `past_due` is now *worse off* than `canceled`: no quota, no free
  allowance, capped entries, credits only. That was the decision
  ("Stripe is retrying"). Consider giving `past_due` the free allowance
  too, or a short grace period of full quota.
- Stripe statuses `incomplete`, `trialing`, and `paused` stay on the
  subscription path (quota 0 unless `active`). Our code never writes them
  today (checkout writes `active`), but `subscription.updated` passes them
  through.
- Existing rows get `cancel_at_period_end=false` from the migration
  default. A subscriber who already canceled in the portal shows "Renews"
  until their next `subscription.updated` event (or until the period ends
  and `deleted` arrives).
- Out-of-order delivery: a delayed `subscription.updated` (status `active`)
  processed after `subscription.deleted` would flip the row back to
  active. This was already true before this change → Phase 5 audit.
- Free accounts (no row) still can't spend purchased credits (deferred by
  decision → Phase 5).

**Tests:** `scripts/testBillingTier.js` (61 checks, fakeSupabase; 14 fail
against the pre-fix middleware) covers tier selection, status payloads,
middleware routing for every status, and the webhook handlers with fixture
events, including the missing-column fallback. `scripts/lib/fakeSupabase.js`
gained the credit_ledger fallback, `get_credit_balance`, and the
image-quota RPCs. `scripts/testFreeTierAllowance.js` (29 checks, live).

## Phase 2 follow-up — past_due and free-account credits

Austin's answers to the Phase 2 open questions:

1. **`past_due` is treated as lapsed.** "Past due is essentially an
   automatic cancel." Added to `LAPSED_SUBSCRIPTION_STATUSES`, so a
   past_due account gets the free allowance, then credits, then capped
   entries. Nothing extra is needed to restore it: a successful Stripe
   retry fires `invoice.payment_succeeded`, which sets `active` with fresh
   usage. Settings words it as a payment problem ("Your last subscription
   payment failed… update your card in Manage Billing"), not "ended". It
   hides Resubscribe for past_due, since the Stripe subscription still
   exists and a second checkout would double-bill once the retry
   succeeds.
2. **Out-of-order webhook events** → left for the Phase 5 audit.
3. **Free accounts can now spend purchased credits.**
   `migrations/038_credits_only_spend.sql` adds
   `check_and_spend_credits(p_user_id, p_amount)`. It is serialized per
   user by `pg_advisory_xact_lock`, because a free account has no
   subscriptions row to lock, and without the lock two concurrent requests
   could both spend the last credit. Refunds reuse
   `refund_subscription_generation`'s `'credit'` branch, which only
   inserts a positive ledger row. Order for a free account: monthly free
   allowance → credits → `free_cap_reached` (with `creditBalance`).
   Lapsed accounts keep using the subscription RPC's credit fallback.
   **Fail-safe:** until 038 is run, PostgREST returns PGRST202,
   `spendCredits()` reports unavailable (one warning per process), and the
   request gets the same 403 as before the fix. Verified live against
   the un-migrated schema.

Not changed, for Phase 5: `/billing/checkout/subscribe` has no
server-side guard against an account that already has a live
subscription (active or past_due). Only the UI hides the button.

Tests: `scripts/testBillingTier.js` now covers past_due as lapsed
(including a return to paid on `active`), free credits spend/refund/block,
and the missing-RPC fail-safe. `scripts/testFreeTierAllowance.js` probes
for 038 and checks the real credit spend if it's present, else the
fail-safe. **Re-run it after applying 038.**

## Phase 3 — calendar as a wizard step

**Step order** (visible labels only — `draft_json` keys "1".."8" are
unchanged, and `calendar_config` was already its own column, so
completed worlds are unaffected): 1 Seed & Vision · 2–3 Lore ·
**4 Calendar (new)** · 5 Factions · 6 Stats & Skills · 7 Style Guide ·
8 Category Configuration · 9 Review. Updated: every "Step N of 8" crumb,
wizard.html's "(Step 7)" hint, wizard-style.html's "(Step 5)" note,
wizard-review.html's "Step 5 layout" text, and render.js's "Wizard Step 6"
skills hint. Code **comments** elsewhere still use the old numbers. Those
match the unchanged `draft_json` keys and were left alone on purpose.

**`archive/wizard-calendar.html`** — one page, two modes:

- **Wizard mode** (`setup_completed_at` unset): Lore → Calendar → Factions,
  with the Back links updated. Continue is disabled until the calendar
  passes validation, and Continue itself saves, so there's no separate
  Save to forget. The editor starts **blank**, not with a
  "Firstmonth" default: the step is required, and a pre-filled valid
  default would let Continue skip the decision. `wizard-factions.html`
  sends a mid-wizard world with no calendar back to this step. It never
  redirects a setup-complete world.
- **Edit mode** (setup complete): Save + "Back to <origin>" (whitelisted
  `?from=calendar|timeline|world-info`, never a raw URL), plus a
  beforeunload guard for unsaved edits. Linked from the Calendar page
  (empty state + "Edit calendar"), the Timeline empty state, World Info
  (new Calendar section), and a one-line pointer where the Settings
  section used to be. **Wizard pages did NOT load for setup-complete
  worlds before this:** `ensureWizardSession()`'s auto-reset returns 409 in
  a tab with no wizard-session flag and bounces to `index.html`. Edit
  mode skips that call; wizard mode still makes it first.
- AI toggle respected: Generate carries `.ai-action`, so it's hidden when
  AI is off. `generate-calendar` stays behind `requireAiEnabled`.
  Templates and manual entry always work.

**Shared editor `archive/js/calendarEditor.js`** replaces the Settings
markup/JS. Weekday names are now one input per day (they were a
comma-separated field). This makes "Day N" placeholders highlightable and
removes the old failure where changing "Days per week" left a mismatched
list the server rejected. Client validation mirrors
`lib/calendar.js#validateCalendarConfigShape`, which moved there from the
route (and now also rejects blank weekday names). The server stays the
real gate.

**Presets (`lib/calendarPresets.js`, `GET /api/wizard/calendar-presets`)**:
Earth, High Fantasy (tenday, original names — not the published 5e
setting's), Sci-Fi Standard Cycle, Wild West 1878, Post-Collapse, Sword &
Sorcery. Choosing one fills the editor (confirm first if there are
unsaved edits) and never saves. No AI, no quota. **Known limitation**
(noted in the editor UI): no leap years or intercalary days. Earth's
February is a fixed 28; festivals go in as Notable Dates.

**Change warning:** `POST /api/wizard/calendar-impact` (read-only) counts
the Timeline events, notable dates, and entry date fields a proposed
calendar would invalidate, via `lib/calendar.js#countDatesInvalidatedByCalendar`.
That includes a moved current year pushing dates past the ±bounds. The
editor calls it only when month lengths or the current year changed
(renames can't invalidate an index-based date), and confirms with the
counts and a few examples. An invalid `current_date` is blocked by
validation rather than counted. Existing data is never mutated.

**"Calendar shows the wrong week names / stale data": causes found**

1. **Wrong week names (primary):** `generate-calendar` set
   `weekday_names` to `null` whenever the model's list length didn't match
   `daysPerWeek`. The Calendar page then rendered `D1..Dn` headers. Now
   `repairWeekdayNames()` truncates extras and pads missing names with
   "Day N" (highlighted in the editor). The prompt states the exact-count
   rule twice, and `calWeekdayHeaders` falls back to "Day N" instead of
   "D1". Reproduced at route level in `scripts/testCalendarWizardStep.js`
   (6 names for an 8-day week).
2. **Generated but never saved:** Settings' "Generate For Me" only filled
   the editor, and its "review and Save Calendar to keep it" status line
   was easy to miss, so the Calendar tab kept showing the old (or no)
   calendar. In the wizard step, Continue saves. In edit mode, the button
   shows "Unsaved changes" and leaving the page warns.
3. **Back/forward cache:** the Calendar and Timeline pages render once on
   load, so Back after editing restored the pre-edit DOM. Both now reload
   on `pageshow` with `event.persisted`.
4. **Ruled out:** HTTP caching (the API sends no Cache-Control or
   Last-Modified, so there's no heuristic freshness), `authFetch` (sets no
   cache mode), and service workers (there are none). `calendarPage.js`
   and `timeline.js` had sat at `?v=v1.0.0` since they shipped, because
   the bump script didn't cover them. Low risk, since static files are
   `max-age=0` and revalidate, but every `archive/js` file is now in
   `CACHE_BUSTED_SCRIPTS`.

I couldn't replay your exact browser session. Causes 1 and 2 are certain
from the code; cause 3 is standard browser behavior for these pages.

**Faction dates:** `lib/factionDeepLore.js` already passed
`calendarContext` to Deep Lore (both the regenerate and wizard-upgrade
paths). The only problem was ordering, since the calendar didn't exist
yet at wizard time. With Calendar now before Factions, wizard factions
get a structured `foundingDate` (asserted in
`testCalendarWizardStep.js`). Step 5's stub generator
(`wizardFactionPrompt.js`) has no date field and needs none.

**Month-name date fields:** `render.js#efWorldDateField` (every
Founding/Birth/Appointed/Death/Created/Discovered/Resolved/Chronicle date
input) shows a dropdown of this world's month names ("Greenrise (30
days)") instead of a zero-based "Month #" number. The day input's `max`
follows the chosen month. Stored values and `readWorldDateField` are
unchanged (the option value is still `monthIndex`). A stored index outside
the current calendar stays selectable, labelled "not in this calendar", so
a save can't silently drop it. With no calendar, a note links to the
editor.

**Other:** `resetWorldConfig` (Start Over, the auto-reset, Delete World)
now clears `calendar_config`. `GET /wizard/calendar-config` also returns
`setupCompletedAt`, and `GET /wizard/review` returns `calendarConfig`
(new Calendar line on the review page, escaped). Cache version is v1.8.

**Tests:** `scripts/testCalendarPresets.js` (pure: every preset passes
`validateCalendarConfigShape`, weekday count == `days_per_week`, valid
`current_date`, months 20–40, weeks 4–10, the specified preset data, no
published-setting month names; plus `repairWeekdayNames` and
`countDatesInvalidatedByCalendar`).
`scripts/testCalendarWizardStep.js` (real routes over HTTP,
fakeSupabase, stubbed AI): presets load with AI off, generate is gated
and repairs weekdays without saving, save validation, the impact check
counts and never mutates, the review summary includes the calendar,
Start Over clears it, and wizard factions get a `foundingDate`. The page
flows (required Continue, template confirm, Factions guard, edit mode,
impact dialog, links, month dropdown) were verified in headless Chromium
against the real routes.

**Unrelated, found while running every script:**
`test5eBackgroundFeatMapper.js` (3 failures) and
`test5eRaceSystemMapper.js` (1 failure) fail identically on `main` → Phase 5.
