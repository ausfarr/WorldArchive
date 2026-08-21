# Session addendum — entry-cap race fixes (shipped)

**Status:** shipped. **⚠️ Touches billing-adjacent code.** Found during a
daily-autonomous bug-hunt pass the day after the v1.0.0 public launch
(`BILLING_ENABLED=true` went live 08/20/2026), so both bugs below are real
production paths, not latent/deferred ones.

## How these were found

A background review agent was asked to trace, not just grep, the
concurrency assumptions in the billing-adjacent write paths
(`middleware/enforceEntryCap.js`, `lib/worldConfigRepo.js`,
`lib/billingRepo.js`, `routes/stripeWebhook.js`, `routes/confirmEntry.js`)
and compare each against its siblings for a fix applied in one place but
not a parallel one — a documented recurring bug shape in this codebase
(see `routes/generateEntryImage.js`'s "finding #8" for the same class of
issue in a different subsystem). It found two, both genuinely reachable,
both gated behind `BILLING_ENABLED=true` — no longer a hypothetical toggle
as of yesterday's launch.

Everything else the agent traced closely and did NOT flag: the Chromium
concurrency semaphore in `lib/pdfExport.js`/`lib/dungeonMapCompositor.js`,
the Stripe webhook idempotency claim/release logic, `lib/roster.js`'s
overflow-tally math, the entry cross-linking ghost-placeholder cleanup,
and all 10 `/generate-X` routes' ruleset-dispatch consistency — all
correct as-is.

## Bug 1 — entry cap check-then-act race across every `/generate-X` route

`routes/confirmEntry.js` already documents and fixes this exact race for
its own write path: it wraps the cap check + the save in one
`withLock(`entry-cap:${worldId}`, ...)` call, with the comment explaining
why — "two concurrent confirm-entry calls for two different new entries
could both pass the count-check before either's write actually landed."
That reasoning applies identically to `middleware/enforceEntryCap.js`'s
`enforceEntryCapOnGenerate` — mounted on all 10 `/generate-X` routes
(`generate.js`, `generateEnemy.js`, `generateItem.js`,
`generateSurvivor.js`, `generateClass.js`, `generateLocation.js`,
`generateFaction.js`, `generateLog.js`, `generateSpell.js`,
`generateProcedural.js`) — but the fix never propagated there. It did a
plain `checkEntryCap` → `countEntries` read-and-compare with no lock, then
the route proceeded through a real Claude/Gemini call (several seconds)
and an unconditional save.

**Repro (pre-fix):** `BILLING_ENABLED=true`, a free-tier world at 29/30
entries. Two near-simultaneous "Generate New NPC" requests (double-click,
or two open tabs) both pass `enforceEntryCapOnGenerate` while the count
still reads 29, both proceed through generation, both save — the world
lands at 31, one over its cap.

