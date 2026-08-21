-- 027_demo_usage.sql
--
-- Backend for the unauthenticated demo generator (routes/demo.js) --
-- see session_addendum_demo_mode_scope.md. Tracks per-visitor text/
-- portrait generation counts, keyed by a SHA-256 hash of their IP
-- (never the raw address, see lib/demoUsageRepo.js) plus a UTC calendar
-- day, so the cap resets daily with no cleanup job needed. No worldId/
-- userId column -- this is deliberately outside the tenant model
-- entirely (see middleware/resolveTenant.js's header for why the real
-- app requires one; the demo routes are mounted in server.js BEFORE
-- that middleware specifically so they never need it).
--
-- Two separate counters/caps, since portraits cost ~4x a text
-- generation and the locked decision caps them independently (2 text /
-- rolling day, 1 portrait / rolling day) -- see the scope doc.

create table if not exists demo_usage (
  ip_hash text not null,
  day date not null,
  text_count int not null default 0,
  portrait_count int not null default 0,
  primary key (ip_hash, day)
);

-- Atomic check-and-increment, same shape as
-- migrations/006_generation_usage_cap.sql's
-- check_and_increment_generation_count -- row-locked (FOR UPDATE) for
-- the duration of the check so two near-simultaneous requests from the
-- same visitor can't both slip through. Unlike the real generation cap,
-- no caller pre-creates the row (there's no per-world onboarding step
-- to hook that into for an anonymous visitor) -- the INSERT ... ON
-- CONFLICT DO NOTHING below does that inline, atomically, on first use
-- each day.
create or replace function check_and_increment_demo_text_usage(
  p_ip_hash text,
  p_day date,
  p_cap integer
) returns table(allowed boolean, new_count integer) as $$
declare
  v_count integer;
begin
  insert into demo_usage (ip_hash, day)
    values (p_ip_hash, p_day)
  on conflict (ip_hash, day) do nothing;

  select text_count into v_count
  from demo_usage
  where ip_hash = p_ip_hash and day = p_day
  for update;

  if v_count >= p_cap then
    return query select false, v_count;
  else
    update demo_usage
      set text_count = text_count + 1
      where ip_hash = p_ip_hash and day = p_day
      returning text_count into v_count;
    return query select true, v_count;
  end if;
end;
$$ language plpgsql;

create or replace function check_and_increment_demo_portrait_usage(
  p_ip_hash text,
  p_day date,
  p_cap integer
) returns table(allowed boolean, new_count integer) as $$
declare
  v_count integer;
begin
  insert into demo_usage (ip_hash, day)
    values (p_ip_hash, p_day)
  on conflict (ip_hash, day) do nothing;

  select portrait_count into v_count
  from demo_usage
  where ip_hash = p_ip_hash and day = p_day
  for update;

  if v_count >= p_cap then
    return query select false, v_count;
  else
    update demo_usage
      set portrait_count = portrait_count + 1
      where ip_hash = p_ip_hash and day = p_day
      returning portrait_count into v_count;
    return query select true, v_count;
  end if;
end;
$$ language plpgsql;

-- Refunds, mirroring migrations/018_generation_refund.sql's
-- refund_generation_count exactly (clamped at 0) -- routes/demo.js calls
-- these when the cap check passed but the downstream Claude/Gemini call
-- then failed, so a server error doesn't permanently burn one of a
-- visitor's 2 (or 1) daily demo attempts for zero output.
create or replace function refund_demo_text_usage(
  p_ip_hash text,
  p_day date
) returns void as $$
begin
  update demo_usage
    set text_count = greatest(0, text_count - 1)
    where ip_hash = p_ip_hash and day = p_day;
end;
$$ language plpgsql;

create or replace function refund_demo_portrait_usage(
  p_ip_hash text,
  p_day date
) returns void as $$
begin
  update demo_usage
    set portrait_count = greatest(0, portrait_count - 1)
    where ip_hash = p_ip_hash and day = p_day;
end;
$$ language plpgsql;
