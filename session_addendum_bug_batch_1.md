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
  the subscription RPC does). Deferred — would need a small credits-only
  spend RPC + migration. Listed in the Phase 5 audit.
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
| `past_due` (and any other status) | `subscribed` | unchanged: quota paused (0), credits only | unchanged: 0 | 30 + purchased |

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
