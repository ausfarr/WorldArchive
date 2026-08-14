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
const { getSubscription } = require("../lib/billingRepo");
const { countEntries } = require("../lib/entriesRepo");
const { getEntriesPurchased, FREE_ENTRY_CAP } = require("../lib/worldConfigRepo");

const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

// Returns { allowed, unlimited, count?, cap? }. Callers that already
// know they're editing an existing entry (not creating one) should
// never call this -- see routes/confirmEntry.js for the existence check
// that decides whether to call this at all.
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
  return { allowed: count < cap, unlimited: false, count, cap };
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
    const result = await checkEntryCap(req.worldId, req.userId);
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
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { checkEntryCap, enforceEntryCapOnGenerate, BILLING_ENABLED };
