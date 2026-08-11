-- 019_credit_balance_sum_rpc.sql
--
-- lib/billingRepo.js's getCreditBalance() previously fetched every
-- credit_ledger row for a user (every purchase AND every generation
-- spend row -- append-only, never pruned) and summed them in JS. Fine at
-- small row counts, but grows unbounded over a long-lived paid account,
-- and it's the kind of query PostgREST/Supabase can do server-side in
-- one aggregate round trip instead. Mirrors the SUM already computed
-- inline inside check_and_spend_subscription_generation (012/015) and
-- refund_subscription_generation (018) -- this just exposes the same
-- aggregate as its own callable RPC for the read-only balance lookup.
create or replace function get_credit_balance(
  p_user_id uuid
) returns integer as $$
  select coalesce(sum(amount), 0)::integer from credit_ledger where user_id = p_user_id;
$$ language sql stable;
