// middleware/enforceEntryCap.js
//
// v0.9 Manual Mode, Piece 1 -- see session_addendum_manual_entry_mode_shipped.md.
//
// Gates entry CREATION (not edits) behind a per-world cap, independent
// of the generation cap in enforceGenerationCap.js:
//   - Active subscribers: unlimited entries (a subscription perk).
//   - Everyone else (free/trial, manual-only, credit-pack buyers alike):
//     30 entries per world, +25 per $5 entry pack purchased.
//
// This applies to EVERY entry regardless of how it was made -- AI
// generation and manual creation both count against the same cap. The
// generation cap controls AI spend; this one controls how much of the
// app's structural value (archive/PDF/maps/Quests) a free account can
// build out.
//
// Same BILLING_ENABLED kill switch as enforceGenerationCap.js: while
// billing is off (legacy beta default), there is no entry cap at all,
// same as there's no trial/subscription concept at all yet.
//
// Entry-cap race fix: two near-simultaneous /generate-X requests (a
// double-click, or two tabs) could previously both pass the cap check
// while sitting one below the cap, since a real AI call (several
// seconds) sits between the check and the eventual save. See
// reserveEntryCapSlot() below for the in-process reservation that closes
// this the same way routes/confirmEntry.js's withLock() already closed
// the identical race on its own (lock-for-the-whole-request) write path.
const { getSubscription } = require("../lib/billingRepo");
const { countEntries } = require("../lib/entriesRepo");
const { getEntriesPurchased, FREE_ENTRY_CAP } = require("../lib/worldConfigRepo");
const { withLock } = require("../lib/asyncLock");

const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

// In-flight reservations, keyed by worldId -- see reserveEntryCapSlot()
// below for why these exist. Plain in-process counters, same tradeoff as
// lib/asyncLock.js's withLock/chromiumSemaphore: doesn't help across
// multiple server instances behind a load balancer, not needed at
// current single-instance beta scale.
const pendingReservations = new Map();

function addReservation(worldId) {
  pendingReservations.set(worldId, (pendingReservations.get(worldId) || 0) + 1);
}

function releaseReservation(worldId) {
  const current = pendingReservations.get(worldId) || 0;
  if (current <= 1) pendingReservations.delete(worldId);
  else pendingReservations.set(worldId, current - 1);
}

// Returns { allowed, unlimited, count?, cap? }. Callers that already
// know they're editing an existing entry (not creating one) should
// never call this -- see routes/confirmEntry.js for the existence check
// that decides whether to call this at all.
//
// Counts this world's pending reservations (see reserveEntryCapSlot())
// alongside the real row count so a generation still in flight -- which
// hasn't landed a row yet -- still holds its claimed slot against the cap.
async function checkEntryCap(worldId, userId) {
  if (!BILLING_ENABLED) return { allowed: true, unlimited: true };

  const subscription = await getSubscription(userId);
  if (subscription && subscription.status === "active") {
    return { allowed: true, unlimited: true };
  }

  const [count, purchased] = await Promise.all([
    countEntries(worldId),
    getEntriesPurchased(worldId)
  ]);
  const cap = FREE_ENTRY_CAP + purchased;
  const reserved = pendingReservations.get(worldId) || 0;
  return { allowed: count + reserved < cap, unlimited: false, count, cap };
}

// Atomically checks the cap and, if allowed, reserves a slot for it --
// closes the same check-then-act race routes/confirmEntry.js's withLock()
// fixes for its own write path (see that file's comment on the identical
// problem), but a /generate-X route can't just hold a lock for its whole
// duration the way confirm-entry does: a real Claude/Gemini call (several
// seconds) sits between the cap check here and the eventual save, and
// serializing every generation request for a world behind one lock would
// kill legitimate concurrency (generating an NPC while also generating an
// Item, say) just to close a narrow race window at the cap boundary.
//
// Instead, only the cheap check-and-reserve step below runs inside the
// lock (a couple of DB reads plus an in-memory increment -- no AI call),
// using the SAME `entry-cap:${worldId}` key confirm-entry.js locks on, so
// the two code paths serialize against each other too. The reservation
// itself is released later, whether the request ultimately saves, errors,
// or the cap itself rejects it (see enforceEntryCapOnGenerate below) --
// holding it open for that long, unlocked, is what lets the reservation
// (not a full lock) stand in for the row that doesn't exist yet.
async function reserveEntryCapSlot(worldId, userId) {
  return withLock(`entry-cap:${worldId}`, async () => {
    const result = await checkEntryCap(worldId, userId);
    if (result.allowed && !result.unlimited) addReservation(worldId);
    return result;
  });
}

// Express middleware for the 8 /generate-X routes. Skips entirely when
// fillExistingId is present in the body -- that targets a row that
// already exists (fill a placeholder or regenerate), so no new entry is
// being created and the cap doesn't apply. Must run AFTER
// enforceGenerationCap (order doesn't matter for correctness here, but
// matching declaration order in each route keeps both caps visible
// together at a glance).
//
// Multi-ruleset genericization, Phase 12 (Differential Billing): also
// skips entirely when mode === "import" (currently only 5e Bestiary's
// Import tier, routes/generateEnemy.js) -- an imported entry is a
// straight copy of a real srd_library row at zero AI cost, and
// world_forge_scope.md's data model calls out world_srd_imports as the
// record of "this got imported" precisely so importing doesn't eat into
// a free world's entry budget the way an authored entry does. This is
// an explicit, named bypass here at the route-gate level rather than a
// special case buried inside checkEntryCap() -- checkEntryCap() has no
// idea what a "mode" is and shouldn't need to; it just answers "is this
// world under its cap," and it's this middleware's job to decide when
// that question even applies.
async function enforceEntryCapOnGenerate(req, res, next) {
  try {
    if (req.body && req.body.fillExistingId) return next();
    if (req.body && req.body.mode === "import") return next();
    const result = await reserveEntryCapSlot(req.worldId, req.userId);
    if (!result.allowed) {
      // enforceGenerationCap (mounted before this middleware on every
      // /generate-X route) already deducted points/quota/a credit for
      // this request before we knew the entry cap itself would block it
      // -- without this refund, a world sitting at its entry cap burns a
      // full generation's spend on every single attempt for zero output,
      // same failure mode migrations/018_generation_refund.sql and
      // req.refundGeneration() exist to close everywhere else (see
      // routes/generateEnemy.js's catch block for the same pattern).
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(403).json({
        error: "entry_cap_reached",
        message: `You've reached the ${result.cap}-entry limit for this world. Subscribe for unlimited entries, or buy more from Settings.`,
        cap: result.cap,
        count: result.count
      });
    }
    // A slot was reserved above -- release it once this request is fully
    // done (success, downstream error, whatever) so it stops counting
    // against the cap. By then the save either landed (countEntries()
    // reflects it for real) or didn't (nothing to hold open for). "finish"
    // fires for every response this route can produce, so no individual
    // /generate-X route needs to know this bookkeeping exists.
    if (!result.unlimited) res.on("finish", () => releaseReservation(req.worldId));
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { checkEntryCap, reserveEntryCapSlot, enforceEntryCapOnGenerate, BILLING_ENABLED };
