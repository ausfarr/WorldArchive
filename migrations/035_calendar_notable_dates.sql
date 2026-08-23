-- 035_calendar_notable_dates.sql
--
-- Session Prep Companion, Phase 8 -- DM-added recurring notable dates
-- (holidays, a faction's founding day, an annual festival) for the Full
-- Calendar Page (session_prep_companion_scope.md Section 4a-ii). Its own
-- table rather than a JSON array on world_config.calendar_config,
-- deliberately: calendar_config is round-tripped as one whole object by
-- routes/wizardCalendar.js's save-calendar-config action (Settings page
-- form -> full overwrite, see validateCalendarConfigShape()) -- a field
-- the Settings form doesn't know about would get silently dropped the
-- next time a DM re-saves their calendar there. A separate table with
-- its own id per row also gives a clean add/delete surface without
-- needing to read-modify-write the whole calendar_config blob.
--
-- Recurring by design -- month_index/day only, no year, since these are
-- yearly-repeating dates (a harvest festival happens every year on the
-- same day), not one-off events. One-off in-world happenings already
-- have a home: timeline_events (migrations/033), sourced from actual
-- play (Chronicles, Log dates, opted-in Regenerates).
--
-- APPLY BY HAND: no migration runner in this project -- run this against
-- the Supabase project via the SQL Editor (or CLI) before this phase's
-- code goes live.

create table if not exists calendar_notable_dates (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  name text not null,
  month_index integer not null,
  day integer not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists calendar_notable_dates_world_id_idx on calendar_notable_dates(world_id);

-- No RLS policy, same reasoning as 008_cost_log.sql / 009_campaign_modules.sql
-- -- only ever touched via lib/supabaseClient.js's service-role client.
