// lib/regenerateGate.js
//
// Subscription gate for Regenerate/Remix (v1.1 split-quota pricing
// decision): a free-account (or no-account) user can generate a brand-new
// entry or fill a locked placeholder within their quota, but regenerating
// an entry that's ALREADY been generated is a subscriber-only feature,
// even if they have generation points left. Reuses
// lib/billingRepo.js#getSubscription -- the same "does this user have an
// active subscription" check middleware/enforceGenerationCap.js already
// makes -- since req.userId is already set globally by
// middleware/resolveTenant.js by the time any route reaches this.
//
// Not Express middleware, deliberately: the fill-vs-regenerate branch this
// needs to run after is duplicated per-route (each of the 7 generate
// routes determines `mode` itself), not centralized behind one
// route-level middleware call. Callers invoke this right after `mode` is
// known to be "regenerate", BEFORE any further Claude/Gemini spend --
// same "gate before spend" convention middleware/enforceGenerationCap.js
// already follows.
//
// Gated behind BILLING_ENABLED (same kill switch as everything else in
// enforceGenerationCap.js) so this stays a no-op locally/pre-launch,
// exactly like every other tier check in this codebase.

const { BILLING_ENABLED } = require("../middleware/enforceGenerationCap");
const { getSubscription } = require("./billingRepo");
const { isActiveSubscription } = require("./billingTier");
const { isAdminEmail } = require("./adminAccess");

const CONTACT_EMAIL = "ausfarr@gmail.com";

// Returns { allowed: true } or { allowed: false, body: <403 JSON body> }.
// The caller is responsible for refunding any generation points
// enforceGenerationCap's middleware already spent before the route
// handler reached this point (that middleware runs before `mode` is even
// known) and for sending `res.status(403).json(gate.body)`.
async function requireSubscriptionToRegenerate(req) {
  if (!BILLING_ENABLED) return { allowed: true };
  // Admins (lib/adminAccess.js allowlist) get every paid perk without a
  // subscription row -- the owner needs to exercise the whole product
  // with billing ON in production, not just in a BILLING_ENABLED=false
  // local run. Same bypass as enforceGenerationCap/enforceEntryCap.
  if (isAdminEmail(req.userEmail)) return { allowed: true };
  const subscription = await getSubscription(req.userId);
  // isActiveSubscription (not a bare status check) so a stale 'active' row
  // left by a missed webhook doesn't keep the subscriber perk forever --
  // see lib/billingTier.js#isStaleActive (bug batch 1 audit, item 2).
  if (isActiveSubscription(subscription)) return { allowed: true };
  return {
    allowed: false,
    body: {
      error: "regenerate_requires_subscription",
      message: `Regenerating an existing entry is a subscriber feature. Subscribe to revise entries anytime, or email ${CONTACT_EMAIL} with questions.`
    }
  };
}

module.exports = { requireSubscriptionToRegenerate };
