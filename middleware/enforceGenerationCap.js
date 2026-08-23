// middleware/enforceGenerationCap.js
//
// Gates the 7 non-wizard content-generation routes (/generate-npc,
// -enemy, -item, -survivor, -log, -class, -faction) behind usage limits.
// As of v0.9 Manual Mode, Piece 2, also gates /api/field-assist, at a
// cheaper points cost (see below) -- reused rather than duplicated into
// a parallel middleware, since it's the exact same three-tier check
// (legacy beta / trial / subscription+credits), just spending a
// different number of points.
//
// BILLING_ENABLED env var is the kill switch for the entire Phase 5
// billing system:
//   - unset or "false" (default): LEGACY beta behavior -- flat 25-
//     generation lifetime cap, no trial/subscription/credit concepts at
//     all. This is deliberately the default so re-deploying this code
//     doesn't retroactively lock out existing beta testers who already
//     used more than the new 10-generation trial cap under the old
//     25-cap system -- see session_addendum_billing_toggle.md.
//   - "true": full Phase 5 behavior -- trial (10, no card) then
//     subscription monthly quota then rollover credits. See
//     lib/billingRepo.js and migrations/012_billing.sql.
//
// Flip BILLING_ENABLED=true in Render (env var, no code change, no
// redeploy needed beyond the restart Render does automatically) when
// ready to actually turn billing on for everyone.
//
// POINTS (v0.9 Piece 2): every cap/quota/credit number this file reads
// is now in points, not raw generations -- 1 full generation = 5 points,
// 1 field assist = 1 point (see migrations/015_field_assist_points.sql
// for the full reasoning). enforceGenerationCap() takes an `amount` of
// points to spend, defaulting to a full generation's cost so the 7
// existing call sites below don't need to change at all.
//
// Must run BEFORE any Claude/Gemini call in the route it guards -- the
// point is preventing spend, not reporting it after the fact. Apply as
// route-level middleware, e.g.:
//   router.post("/generate-npc", enforceGenerationCap, async (req, res) => {...
//   router.post("/field-assist", enforceFieldAssist, async (req, res) => {...
//
// On a successful spend, attaches req.refundGeneration() -- an
// idempotent, non-throwing async function routes should call from their
// catch block if the downstream Claude/Gemini call (or JSON parse, or
// image generation) fails. Without this, a failed generation permanently
// burned the point/cap/credit already deducted for zero output. See
// migrations/018_generation_refund.sql.
const {
  checkAndIncrementGenerationCount, refundGenerationCount, GENERATION_CAP, POINTS_PER_GENERATION, POINTS_PER_FIELD_ASSIST,
  FREE_MONTHLY_GENERATION_CAP, FREE_MONTHLY_IMAGE_CAP, resetFreeCycleIfElapsed,
  checkAndIncrementImageGenerationCount, refundImageGenerationCount
} = require("../lib/worldConfigRepo");
const {
  getSubscription, spendSubscriptionGeneration, refundSubscriptionGeneration,
  spendSubscriptionImageGeneration, refundSubscriptionImageGeneration
} = require("../lib/billingRepo");

const CONTACT_EMAIL = "ausfarr@gmail.com";

const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

