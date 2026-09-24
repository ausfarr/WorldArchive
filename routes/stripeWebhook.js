// routes/stripeWebhook.js
//
// Handles Stripe webhook events. Mounted in server.js BEFORE both
// resolveTenant (this isn't a user-authenticated request -- Stripe calls
// it directly, verified by signature instead of a JWT) and the global
// express.json() body parser (signature verification needs the RAW
// request body bytes, not a parsed object -- see the express.raw()
// middleware server.js applies specifically to this route's path).
//
// Events handled:
//   checkout.session.completed  -- new subscription OR credit pack
//                                   purchase, branch on session.mode
//   invoice.payment_succeeded   -- renewal: reset used_this_cycle,
//                                   reactivate if it was past_due
//   customer.subscription.updated -- keep status, current period, and
//                                   cancel_at_period_end in sync
//   customer.subscription.deleted -- mark canceled (account falls back to
//                                   the free tier; credits stay usable)
//   invoice.payment_failed      -- mark past_due (Stripe auto-retries;
//                                   meanwhile the account is on the free
//                                   tier + credits, see lib/billingTier.js,
//                                   until a retry succeeds)

const express = require("express");
const { stripe } = require("../lib/stripeClient");
const { getPlanByStripePriceId, upsertSubscription, setSubscriptionStatus, syncSubscriptionFromStripe, getSubscriptionByStripeId, getSubscription, addCredits, claimWebhookEvent, releaseWebhookEventClaim } = require("../lib/billingRepo");
const { stripePeriodFields } = require("../lib/billingTier");
const { addPurchasedEntries, POINTS_PER_GENERATION } = require("../lib/worldConfigRepo");

const router = express.Router();

// Credits/entries granted per pack unit purchased -- now defined once in
// lib/billingOffer.js (audit item 8), which Settings also reads to
// describe the packs, so the advertised size and the granted size can't
// drift. CREDITS_PER_PACK_UNIT still means "generations"; it's converted
// to points only at the addCredits() call below (v0.9 Manual Mode,
// Piece 2), since that's the one place the unit matters.
const { CREDITS_PER_PACK_UNIT, ENTRIES_PER_PACK_UNIT } = require("../lib/billingOffer");

// Audit item 2: Stripe does not guarantee event order and can drop
// deliveries, so the subscription.updated/deleted handlers re-read the
// subscription from Stripe and write ITS current state rather than the
// (possibly stale) snapshot inside the event. A delayed "updated: active"
// processed after "deleted" used to flip a canceled row back to active;
// with a fresh read it just re-writes "canceled".
async function retrieveFreshSubscription(eventSubscription) {
  return stripe.subscriptions.retrieve(eventSubscription.id);
}

