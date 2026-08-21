-- 028_fix_subscription_spend_column_ambiguity.sql
--
-- Production bug (v1.0.0 launch day): every /generate-X request from a
-- subscribed account 500'd with "Internal server error." -- traced via
-- the live Supabase logs to check_and_spend_subscription_generation
-- throwing "column reference \"used_this_cycle\" is ambiguous"
-- (Postgres 42702) whenever it reached the still-has-quota branch.
--
-- Root cause: both 012_billing.sql's original 1-arg version and
-- 015_field_assist_points.sql's 2-arg (p_amount) version declare
-- `returns table(allowed boolean, used_this_cycle integer, ...)`.
-- PL/pgSQL implicitly declares each RETURNS TABLE column as a variable
-- in scope for the whole function body -- so the unqualified
-- `used_this_cycle` inside `update subscriptions set used_this_cycle =
-- used_this_cycle + p_amount ...` is ambiguous between that variable and
-- the `subscriptions.used_this_cycle` column. This never fired before
-- today because it only triggers when BILLING_ENABLED=true AND a real
-- subscriber (not a trial/legacy-cap user, which take a different code
-- path) still has quota left -- the first such account only spent its
-- first quota point today.
--
-- refund_subscription_generation (018_generation_refund.sql) is NOT
-- affected -- it `returns void`, so it has no colliding OUT-parameter
-- variable and its own `used_this_cycle` reference is already
-- unambiguous.
--
-- Fix: alias the table in the UPDATE and qualify the reference, closing
-- the same ambiguity check_and_increment_generation_count's OWN
-- `new_count` OUT column never hit (that function's UPDATE never
-- references `new_count` by name). Behavior is otherwise unchanged --
-- verified in production via a BEGIN/ROLLBACK call against the real
-- subscriber row before this file was written.

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
    update subscriptions s set used_this_cycle = s.used_this_cycle + 1, updated_at = now()
      where s.user_id = p_user_id;
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

create or replace function check_and_spend_subscription_generation(
  p_user_id uuid,
  p_amount integer default 1
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

  if v_used + p_amount <= v_quota then
    update subscriptions s set used_this_cycle = s.used_this_cycle + p_amount, updated_at = now()
      where s.user_id = p_user_id;
    select coalesce(sum(amount), 0) into v_credit_balance from credit_ledger where user_id = p_user_id;
    return query select true, v_used + p_amount, v_credit_balance, 'quota';
    return;
  end if;

  select coalesce(sum(amount), 0) into v_credit_balance from credit_ledger where user_id = p_user_id;
  if v_credit_balance >= p_amount then
    insert into credit_ledger (user_id, amount, reason) values (p_user_id, -p_amount, 'generation_spend');
    return query select true, v_used, v_credit_balance - p_amount, 'credit';
    return;
  end if;

  return query select false, v_used, v_credit_balance, 'none';
end;
$$ language plpgsql;
