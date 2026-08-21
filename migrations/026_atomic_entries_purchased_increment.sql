-- 026_atomic_entries_purchased_increment.sql
--
-- lib/worldConfigRepo.js's addPurchasedEntries() was a plain JS
-- read-modify-write (select entries_purchased, add amount, update),
-- justified in its own comment as safe because it's "only ever called
-- once per Stripe webhook event (effectively serial)" -- true for a
-- single event, but says nothing about two DIFFERENT checkout.session.
-- completed events for the same world racing each other (e.g. a user
-- buying two $5/25-entry packs in quick succession, or Stripe redelivering
-- a webhook under load). Two concurrent calls could both read the same
-- starting entries_purchased before either wrote back, silently losing
-- one purchase's +25 entries -- a real "paid for it, didn't get it" bug,
-- not just a cap-enforcement edge case.
--
-- Same shape as 006/018's check_and_increment/refund_generation_count --
-- an atomic single-round-trip UPDATE closes the race the same way.

create or replace function increment_entries_purchased(
  p_world_id uuid,
  p_amount integer
) returns integer as $$
declare
  v_total integer;
begin
  update world_config
    set entries_purchased = coalesce(entries_purchased, 0) + p_amount
    where world_id = p_world_id
    returning entries_purchased into v_total;

  if v_total is null then
    raise exception 'world_config row for world_id % does not exist', p_world_id;
  end if;

  return v_total;
end;
$$ language plpgsql;