async function handleCheckoutCompleted(session) {
  if (session.mode === "subscription") {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const priceId = subscription.items.data[0].price.id;
    const plan = await getPlanByStripePriceId(priceId);
    if (!plan) {
      console.error(`Stripe webhook: no plan found for price ${priceId} -- subscription ${subscription.id} not recorded.`);
      return;
    }
    const userId = session.client_reference_id;
    if (!userId) {
      console.error(`Stripe webhook: checkout.session.completed (subscription) missing client_reference_id -- session ${session.id}`);
      return;
    }
    // Also the resubscribe path for a lapsed account: upserting on
    // user_id overwrites the old canceled row's stripe_subscription_id and
    // status, and resetUsage zeroes both cycle counters, so the account is
    // straight back on the paid path. A late customer.subscription.deleted
    // for the OLD subscription id then matches no row and is a no-op.
    // Defense in depth for audit item 1 (routes/billing.js now refuses a
    // second checkout): if this account's row still points at a different
    // subscription that isn't finished, say so loudly -- that old
    // subscription is about to become untracked while Stripe may keep
    // billing it, and needs a manual cancel in the Stripe Dashboard.
    const prior = await getSubscriptionByStripeId(subscription.id) || null;
    const priorByUser = prior ? null : await getSubscription(userId);
    if (priorByUser && priorByUser.stripe_subscription_id !== subscription.id && !["canceled", "incomplete_expired"].includes(priorByUser.status)) {
      console.error(`Stripe webhook: user ${userId} started subscription ${subscription.id} while ${priorByUser.stripe_subscription_id} (status ${priorByUser.status}) was still on record -- check the old one in Stripe for double billing.`);
    }
    const { currentPeriodStart, currentPeriodEnd } = stripePeriodFields(subscription);
    await upsertSubscription({
      userId,
      planId: plan.id,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: subscription.id,
      status: "active",
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
      resetUsage: true
    });
    return;
  }

  if (session.mode === "payment") {
    const userId = session.client_reference_id;
    if (!userId) {
      console.error(`Stripe webhook: checkout.session.completed (payment) missing client_reference_id -- session ${session.id}`);
      return;
    }
    // line_items aren't expanded on the session object by default --
    // retrieve with expand to get quantity.
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, { expand: ["line_items"] });
    const quantity = fullSession.line_items && fullSession.line_items.data[0] ? fullSession.line_items.data[0].quantity : 1;

    // v0.9 Manual Mode: entry packs are a separate one-time product from
    // AI credit packs, distinguished by metadata.type set at checkout
    // (routes/billing.js's createEntriesCheckout) -- everything else
    // that hits this "payment" mode branch is a credit pack, the
    // original/default case.
    if (session.metadata && session.metadata.type === "entry_pack") {
      const worldId = session.metadata.worldId;
      if (!worldId) {
        console.error(`Stripe webhook: entry_pack checkout missing metadata.worldId -- session ${session.id}`);
        return;
      }
      const entries = quantity * ENTRIES_PER_PACK_UNIT;
      await addPurchasedEntries(worldId, entries);
      return;
    }

    // credit_ledger stores points, not raw generations (see
    // migrations/015_field_assist_points.sql) -- multiply here so a
    // purchase's real spending power (in generations) is unchanged,
    // while it's also usable a la carte on cheaper field assists.
    const credits = quantity * CREDITS_PER_PACK_UNIT * POINTS_PER_GENERATION;
    await addCredits({ userId, amount: credits, stripePaymentIntentId: session.payment_intent });
    return;
  }
}

async function handleInvoicePaymentSucceeded(invoice) {
  if (!invoice.subscription) return; // not a subscription invoice
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const existing = await getSubscriptionByStripeId(subscription.id);
  if (!existing) return; // checkout.session.completed will create it on first invoice

  const priceId = subscription.items.data[0].price.id;
  const plan = await getPlanByStripePriceId(priceId);

  // Audit item 3: only a real new cycle resets usage. Proration/plan-change
  // invoices ("subscription_update") and one-off invoices mid-cycle used
  // to hand out a fresh month's quota. billing_reason is always present
  // on real Stripe invoices; if it were ever missing, keep the old
  // behavior (reset) rather than risk never resetting a renewal.
  const reason = invoice.billing_reason;
  const resetUsage = reason == null || reason === "subscription_cycle" || reason === "subscription_create";
  const { currentPeriodStart, currentPeriodEnd } = stripePeriodFields(subscription);
  await upsertSubscription({
    userId: existing.user_id,
    planId: plan ? plan.id : existing.plan_id,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    status: "active",
    currentPeriodStart: currentPeriodStart || existing.current_period_start,
    currentPeriodEnd: currentPeriodEnd || existing.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    resetUsage
  });
}

// Bug batch 1, Phase 2: this used to sync status only, so a DM who hit
// "Cancel" in the Stripe portal (Stripe keeps status 'active' and sets
// cancel_at_period_end) still saw "Renews <date>" in Settings, and the
// stored period never moved except on a paid renewal. Now it syncs the
// period and cancel_at_period_end too (migrations/037 -- written without
// that column if the migration hasn't been run yet, see
// lib/billingRepo.js). Access is unchanged by cancel_at_period_end: the
// row stays 'active' with full quota until Stripe's period actually ends
// and customer.subscription.deleted arrives.
//
// Stripe's own status values (active, past_due, canceled, unpaid, etc.)
// pass through directly -- lib/billingTier.js decides what each one means
// for quota (canceled/unpaid/incomplete_expired fall back to the free
// tier; everything else stays on the subscription path).
async function handleSubscriptionUpdated(eventSubscription) {
  const existing = await getSubscriptionByStripeId(eventSubscription.id);
  if (!existing) return;
  // Fresh read (audit item 2). If Stripe can't be reached, throw -- the
  // handler 500s, the idempotency claim is released, and Stripe retries.
  const subscription = await retrieveFreshSubscription(eventSubscription);
  const { currentPeriodStart, currentPeriodEnd } = stripePeriodFields(subscription);
  await syncSubscriptionFromStripe(subscription.id, {
    status: subscription.status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: typeof subscription.cancel_at_period_end === "boolean" ? subscription.cancel_at_period_end : undefined
  });
}