async function enforceGenerationCap(req, res, next, amount = POINTS_PER_GENERATION) {
  try {
    if (!BILLING_ENABLED) {
      // Legacy beta flow -- same behavior as before Phase 5 existed.
      const { allowed, count } = await checkAndIncrementGenerationCount(req.worldId, GENERATION_CAP, amount);
      if (!allowed) {
        // `count` is the unchanged current count on a rejected call --
        // remainingPoints can be > 0 here even when a full generation
        // (amount=5) gets blocked, e.g. 3 points left isn't enough for a
        // generation but is still 3 spendable field assists. Message
        // reflects that instead of implying nothing at all is left.
        const remainingPoints = Math.max(0, GENERATION_CAP - count);
        const partialNote = (amount === POINTS_PER_GENERATION && remainingPoints > 0)
          ? ` You do still have enough left for ${remainingPoints} more field assist${remainingPoints === 1 ? "" : "s"}, if that helps.`
          : "";
        return res.status(403).json({
          error: "generation_cap_reached",
          message: `You've used all ${Math.floor(GENERATION_CAP / POINTS_PER_GENERATION)} generations included in this beta -- thanks for putting it through its paces!${partialNote} Email ${CONTACT_EMAIL} if you'd like more.`,
          cap: GENERATION_CAP
        });
      }
      req.generationCount = count;
      req.refundGeneration = makeRefundOnce((amt) => refundGenerationCount(req.worldId, amt), amount);
      return next();
    }

    const subscription = await getSubscription(req.userId);

    if (subscription) {
      const result = await spendSubscriptionGeneration(req.userId, amount);
      if (!result.allowed) {
        const outOfEverything = amount === POINTS_PER_FIELD_ASSIST
          ? "You're out of generations and credits, so there's nothing left to spend on a field assist either."
          : "You've used this cycle's included generations and have no credits left.";
        return res.status(403).json({
          error: "generation_limit_reached",
          message: `${outOfEverything} Buy more credits or wait for your plan to renew.`,
          usedThisCycle: result.usedThisCycle,
          creditBalance: result.creditBalance
        });
      }
      req.generationSource = result.source; // 'quota' | 'credit'
      req.refundGeneration = makeRefundOnce((amt) => refundSubscriptionGeneration(req.userId, amt, result.source), amount);
      return next();
    }

    // No subscriptions row -- free account. v1.1 split-quota pricing: this
    // is a genuinely recurring MONTHLY allowance (migrations/029), not the
    // old one-time TRIAL_CAP -- reset first so a request right after the
    // cycle rolls over sees a clean slate before the check below.
    await resetFreeCycleIfElapsed(req.worldId);
    const { allowed, count } = await checkAndIncrementGenerationCount(req.worldId, FREE_MONTHLY_GENERATION_CAP, amount);
    if (!allowed) {
      const remainingPoints = Math.max(0, FREE_MONTHLY_GENERATION_CAP - count);
      const partialNote = (amount === POINTS_PER_GENERATION && remainingPoints > 0)
        ? ` You do still have enough left for ${remainingPoints} more field assist${remainingPoints === 1 ? "" : "s"}, if that helps.`
        : "";
      return res.status(403).json({
        error: "free_cap_reached",
        message: `You've used all ${Math.floor(FREE_MONTHLY_GENERATION_CAP / POINTS_PER_GENERATION)} free generations this month.${partialNote} Subscribe to keep creating, or email ${CONTACT_EMAIL} with questions.`,
        cap: FREE_MONTHLY_GENERATION_CAP
      });
    }
    req.generationCount = count;
    req.refundGeneration = makeRefundOnce((amt) => refundGenerationCount(req.worldId, amt), amount);
    next();
  } catch (err) {
    next(err);
  }
}

