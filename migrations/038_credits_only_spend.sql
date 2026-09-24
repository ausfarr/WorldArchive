-- 038_credits_only_spend.sql
--
-- Bug batch 1, Phase 2 follow-up (session_addendum_bug_batch_1.md): lets
-- a FREE account (no subscriptions row) spend purchased credits once its
-- monthly free allowance runs out. Before this, the only credit-spending
-- code was check_and_spend_subscription_generation (012/015/028), which
-- raises without a subscriptions row -- so credits bought by a free
-- account were shown in Settings but could never be spent.
--
-- Serialization: the subscription RPC locks the user's subscriptions row
-- FOR UPDATE; a free account has no row to lock, so this takes a
-- transaction-scoped advisory lock keyed on the user id instead. Without
-- it, two concurrent requests could both read the same balance and both
-- spend the last credit (the ledger is append-only, so nothing else
-- would stop the balance going negative).
--
-- Refunds need no new function: refund_subscription_generation's
-- 'credit' branch (018) only inserts a positive credit_ledger row and
-- never touches subscriptions, so it already works for free accounts.
--
-- The app fails safe without this function: middleware/
-- enforceGenerationCap.js treats a missing function as "no credits
-- spendable" (the pre-fix behavior) and logs a warning.
--
-- Run this by hand against Supabase (SQL editor or CLI) -- no migration
-- runner exists, per repo convention (see CLAUDE.md).

create or replace function check_and_spend_credits(
  p_user_id uuid,
  p_amount integer
) returns table(allowed boolean, credit_balance integer) as $$
declare
  v_balance integer;
begin
  perform pg_advisory_xact_lock(hashtext('credit_ledger:' || p_user_id::text));

  select coalesce(sum(cl.amount), 0)::integer into v_balance
    from credit_ledger cl
    where cl.user_id = p_user_id;

  if v_balance >= p_amount then
    insert into credit_ledger (user_id, amount, reason) values (p_user_id, -p_amount, 'generation_spend');
    return query select true, v_balance - p_amount;
    return;
  end if;

  return query select false, v_balance;
end;
$$ language plpgsql;
