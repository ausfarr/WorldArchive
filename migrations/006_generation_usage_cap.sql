-- 006_generation_usage_cap.sql
--
-- Beta-period stopgap for not having real metering/billing yet (Phase 5,
-- still open per multi_tenant_pivot_scope.md). Tracks a lifetime cap on
-- the 7 non-wizard content-generation routes (/generate-npc, -enemy,
-- -item, -survivor, -log, -class, -faction) per world. Wizard "generate
-- for me" calls during onboarding are deliberately NOT tracked here --
-- see middleware/enforceGenerationCap.js for the reasoning.

alter table world_config
  add column if not exists generation_count integer not null default 0;

-- Atomic check-and-increment in one round trip, so two near-simultaneous
-- requests from the same world can't both slip through a read-then-write
-- race. Row locked with FOR UPDATE for the duration of the check.
create or replace function check_and_increment_generation_count(
  p_world_id uuid,
  p_cap integer
) returns table(allowed boolean, new_count integer) as $$
declare
  v_count integer;
begin
  select generation_count into v_count
  from world_config
  where world_id = p_world_id
  for update;

  -- Caller (worldConfigRepo.checkAndIncrementGenerationCount) is
  -- responsible for ensuring the world_config row exists before calling
  -- this function, same as every other repo function in this codebase --
  -- if v_count is still null here, the row genuinely doesn't exist and
  -- something upstream skipped get-or-create.
  if v_count is null then
    raise exception 'world_config row for world_id % does not exist', p_world_id;
  end if;

  if v_count >= p_cap then
    return query select false, v_count;
  else
    update world_config
      set generation_count = generation_count + 1
      where world_id = p_world_id
      returning generation_count into v_count;
    return query select true, v_count;
  end if;
end;
$$ language plpgsql;
