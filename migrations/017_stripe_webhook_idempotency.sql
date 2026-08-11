-- 017_stripe_webhook_idempotency.sql
--
-- Stripe redelivers a webhook event whenever it doesn't get a fast 2xx
-- (network blip, a slow handler, a transient DB error) -- the SAME
-- event.id comes through again, and nothing in routes/stripeWebhook.js
-- deduplicated that before this migration. checkout.session.completed
-- double-processed means addCredits()/addPurchasedEntries() runs twice
-- for one purchase; invoice.payment_succeeded double-processed means
-- upsertSubscription({resetUsage:true}) resets used_this_cycle back to 0
-- a second time, handing out a free extra month's quota.
--
-- One row per successfully-claimed event.id, used as a claim-then-process
-- lock (see lib/billingRepo.js's claimWebhookEvent/releaseWebhookEventClaim):
-- the webhook handler inserts a row for event.id BEFORE running any
-- handler logic; a unique-violation on that insert means this exact event
-- was already claimed (by a concurrent duplicate delivery, or a prior
-- successful run) and the handler skips straight to a 200 with no side
-- effects. If the handler itself throws, the claim row is deleted again
-- so a genuine Stripe retry can still get through.
create table if not exists stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