// Marks the row canceled -> the account falls back to the free tier
// (lib/billingTier.js). current_period_end is what Settings shows as
// "Your subscription ended on <date>", so it's clamped to Stripe's
// ended_at when that's earlier: a cancel-at-period-end sub ends exactly
// at period end anyway, but an immediate cancel from the Dashboard ends
// mid-period and would otherwise claim it "ended" on a future date.
// cancel_at_period_end is cleared -- it's moot once the sub is over, and
// a stale true would be misleading if anything ever read it later.
async function handleSubscriptionDeleted(eventSubscription) {
  // Fresh read when possible (audit item 2); a deleted subscription is
  // terminal, so if Stripe can't be reached the event's own snapshot is
  // safe to use rather than failing the delivery.
  let subscription = eventSubscription;
  try {
    subscription = await retrieveFreshSubscription(eventSubscription);
  } catch (err) {
    console.warn(`Stripe webhook: couldn't re-read deleted subscription ${eventSubscription.id}, using the event payload:`, err.message);
  }
  const status = subscription.status && subscription.status !== "active" ? subscription.status : "canceled";
  const { currentPeriodStart, currentPeriodEnd } = stripePeriodFields(subscription);
  const endedAt = typeof subscription.ended_at === "number" ? new Date(subscription.ended_at * 1000).toISOString() : null;
  const effectiveEnd = endedAt && (!currentPeriodEnd || endedAt < currentPeriodEnd) ? endedAt : currentPeriodEnd;
  await syncSubscriptionFromStripe(subscription.id, {
    status,
    currentPeriodStart,
    currentPeriodEnd: effectiveEnd,
    cancelAtPeriodEnd: false
  });
}

async function handleInvoicePaymentFailed(invoice) {
  if (!invoice.subscription) return;
  await setSubscriptionStatus(invoice.subscription, "past_due");
}

// express.raw() (applied in server.js for this path) puts the raw Buffer
// on req.body -- do NOT swap this route to express.json(), it will break
// signature verification below.
router.post("/", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook signature verification failed.`);
  }

  // Claim event.id before doing anything else -- Stripe redelivers a
  // webhook whenever it doesn't get a fast 2xx, and checkout.session.
  // completed / invoice.payment_succeeded double-firing double-credits an
  // account or resets used_this_cycle for a free extra month. A failed
  // claim (already processed, or a concurrent duplicate delivery won the
  // race) is not an error -- just acknowledge and stop.
  let claimed = false;
  try {
    claimed = await claimWebhookEvent(event.id, event.type);
  } catch (err) {
    console.error(`Stripe webhook idempotency claim failed for event ${event.id}:`, err);
    return res.status(500).json({ error: "Webhook idempotency check failed." });
  }
  if (!claimed) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        // Unhandled event types are expected -- Stripe sends far more
        // event types than we act on. Not an error.
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`Stripe webhook handler failed for event ${event.type}:`, err);
    // Release the claim so a genuine Stripe retry of this same event.id
    // can actually reprocess it instead of being silently swallowed as
    // "already handled." 500 here tells Stripe to retry the delivery --
    // appropriate since the failure is on our end (DB write, etc.), not a
    // bad event.
    try {
      await releaseWebhookEventClaim(event.id);
    } catch (releaseErr) {
      console.error(`Stripe webhook claim release failed for event ${event.id}:`, releaseErr);
    }
    res.status(500).json({ error: "Webhook handler failed." });
  }
});

module.exports = router;
// Exposed for scripts/testBillingTier.js's fixture-event tests -- the
// handlers are plain async functions of a Stripe object; the router above
// only adds signature verification and idempotency around them.
module.exports.handlers = {
  handleCheckoutCompleted, handleInvoicePaymentSucceeded, handleSubscriptionUpdated,
  handleSubscriptionDeleted, handleInvoicePaymentFailed
};
