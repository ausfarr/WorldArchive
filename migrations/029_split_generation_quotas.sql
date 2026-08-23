-- 029_split_generation_quotas.sql
--
-- Splits image generation into its own quota, separate from the existing
-- points-based text-generation pool, because images cost ~10x more per
-- unit ($0.08/image vs $0.008/text generation) and a single shared pool
-- can't express "50 text generations + 10 images/month" the way the new
-- pricing model wants. See session_addendum_split_quotas_and_regenerate_gate.md
-- for the full decision record.
--
-- Also replaces the account-holder "free trial" (billingRepo.js's
-- TRIAL_CAP -- 50 points, spent once, never resets) with a genuinely
-- recurring MONTHLY free allowance for signed-up-but-not-subscribed
-- accounts: 10 text generations (50 points) + 1 image/month, forever.
-- This is the first time any non-Stripe-billed usage gets a recurring
-- reset in this schema -- see free_cycle_reset_at below.
--
-- Design notes:
--   - Image quota is a plain integer count, NOT points -- there's no
--     "partial image" action the way field-assist is a fractional text
--     generation, so it doesn't need the 5-points-per-generation
--     abstraction migrations/015_field_assist_points.sql introduced for
--     text.
--   - Image quota does NOT draw from credit_ledger -- that pool is
--     documented on pricing.html as "$2 / 5 generations" (text only);
--     adding image credits is a future product decision, not folded in
--     here. Running out of monthly image quota just means "wait for next
--     cycle or upgrade" for now.
--   - free_cycle_reset_at lives on world_config (not a new
--     subscriptions-style row) to keep free-tier bookkeeping in the same
--     place it already lives, rather than inserting a fake $0 "plan" into
--     the Stripe-oriented plans/subscriptions tables.
--
-- Run this by hand against Supabase (SQL editor or CLI) -- no migration
-- runner exists, per repo convention (see CLAUDE.md).

-- ---------- world_config: image counter + free-tier monthly cycle ----------

alter table world_config
  add column if not exists image_generation_count integer not null default 0;

alter table world_config
  add column if not exists free_cycle_reset_at timestamptz not null default now();

-- Atomic conditional reset -- only fires once the cycle has actually
-- elapsed, so calling this on every request costs nothing extra once a
-- world is mid-cycle (the WHERE clause just matches zero rows). Safe
-- under concurrent calls: worst case two near-simultaneous requests both
-- see "already reset" and proceed to the normal FOR UPDATE-locked
-- increment RPC below, same as any other double-checked reset.
create or replace function reset_free_cycle_if_elapsed(
  p_world_id uuid
) returns void as $$
begin
  update world_config
    set generation_count = 0,
        image_generation_count = 0,
        free_cycle_reset_at = now()
    where world_id = p_world_id
      and free_cycle_reset_at <= now() - interval '1 month';
end;
$$ language plpgsql;

-- Mirrors check_and_increment_generation_count (006/015) but targets
-- image_generation_count and has no points unit -- p_amount is always 1
-- in practice (one portrait or one battle-map bake), kept as a param only
-- for symmetry with the text-generation RPC's shape.
create or replace function check_and_increment_image_generation_count(
  p_world_id uuid,
  p_cap integer,
  p_amount integer default 1
) returns table(allowed boolean, new_count integer) as $$
declare
  v_count integer;
begin
  select image_generation_count into v_count
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
      set image_generation_count = image_generation_count + p_amount
      where world_id = p_world_id
      returning image_generation_count into v_count;
    return query select true, v_count;
  end if;
end;
$$ language plpgsql;

-- Mirrors refund_generation_count (018) but for the image counter.
create or replace function refund_image_generation_count(
  p_world_id uuid,
  p_amount integer
) returns integer as $$
declare
  v_count integer;
begin
  update world_config
    set image_generation_count = greatest(0, image_generation_count - p_amount)
    where world_id = p_world_id
    returning image_generation_count into v_count;

  if v_count is null then
    raise exception 'world_config row for world_id % does not exist', p_world_id;
  end if;

  return v_count;
end;
$$ language plpgsql;

-- ---------- subscriptions/plans: paid-tier image quota ----------

alter table plans
  add column if not exists monthly_quota_images integer not null default 0;

alter table subscriptions
  add column if not exists used_images_this_cycle integer not null default 0;

-- New subscription numbers: 50 text generations/month (250 points, same
-- 5-points-per-generation unit as monthly_quota always used) + 10
-- images/month. Was 125 points (25 generations) / no image quota.
-- IMPORTANT: this does NOT change what a subscriber is actually charged
-- via Stripe -- the $4.99/mo price requires a NEW Stripe Price object
-- (Stripe prices are immutable) and updating stripe_price_id below by
-- hand; that's a manual dashboard step, not part of this migration.
update plans
  set monthly_quota = 250,
      monthly_quota_images = 10
  where id = 'chronicled_monthly';

-- Mirrors check_and_spend_subscription_generation (012/015/028) but for
-- images -- no credit_ledger fallback (see design notes above), and
-- table-aliased/qualified from the start to avoid the exact "column
-- reference is ambiguous" bug migrations/028 had to fix after the fact
-- for the text-generation version.
create or replace function check_and_spend_subscription_image_generation(
  p_user_id uuid,
  p_amount integer default 1
) returns table(allowed boolean, used_images_this_cycle integer) as $$
declare
  v_status text;
  v_quota integer;
  v_used integer;
begin
  select s.status, p.monthly_quota_images, s.used_images_this_cycle
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
    update subscriptions s set used_images_this_cycle = s.used_images_this_cycle + p_amount, updated_at = now()
      where s.user_id = p_user_id;
    return query select true, v_used + p_amount;
    return;
  end if;

  return query select false, v_used;
end;
$$ language plpgsql;

-- Mirrors refund_subscription_generation's 'quota' branch (018) -- no
-- 'source'/credit branch needed since image spend never falls back to
-- credits.
create or replace function refund_subscription_image_generation(
  p_user_id uuid,
  p_amount integer
) returns void as $$
begin
  update subscriptions
    set used_images_this_cycle = greatest(0, used_images_this_cycle - p_amount), updated_at = now()
    where user_id = p_user_id;
end;
$$ language plpgsql;

-- ---------- one-time cleanup: fresh start under the new free-monthly model ----------

-- Every non-subscribed world's generation_count today reflects the OLD
-- one-time TRIAL_CAP (or legacy flat cap) -- some already sitting at or
-- near that cap. Without this, they'd inherit that lifetime count as
-- "this cycle's" starting usage under the new recurring model, meaning
-- some accounts would launch already capped out. Reset every
-- non-subscribed world to a clean first cycle instead.
update world_config wc
  set generation_count = 0,
      image_generation_count = 0,
      free_cycle_reset_at = now()
  from worlds w
  where wc.world_id = w.id
    and not exists (select 1 from subscriptions s where s.user_id = w.user_id);
