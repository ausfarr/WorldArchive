# Session addendum: split text/image quotas, recurring free tier, regenerate gating

Follow-on to `session_addendum_pricing_and_signup_friction.md`. Austin saw a
competitor's pricing table with separate per-feature quotas and wanted
Chronicled's actual billing model restructured to match the spirit of it,
grounded in real cost math ($0.008/text generation, $0.08/image).

## What changed and why

Today's billing model had **one shared points pool** for everything —
`world_config.generation_count` (per-world) and
`subscriptions.used_this_cycle` (per-user) were both single bare integer
columns, and no route anywhere passed a different cost for an image vs. a
text generation (`enforceGenerationCap` always spent
`POINTS_PER_GENERATION` regardless of whether it was guarding
`routes/generateEntryImage.js` or one of the 7 text routes). There was also
**no recurring reset** for any free-tier usage — only Stripe-billed
subscriptions got period rollover; the trial (`TRIAL_CAP`, 50 points ≈ 10
generations) was one-time, forever.

New model, three tiers:
1. **Try It — no account.** Unchanged — this is just the existing
   `/api/demo` flow from the previous session, reframed in copy as "the
   trial."
2. **Free account** (signed up, not subscribed) — a genuinely **recurring
   monthly** allowance: 10 text generations + 1 image/month, forever.
   Replaces `TRIAL_CAP`.
3. **Subscription — $4.99/mo** — 50 text generations + 10 images/month.
   Was $5/mo for 25 generations (shared pool, no image quota).

## Schema (`migrations/029_split_generation_quotas.sql`)

- `world_config` gained `image_generation_count` (parallel counter to the
  existing `generation_count`) and `free_cycle_reset_at` (a lazy-reset
  timestamp — `reset_free_cycle_if_elapsed(p_world_id)` atomically zeroes
  both counters once a month has actually elapsed since the last reset,
  a no-op every other call). Free-tier bookkeeping deliberately stays in
  `world_config` rather than inserting a fake $0 "plan" row into the
  Stripe-oriented `plans`/`subscriptions` tables — keeps free-tier logic
  out of the real-money tables entirely.
- `plans` gained `monthly_quota_images`; `subscriptions` gained
  `used_images_this_cycle`. New RPC pair
  `check_and_spend_subscription_image_generation`/
  `refund_subscription_image_generation` mirrors the existing text-spend
  RPCs, table-aliased from the start to avoid the exact "column reference
  is ambiguous" bug `migrations/028` had to fix after the fact for the
  text version.
- Image quota is a **plain integer count, not points** — there's no
  partial-image action the way field-assist is a fractional text
  generation, so it doesn't need the 5-points-per-generation abstraction.
  It also does **not** draw from `credit_ledger` — that pool is documented
  as text-only ("$2 / 5 generations"); an image-credit product is a future
  decision, not folded in here.
- One-time data cleanup in the same migration: every non-subscribed
  world's `generation_count`/`image_generation_count`/`free_cycle_reset_at`
  reset to a clean slate, so nobody launches already capped out from
  inheriting their old one-time trial usage as this cycle's starting
  count.

## Code changes

- `lib/worldConfigRepo.js`: new `FREE_MONTHLY_GENERATION_CAP` (50 points =
  10 generations), `FREE_MONTHLY_IMAGE_CAP` (1), `resetFreeCycleIfElapsed`,
  `checkAndIncrementImageGenerationCount`, `refundImageGenerationCount`.
- `lib/billingRepo.js`: `TRIAL_CAP` retired; new
  `spendSubscriptionImageGeneration`/`refundSubscriptionImageGeneration`.
- `middleware/enforceGenerationCap.js`: the free-tier branch now calls
  `resetFreeCycleIfElapsed` before checking, against
  `FREE_MONTHLY_GENERATION_CAP` instead of `TRIAL_CAP`. New sibling
  `enforceImageGenerationCap` (same three-tier shape, separate quota) now
  guards `routes/generateEntryImage.js` and `routes/dungeonMap.js` — the
  only two image-generating routes that are real recurring per-use
  actions. `routes/map.js` (world map backdrop) and `routes/worldArt.js`
  (mood board, faction banner) stay uncapped/unchanged, as they already
  were — one-time per-world setup costs, not worth the complexity of
  splitting.
- `routes/billing.js`: `/billing/status`'s `state: "trial"` renamed to
  `state: "free"`, now reports `freeUsed`/`freeCap`/`freeImageUsed`/
  `freeImageCap`/`nextResetAt`; the subscribed branch gained
  `monthlyQuotaImages`/`usedImagesThisCycle`/`remainingImagesThisCycle`.
  `archive/settings.html` updated to render both new image progress bars
  and the renamed state.
