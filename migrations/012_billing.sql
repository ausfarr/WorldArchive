-- 012_billing.sql
--
-- Phase 5: real subscription billing via Stripe, replacing the beta's
-- flat 25-generation lifetime cap. See session_addendum_phase5_billing_scope.md
-- for the full decision record.
--
-- Design summary:
--   - Trial users (no subscriptions row) keep using the EXISTING
--     world_config.generation_count + check_and_increment_generation_count
--     machinery from 006_generation_usage_cap.sql, just re-pointed at a
--     lower cap (10, not 25) -- see middleware/enforceGenerationCap.js.
--   - Subscribed users get a NEW monthly-quota-plus-rollover-credits
--     system below, keyed by user_id (not world_id) so billing survives
--     a future multi-world feature or a "Delete World" action -- neither
--     should touch a paid subscription.
--   - plans is deliberately a table, not a hardcoded constant, so a
--     future second/third tier is a new row, not a schema migration.

create table if not exists plans (
  id text primary key,
  name text not null,
  model text not null default 'claude-haiku-4-5-20251001',
  monthly_quota integer not null,
  stripe_price_id text not null,
  is_active boolean not null default true
);

-- Single real plan at launch. IMPORTANT: replace the stripe_price_id
-- placeholder below with the real Price ID from the Stripe Dashboard
-- before this row is used for real checkouts -- see
-- routes/billing.js's createSubscriptionCheckout, which looks this row
-- up by id = 'chronicled_monthly'.
insert into plans (id, name, model, monthly_quota, stripe_price_id)
values ('chronicled_monthly', 'Chronicled Subscription', 'claude-haiku-4-5-20251001', 25, 'REPLACE_WITH_STRIPE_PRICE_ID')
on conflict (id) do nothing;

-- One row per subscribed user. Trial users never get a row here -- their
-- absence from this table IS "on trial" as far as the app is concerned
-- (see enforceGenerationCap.js). status transitions: active -> past_due
-- (failed payment, Stripe auto-retries) -> active (retry succeeded) or
-- canceled (subscription actually ended).
create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references plans(id),
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  status text not null default 'active',
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  used_this_cycle integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_stripe_customer on subscriptions(stripe_customer_id);
create index if not exists idx_subscriptions_stripe_subscription on subscriptions(stripe_subscription_id);

-- Append-only ledger, not a balance column -- balance is always
-- sum(amount) for a user. Positive rows = purchase, negative = spend.
-- No expires_at column: credits roll over indefinitely by design (see
-- scope addendum) -- there is deliberately nothing here that would let a
-- cron job or reset touch these.
create table if not exists credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_ledger_user on credit_ledger(user_id);

-- Atomic quota-then-credit check-and-spend for one generation, mirroring
-- the FOR UPDATE row-lock pattern in 006_generation_usage_cap.sql's
-- check_and_increment_generation_count. Locks the subscriptions row for
-- the duration of the check so two near-simultaneous requests from the
-- same user can't both slip through, and serializes that user's credit
-- spends against each other (a concurrent credit *purchase* landing
-- mid-check is the one unhandled race -- acceptable for this scale, not
-- bulletproof under high concurrency).
--
-- Effective monthly quota is 0 whenever status != 'active' (past_due or
-- canceled) -- those users fall straight through to the credit balance,
-- which stays spendable even if the subscription itself has lapsed,
-- since they paid for those credits directly. See scope addendum's
-- open-questions section for this call.
create or replace function check_and_spend_subscription_generation(
  p_user_id uuid
) returns table(allowed boolean, used_this_cycle integer, credit_balance integer, source text) as $$
declare
  v_status text;
  v_quota integer;
  v_used integer;
  v_credit_balance integer;
begin
  select s.status, p.monthly_quota, s.used_this_cycle
    into v_status, v_quota, v_used
  from subscriptions s
  join plans p on p.id = s.plan_id
  where s.user_id = p_user_id
  for update of s;

  if v_status is null then
    raise exception 'no subscription row for user_id %', p_user_id;
  end if;

  if v_status != 'active' then
    v_quota := 0;
  end if;

  if v_used < v_quota then
    update subscriptions set used_this_cycle = used_this_cycle + 1, updated_at = now()
      where user_id = p_user_id;
    select coalesce(sum(amount), 0) into v_credit_balance from credit_ledger where user_id = p_user_id;
    return query select true, v_used + 1, v_credit_balance, 'quota';
    return;
  end if;

  select coalesce(sum(amount), 0) into v_credit_balance from credit_ledger where user_id = p_user_id;
  if v_credit_balance > 0 then
    insert into credit_ledger (user_id, amount, reason) values (p_user_id, -1, 'generation_spend');
    return query select true, v_used, v_credit_balance - 1, 'credit';
    return;
  end if;

  return query select false, v_used, v_credit_balance, 'none';
end;
$$ language plpgsql;