// Image-quota counterpart to enforceGenerationCap -- guards
// routes/generateEntryImage.js and routes/dungeonMap.js instead of the 7
// text-generation routes. Same three-tier shape, but images are tracked
// as a separate, plain-count quota (see migrations/029_split_generation_quotas.sql)
// rather than drawing from the shared points pool -- images cost ~10x
// more per unit than a text generation, so a subscriber's "50 generations
// + 10 images/month" can't be expressed as one pool. `amount` is always 1
// in practice (one portrait or one battle-map bake); no field-assist
// equivalent exists for images.
//
// Legacy (BILLING_ENABLED unset) intentionally does NOT get a separate
// image pool -- that fallback is dead in production and not worth
// splitting; images there still draw from the same GENERATION_CAP pool
// as text, exactly as before this migration.
async function enforceImageGenerationCap(req, res, next, amount = 1) {
  try {
    if (!BILLING_ENABLED) {
      return enforceGenerationCap(req, res, next, POINTS_PER_GENERATION * amount);
    }

    const subscription = await getSubscription(req.userId);

    if (subscription) {
      const result = await spendSubscriptionImageGeneration(req.userId, amount);
      if (!result.allowed) {
        return res.status(403).json({
          error: "image_limit_reached",
          message: "You've used this cycle's included images. Wait for your plan to renew, or email " + CONTACT_EMAIL + " with questions.",
          usedImagesThisCycle: result.usedImagesThisCycle
        });
      }
      req.refundImageGeneration = makeRefundOnce((amt) => refundSubscriptionImageGeneration(req.userId, amt), amount);
      return next();
    }

    // No subscriptions row -- free account's recurring monthly image
    // allowance (FREE_MONTHLY_IMAGE_CAP). Same reset call as the text
    // path -- both counters live on the same world_config row and reset
    // together.
    await resetFreeCycleIfElapsed(req.worldId);
    const { allowed, count } = await checkAndIncrementImageGenerationCount(req.worldId, FREE_MONTHLY_IMAGE_CAP, amount);
    if (!allowed) {
      return res.status(403).json({
        error: "free_image_cap_reached",
        message: `You've used your ${FREE_MONTHLY_IMAGE_CAP} free image${FREE_MONTHLY_IMAGE_CAP === 1 ? "" : "s"} this month. Subscribe to keep generating images, or email ${CONTACT_EMAIL} with questions.`,
        cap: FREE_MONTHLY_IMAGE_CAP
      });
    }
    req.imageGenerationCount = count;
    req.refundImageGeneration = makeRefundOnce((amt) => refundImageGenerationCount(req.worldId, amt), amount);
    next();
  } catch (err) {
    next(err);
  }
}

// Wraps a tier-specific refund call as a safe, non-throwing function
// attached to req.refundGeneration -- every route's catch block can just
// call `await req.refundGeneration();` with no extra try/catch
// boilerplate, and it refunds whatever's left of this request's spend
// (idempotent -- a second no-arg call is a no-op, so a route with
// multiple catch paths, or one that double-checks, can't double-refund).
//
// Multi-ruleset genericization, Phase 12 (Differential Billing): also
// accepts an optional partial amount --
// `req.refundGeneration(POINTS_PER_GENERATION - POINTS_PER_FIELD_ASSIST)`
// refunds just the difference between what enforceGenerationCap already
// spent and what a cheaper tier (e.g. Reflavor) should actually cost,
// leaving the rest spent rather than the whole thing refunded. Clamped
// to never refund more than is actually left outstanding, so a caller
// can't accidentally over-refund by passing a bad number.
//
// Swallows its own errors (logs and moves on) rather than throwing,
// since a refund failure should never mask or replace the route's real
// error response to the user; on failure, restores the attempted amount
// to `remaining` so a later retry (rare, but possible if a route calls
// this from more than one place) can still succeed.
function makeRefundOnce(doRefund, fullAmount) {
  let remaining = fullAmount;
  return async function refundGeneration(partialAmount) {
    if (remaining <= 0) return;
    const amountToRefund = partialAmount != null ? Math.min(partialAmount, remaining) : remaining;
    if (amountToRefund <= 0) return;
    remaining -= amountToRefund;
    try {
      await doRefund(amountToRefund);
    } catch (err) {
      console.error("Generation refund failed:", err);
      remaining += amountToRefund;
    }
  };
}

// Field-assist variant -- same three-tier check, spends
// POINTS_PER_FIELD_ASSIST (1) instead of a full generation's 5. A plain
// wrapper rather than a default param at the route-mounting call site,
// so it reads the same way as every other named middleware in this
// codebase (router.post("/field-assist", enforceFieldAssist, ...)).
function enforceFieldAssist(req, res, next) {
  return enforceGenerationCap(req, res, next, POINTS_PER_FIELD_ASSIST);
}

// makeRefundOnce is exported for scripts/testRefundLogic.js -- every
// other function in this file needs a live Supabase connection
// (checkAndIncrementGenerationCount, getSubscription, etc.) to exercise
// end-to-end, but the refund-amount bookkeeping itself is pure and
// worth testing directly against a fake doRefund callback.
module.exports = { enforceGenerationCap, enforceFieldAssist, enforceImageGenerationCap, makeRefundOnce, BILLING_ENABLED };
