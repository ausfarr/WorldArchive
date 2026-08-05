// routes/billing.js
//
// User-facing billing routes, all under /api (gated by resolveTenant --
// req.userId/req.userEmail/req.worldId are available). Actual state
// changes (subscription created/renewed/canceled, credits granted)
// happen in routes/stripeWebhook.js, driven by Stripe's own events --
// these routes only ever kick off a Checkout/Portal session or report
// current status, never write subscription/credit state directly.

const express = require("express");
const { stripe } = require("../lib/stripeClient");
const { getPlan, getSubscription, getCreditBalance, DEFAULT_PLAN_ID, TRIAL_CAP } = require("../lib/billingRepo");
const { getGenerationCount, GENERATION_CAP, getEntriesPurchased, FREE_ENTRY_CAP } = require("../lib/worldConfigRepo");
const { countEntries } = require("../lib/entriesRepo");

const router = express.Router();

// Same kill switch as middleware/enforceGenerationCap.js -- see that
// file's header comment for the full explanation. Guarded here too
// (not just hidden in the Settings UI) so a direct API call can't start
// a real checkout while billing is supposed to be off.
const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

// Base URL for Checkout/Portal redirects. Defaults to the production
// app domain -- override with APP_BASE_URL in Render for any other
// environment (local dev, a preview deploy, etc.).
const APP_BASE_URL = process.env.APP_BASE_URL || "https://app.chronicled.world";

// One-time Price ID for the $2 / 5-credit pack -- separate from the
// `plans` table since it's not a recurring plan. Set in Render env vars.
const CREDIT_PRICE_ID = process.env.STRIPE_CREDIT_PRICE_ID;

// One-time Price ID for the $5 / 25-entry pack -- v0.9 Manual Mode. Same
// pattern as CREDIT_PRICE_ID above, separate Stripe product/price. Set
// in Render env vars once created in the Stripe Dashboard.
const ENTRY_PACK_PRICE_ID = process.env.STRIPE_ENTRY_PACK_PRICE_ID;

// Entry cap status for the Settings page, folded into /billing/status
// below. `unlimited: true` for active subscribers (see
// middleware/enforceEntryCap.js's identical logic -- kept in sync
// manually since this is a read-only status report, not a gate).
async function buildEntryCapStatus(worldId, subscriptionActive) {
  if (!BILLING_ENABLED || subscriptionActive) {
    return { unlimited: true };
  }
  const [count, purchased] = await Promise.all([
    countEntries(worldId),
    getEntriesPurchased(worldId)
  ]);
  const cap = FREE_ENTRY_CAP + purchased;
  return { unlimited: false, count, cap, remaining: Math.max(0, cap - count) };
}

