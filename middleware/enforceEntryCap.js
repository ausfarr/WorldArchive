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
async function enforceEntryCapOnGenerate(req, res, next) {
  try {
    if (req.body && req.body.fillExistingId) return next();
    const result = await checkEntryCap(req.worldId, req.userId);
    if (!result.allowed) {
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