- `routes/deleteWorld.js`'s legacy `/generation-usage` endpoint (dead —
  nothing calls it, verified via grep) repointed at
  `FREE_MONTHLY_GENERATION_CAP` instead of the retired `TRIAL_CAP`, kept
  working rather than deleted.

## Regenerate/Remix gate (`lib/regenerateGate.js`)

`requireSubscriptionToRegenerate(req)` reuses
`lib/billingRepo.js#getSubscription` (same check `enforceGenerationCap`
already makes) and is gated behind `BILLING_ENABLED`, same kill switch as
everything else. Not Express middleware — it needs to run mid-handler,
right after each route determines `mode === "regenerate"` (or the
ruleset-specific equivalent), before any further Claude/Gemini spend, same
"gate before spend" convention `enforceGenerationCap` already follows.

Wired into all 8 content-generation routes' every regenerate branch
(several routes have more than one — Enemies/Items/Classes/Survivors each
have an Echoes handler plus separate 5e-import/5e-reflavor/5e-homebrew/
generic sub-handlers, each with its own `isRegenerate`/`mode` branch):
`generate.js` (NPCs), `generateEnemy.js`, `generateItem.js`,
`generateLog.js`, `generateClass.js`, `generateLocation.js`,
`generateSurvivor.js` (no locked-placeholder concept — any `fillExistingId`
is unconditionally a regenerate), `generateFaction.js` (different shape —
no locked/fill distinction at all, always regenerate on `fillExistingId`).
Every insertion point refunds the already-spent generation points
(`enforceGenerationCap`'s middleware runs before the route body even knows
`mode`) before returning the 403.

**Deviation from the original plan: `routes/confirmEntry.js` does NOT get
its own gate.** The plan called for one there too, reasoning that a client
could call `/api/confirm-entry` directly with an existing entry's id and
bypass the generate-route's gate. On closer look this doesn't hold up:
`archive/js/render.js`'s own comment confirms manual Edit saves
(`editEntry`) already POST arbitrary hand-typed content to this exact
endpoint for an existing id, with **no AI call, no gate, by design** — "Edit
saves immediately... doesn't count against the beta generation cap."
Gating confirm-entry on "does this id already exist and isn't locked" can't
distinguish a legitimate manual edit from a forged regenerate-bypass
attempt, because they're the literal same request shape — and since
Manual Mode editing was never restricted, there's no real security gap to
close: the actual AI spend only ever happens at the `/generate-X` route's
regenerate branch, which is now gated before the Claude call runs. A free
user can no longer obtain a real regenerate preview to confirm in the
first place. Adding a gate at confirm-entry would only have blocked the
legitimate free "hand-edit an existing entry" feature for no security
benefit.

## Frontend

- `marketing/pricing.html`: the two-column Free-Trial/Subscription table
  from the previous session became a three-column Try-It/Free-Account/
  Subscription table with separate Generations and Images rows; the plan
  cards, beta banner, FAQ, and final CTA all updated to the new numbers
  and to link to the demo as "try it first."
- `marketing/terms.html`, `privacy.html`, `index.html`, `compare.html`:
  every "10 free generations" / "$5/mo, 25 generations" / "free trial"
  mention updated to match (grepped for `trial`/dollar amounts across
  `marketing/` to catch all of them).
- `archive/js/render.js`'s existing `formatGenerationError()` already
  reads `data.message || data.error`, so the new gate's
  `{ error: "regenerate_requires_subscription", message: "..." }` 403 body
  surfaces correctly in the Regenerate button's error alert with zero
  frontend changes needed there.

## Verification

- All touched backend files pass `node --check`.
- Wrote and ran a scratch script (not committed) mocking
  `lib/demoUsageRepo.js`/Claude to confirm the earlier demo `customSetting`
  change works end-to-end — unrelated to this round's quota-split changes,
  which touch DB-backed RPCs this sandbox's network egress can't reach
  (Supabase host not allowlisted here). The quota-split logic itself
  (`resetFreeCycleIfElapsed`, the new RPCs, the regenerate gate) needs to
  be exercised against the real Supabase project once migration 029 is
  applied by hand — no migration runner exists, per repo convention.
- Manual verification still needed once deployed: a free account hits
  exactly 10 generations + 1 image before blocking; the monthly reset
  actually fires (`free_cycle_reset_at` rollback + retry); a subscribed
  test user gets 50 + 10; a non-subscribed account can generate fresh
  entries and fill locked placeholders but gets a clean 403 attempting to
  regenerate an existing one; `routes/map.js`/`worldArt.js` remain
  uncapped.

## Manual step still needed (cannot be done from this repo)

The $4.99/mo price requires a **new Stripe Price object** (Stripe prices
are immutable — the existing $5/mo price can't just be edited) and
updating `plans.stripe_price_id` for the `chronicled_monthly` row to point
at it.
