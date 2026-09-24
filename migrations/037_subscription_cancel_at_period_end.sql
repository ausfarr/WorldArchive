-- 037_subscription_cancel_at_period_end.sql
--
-- Bug batch 1, Phase 2 (session_addendum_bug_batch_1.md): mirrors
-- Stripe's subscription.cancel_at_period_end so Settings can say
-- "Cancels on <date>" instead of "Renews <date>" for a subscriber who
-- hit Cancel in the billing portal. Stripe keeps such a subscription
-- 'active' until the period ends, so status alone can't tell the two
-- apart. Synced by routes/stripeWebhook.js on checkout, renewal,
-- customer.subscription.updated, and cleared on
-- customer.subscription.deleted.
--
-- Display-only: access is unchanged (the row keeps its full quota until
-- Stripe actually ends the subscription), so no RPC changes here.
--
-- The app fails safe without this column: lib/billingRepo.js retries any
-- write naming it without it, and readers treat an absent column as
-- false. Existing rows get the default (false); the next
-- customer.subscription.updated event for a row corrects it if needed.
--
-- Run this by hand against Supabase (SQL editor or CLI) -- no migration
-- runner exists, per repo convention (see CLAUDE.md).

alter table subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;
