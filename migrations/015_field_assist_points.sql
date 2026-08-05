-- 015_field_assist_points.sql
--
-- v0.9 Manual Mode, Piece 2 (field-level "Help me" AI assist). See
-- session_addendum_field_assist_shipped.md for the full decision record.
--
-- Rather than a separate quota users have to track alongside their AI
-- generation count, field assists draw from the SAME pool, just at a
-- fraction of the cost -- 1 full generation = 5 points, 1 field assist
-- = 1 point (so an assist costs 0.2 of a generation, matching Austin's
-- ask). This is implemented as an integer "points" unit internally
-- rather than a true fractional/numeric spend, specifically to avoid
-- touching column types or introducing floating-point precision risk
-- in the two tables that already handle real billing math
-- (world_config.generation_count, subscriptions.used_this_cycle,
-- credit_ledger.amount). Nothing user-facing ever shows the word
-- "points" -- Settings still displays "X generations remaining",
-- computed as floor(points_remaining / 5).
--
-- Every existing counter/cap that used to mean "generations" now means
-- "points" going forward. This migration backfills existing values by
-- multiplying by 5 so no existing beta tester's usage looks worse after
-- deploy, and existing purchased credits keep their real spending power.

-- ---------- Legacy beta lifetime cap (world_config.generation_count) ----------
-- GENERATION_CAP moves from 25 -> 125 in lib/worldConfigRepo.js (code
-- change, not a schema change -- the column itself doesn't encode the
-- cap). This just backfills the stored counts to match the new unit.
update world_config
  set generation_count = generation_count * 5
  where generation_count > 0;

-- ---------- Subscriber monthly quota (subscriptions.used_this_cycle, plans.monthly_quota) ----------
update subscriptions
  set used_this_cycle = used_this_cycle * 5
  where used_this_cycle > 0;

update plans
  set monthly_quota = monthly_quota * 5;

-- ---------- Purchased credits (credit_ledger.amount) ----------
-- Every existing row (both positive purchase rows and negative spend
-- rows) represented whole generations; multiply by 5 so a user's real
-- remaining spending power is unchanged after the unit switch.
update credit_ledger
  set amount = amount * 5;

-- ---------- RPC updates: both gain a variable spend amount ----------
-- Default of 1 is deliberately NOT what a full generation call passes
-- (that's 5, set explicitly by the two call sites in
-- middleware/enforceGenerationCap.js) -- the default only matters for
-- any caller that doesn't pass p_amount explicitly, and there shouldn't
-- be any after this migration ships.

create or replace function check_and_increment_generation_count(
  p_world_id uuid,
  p_cap integer,
  p_amount integer default 1
) returns table(allowed boolean, new_count integer) as $$
declare
  v_count integer;
begin
  select generation_count into v_count
  from world_config
  where world_id = p_world_id
  for update;

  if v_count is null then
    raise exception 'world_config row for world_id % does not exist', p_world_id;
  end if;

  if v_count + p_amount > p_cap then
    return query select false, v_count;
  else
    update world_config
      set generation_count = generation_count + p_amount
      where world_id = p_world_id
      returning generation_count into v_count;
    return query select true, v_count;
  end if;
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
    update subscriptions set used_this_cycle = used_this_cycle + p_amount, updated_at = now()
      where user_id = p_user_id;
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
