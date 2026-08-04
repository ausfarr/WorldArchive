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
const { getGenerationCount } = require("../lib/worldConfigRepo");

const router = express.Router();

// Base URL for Checkout/Portal redirects. Defaults to the production
// app domain -- override with APP_BASE_URL in Render for any other
// environment (local dev, a preview deploy, etc.).
const APP_BASE_URL = process.env.APP_BASE_URL || "https://app.chronicled.world";

// One-time Price ID for the $2 / 5-credit pack -- separate from the
// `plans` table since it's not a recurring plan. Set in Render env vars.
const CREDIT_PRICE_ID = process.env.STRIPE_CREDIT_PRICE_ID;

// Combined trial/subscription/credit status for the Settings page.
router.get("/billing/status", async (req, res) => {
  try {
    const subscription = await getSubscription(req.userId);
    const creditBalance = await getCreditBalance(req.userId);

    if (!subscription) {
      const trialUsed = await getGenerationCount(req.worldId);
      return res.json({
        state: "trial",
        trialUsed,
        trialCap: TRIAL_CAP,
        trialRemaining: Math.max(0, TRIAL_CAP - trialUsed),
        creditBalance
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
      creditBalance
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

// Stripe-hosted self-serve portal: cancel, update payment method, view
// invoices. Only available once a Stripe customer exists (i.e. they've
// subscribed or bought credits at least once).
router.post("/billing/portal", async (req, res) => {
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
