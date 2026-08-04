// lib/stripeClient.js
//
// Single shared Stripe SDK instance, same pattern as lib/supabaseClient.js.
// Requires STRIPE_SECRET_KEY -- a test-mode key (sk_test_...) during beta,
// swap to a live key (sk_live_...) in Render's env vars when ready to
// take real payments. Nothing else in the codebase needs to change for
// that swap.

const Stripe = require("stripe");

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY env var. Set it in Render (or locally) before starting the server.");
}

const stripe = new Stripe(stripeSecretKey);

module.exports = { stripe };