**Why not just reuse `confirmEntry.js`'s exact lock shape:** confirm-entry
can afford to hold its lock for the whole handler because by the time it
runs, there's no AI call left to make — it's a pure DB write, "cheap to
hold for the whole handler" per its own comment. A `/generate-X` route
has a real Claude/Gemini call in between the check and the save; holding
one lock per world across that would serialize every generation request
for a world (can't generate an NPC and an Item at the same time anymore)
just to close a narrow race window at the cap boundary — a much bigger
UX regression than the bug being fixed.

**Fix:** `middleware/enforceEntryCap.js` now tracks in-process
reservations per world (`pendingReservations` — a plain `Map`, same
in-process-only tradeoff as `lib/asyncLock.js`'s `withLock`/
`chromiumSemaphore`, not multi-instance safe, not needed at current
single-instance beta scale). `reserveEntryCapSlot(worldId, userId)` runs
the check-and-reserve step — a couple of DB reads plus an in-memory
increment, no AI call — inside `withLock(`entry-cap:${worldId}`, ...)`,
the SAME lock key `confirmEntry.js` already uses, so the two code paths
now serialize against each other too (a concurrent manual-create and a
concurrent AI-generate for the same world's last slot can no longer both
win). `checkEntryCap()` folds `pendingReservations.get(worldId)` into its
count-vs-cap comparison, so a reservation stands in for the row that
doesn't exist yet. `enforceEntryCapOnGenerate` releases the reservation
via `res.on("finish", ...)` — fires whether the request ultimately saves,
errors downstream, or (for the reject branch) never got a reservation in
the first place — so no individual `/generate-X` route file needed to
change at all; the whole fix is contained in the one middleware file.

## Bug 2 — lost update on purchased entry packs

`lib/worldConfigRepo.js`'s `addPurchasedEntries()` was a plain
read-modify-write: `getOrCreateWorldConfig` (select) → `newTotal =
(config.entries_purchased || 0) + amount` → `update`. Its own comment
justified this as safe because it's "only ever called once per Stripe
webhook event (effectively serial)" — true for a single event, but that
says nothing about two *different* events racing each other, and
Express/Node happily processes two concurrent webhook POSTs in parallel.
Contrast with the parallel AI-credits path: `lib/billingRepo.js`'s
`addCredits()` deliberately inserts an append-only `credit_ledger` row
(summed later via the `get_credit_balance` RPC) specifically so
concurrent purchases can't race — the entry-pack feature didn't follow
that established pattern and reintroduced a plain counter column instead.

**Repro (pre-fix):** a user buys two $5/25-entry packs in quick succession
(re-clicking "Buy" because the first didn't visibly confirm fast enough,
or Stripe redelivering under load). Two `checkout.session.completed`
webhook events for the same `worldId` arrive close together; both
`addPurchasedEntries` calls read the same starting `entries_purchased`
before either writes back, and one purchase's +25 entries is silently
lost — the user paid for 50 extra entries but the world only gets 25.

**Fix:** `migrations/026_atomic_entries_purchased_increment.sql` adds
`increment_entries_purchased(p_world_id, p_amount)`, a single-round-trip
`UPDATE ... SET entries_purchased = coalesce(entries_purchased, 0) +
p_amount ... RETURNING entries_purchased` — same shape as
`migrations/006`/`018`'s `check_and_increment_generation_count`/
`refund_generation_count`. `addPurchasedEntries()` now calls this RPC
instead of doing the read-modify-write in JS. **Not yet applied to the
real database — needs to be run by hand against Supabase, no migration
runner in this repo.**

## Verification

- `scripts/testEntryCapRefund.js` gained a new case
  (`testReservationClosesRace`): fires two `enforceEntryCapOnGenerate`
  calls concurrently for a world with exactly one slot left, confirms
  exactly one gets through and the other is rejected (with its already-
  spent generation points refunded, per the existing refund coverage in
  the same file), then confirms a third request is allowed again once the
  first's reservation is released via a simulated `res` `"finish"` event.
  Also extended `makeRes()` there to support `.on("finish", ...)` the same
  way real Express does.
- `scripts/testEntriesPurchasedIncrement.js` is new: fires two concurrent
  `addPurchasedEntries()` calls against `scripts/lib/fakeSupabase.js`'s
  in-memory RPC fake (which gained a `increment_entries_purchased` case
  mirroring the real function's semantics) and confirms both purchases
  land (`entries_purchased` ends at 50, not 25).
- Full regression run: all 18 existing `scripts/test*.js` files plus both
  new/changed ones pass. Manual `node server.js` boot with a full set of
  faked env vars (including Stripe) confirmed no crash.
- **Not verified against the real database in this sandbox** — same
  standing network-egress limitation noted in prior sessions' addenda
  (`Host not in allowlist: <supabase-host>`). The migration needs to be
  applied by hand and the reservation/RPC behavior spot-checked against
  the real Supabase project before fully trusting it in production, same
  as every other migration shipped this way.

## Scope notes

Both fixes are narrowly scoped to the two identified races — no other
behavior in `middleware/enforceEntryCap.js` or `lib/worldConfigRepo.js`
changed. `routes/billing.js`'s own `buildEntryCapStatus()` (the Settings-
page usage display) calls `countEntries`/`getEntriesPurchased` directly,
not `checkEntryCap()`, so it's unaffected by the reservation counter and
still shows the world's real, committed entry count — reservations are
deliberately invisible outside the cap-gating decision itself.