// Combined trial/subscription/credit status for the Settings page.
router.get("/billing/status", async (req, res) => {
  try {
    if (!BILLING_ENABLED) {
      const used = await getGenerationCount(req.worldId);
      return res.json({
        state: "beta",
        used,
        cap: GENERATION_CAP,
        remaining: Math.max(0, GENERATION_CAP - used),
        entryCap: await buildEntryCapStatus(req.worldId, false)
      });
    }

    const subscription = await getSubscription(req.userId);
    const creditBalance = await getCreditBalance(req.userId);
    const subscriptionActive = !!(subscription && subscription.status === "active");

    if (!subscription) {
      const trialUsed = await getGenerationCount(req.worldId);
      return res.json({
        state: "trial",
        trialUsed,
        trialCap: TRIAL_CAP,
        trialRemaining: Math.max(0, TRIAL_CAP - trialUsed),
        creditBalance,
        entryCap: await buildEntryCapStatus(req.worldId, subscriptionActive)
      });
    }

    const plan = await getPlan(subscription.plan_id);
    res.json({
      state: "subscribed",
      status: subscription.status,
      planName: plan.name,
      monthlyQuota: plan.monthly_quota,
      usedThisCycle: subscription.used_this_cycle,
      remainingThisCycle: Math.max(0, plan.monthly_quota - subscription.used_this_cycle),
      currentPeriodEnd: subscription.current_period_end,
      creditBalance,
      entryCap: await buildEntryCapStatus(req.worldId, subscriptionActive)
    });
  } catch (err) {
    console.error("Loading billing status failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Kicks off a Stripe Checkout Session for the single subscription plan.
// Returns a URL the frontend redirects the browser to -- Stripe hosts
// the actual payment form, nothing card-related ever touches our server.
router.post("/billing/checkout/subscribe", async (req, res) => {
  if (!BILLING_ENABLED) {
    return res.status(403).json({ error: "Billing isn't turned on yet." });
  }
  try {
    const plan = await getPlan(DEFAULT_PLAN_ID);
    const existing = await getSubscription(req.userId);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      client_reference_id: req.userId,
      customer: existing ? existing.stripe_customer_id : undefined,
      customer_email: existing ? undefined : req.userEmail,
      success_url: `${APP_BASE_URL}/settings.html?billing=success`,
      cancel_url: `${APP_BASE_URL}/settings.html?billing=canceled`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Creating subscribe checkout session failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Kicks off a one-time Checkout Session for credit packs. `packs` is the
// number of 5-credit/$2 units to buy (e.g. packs: 4 = 20 credits / $8).
router.post("/billing/checkout/credits", async (req, res) => {
  if (!BILLING_ENABLED) {
    return res.status(403).json({ error: "Billing isn't turned on yet." });
  }
  try {
    const packs = parseInt(req.body.packs, 10);
    if (!Number.isInteger(packs) || packs < 1) {
      return res.status(400).json({ error: "packs must be a positive integer." });
    }
    if (!CREDIT_PRICE_ID) {
      return res.status(500).json({ error: "STRIPE_CREDIT_PRICE_ID is not configured." });
    }

    const existing = await getSubscription(req.userId);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: CREDIT_PRICE_ID, quantity: packs }],
      client_reference_id: req.userId,
      customer: existing ? existing.stripe_customer_id : undefined,
      customer_email: existing ? undefined : req.userEmail,
      success_url: `${APP_BASE_URL}/settings.html?billing=success`,
      cancel_url: `${APP_BASE_URL}/settings.html?billing=canceled`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Creating credits checkout session failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Kicks off a one-time Checkout Session for entry packs ($5 / +25
// entries per world, v0.9 Manual Mode). `packs` is the number of
// 25-entry/$5 units to buy. worldId travels in metadata (not
// client_reference_id, which stays userId for consistency with the
// other checkout routes) since entries_purchased is a per-world column
// -- see routes/stripeWebhook.js's handleCheckoutCompleted for where
// this gets read back out.
router.post("/billing/checkout/entries", async (req, res) => {
  if (!BILLING_ENABLED) {
    return res.status(403).json({ error: "Billing isn't turned on yet." });
  }
  try {
    const packs = parseInt(req.body.packs, 10);
    if (!Number.isInteger(packs) || packs < 1) {
      return res.status(400).json({ error: "packs must be a positive integer." });
    }
    if (!ENTRY_PACK_PRICE_ID) {
      return res.status(500).json({ error: "STRIPE_ENTRY_PACK_PRICE_ID is not configured." });
    }

    const existing = await getSubscription(req.userId);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: ENTRY_PACK_PRICE_ID, quantity: packs }],
      client_reference_id: req.userId,
      metadata: { type: "entry_pack", worldId: req.worldId },
      customer: existing ? existing.stripe_customer_id : undefined,
      customer_email: existing ? undefined : req.userEmail,
      success_url: `${APP_BASE_URL}/settings.html?billing=success`,
      cancel_url: `${APP_BASE_URL}/settings.html?billing=canceled`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Creating entries checkout session failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe-hosted self-serve portal: cancel, update payment method, view
// invoices. Only available once a Stripe customer exists (i.e. they've
// subscribed or bought credits at least once).
router.post("/billing/portal", async (req, res) => {
  if (!BILLING_ENABLED) {
    return res.status(403).json({ error: "Billing isn't turned on yet." });
  }
  try {
    const subscription = await getSubscription(req.userId);
    if (!subscription) {
      return res.status(400).json({ error: "No billing account yet -- subscribe first." });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${APP_BASE_URL}/settings.html`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Creating billing portal session failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
