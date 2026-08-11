-- 018_generation_refund.sql
--
-- Points are deducted BEFORE the Claude/Gemini call runs (deliberately,
-- to gate spend -- see middleware/enforceGenerationCap.js), but until
-- now nothing refunded that spend when the downstream call actually
-- failed (Claude API error, JSON parse failure surviving the one built-in
-- retry, image generation error, etc). A failed generation permanently
-- burned a point/cap/credit for zero output. These RPCs mirror the
-- check-and-increment/spend RPCs from 006/012/015, clamped so a refund
-- can never push a counter negative or a credit balance below what was
-- actually spent.

create or replace function refund_generation_count(
  p_world_id uuid,
  p_amount integer
) returns integer as $$
declare
  v_count integer;
begin
  update world_config
    set generation_count = greatest(0, generation_count - p_amount)
    where world_id = p_world_id
    returning generation_count into v_count;

  if v_count is null then
    raise exception 'world_config row for world_id % does not exist', p_world_id;
  end if;

  return v_count;
end;
$$ language plpgsql;

-- p_source is whichever the original spend RPC (check_and_spend_
-- subscription_generation) reported: 'quota' refunds by decrementing
-- used_this_cycle; 'credit' refunds by inserting a positive credit_ledger
-- row (append-only ledger, never mutate a past spend row) rather than
-- touching used_this_cycle.
create or replace function refund_subscription_generation(
  p_user_id uuid,
  p_amount integer,
  p_source text
) returns void as $$
begin
  if p_source = 'quota' then
    update subscriptions
      set used_this_cycle = greatest(0, used_this_cycle - p_amount), updated_at = now()
      where user_id = p_user_id;
  elsif p_source = 'credit' then
    insert into credit_ledger (user_id, amount, reason) values (p_user_id, p_amount, 'generation_refund');
  end if;
end;
$$ language plpgsql;
