-- 014_map_lock.sql
--
-- v0.9 Manual Mode polish round 2. Persisted lock toggle for the Map
-- page -- when true, every location pin is rendered non-draggable, so a
-- person who's finished placing everything can stop worrying about
-- accidentally bumping a pin out of place. Deliberately a single
-- world-wide flag (not per-location) -- Austin's ask was for one lock
-- control, not per-pin locks. Boolean rather than a timestamp/actor
-- column since there's no need to know who locked it or when, just
-- whether it's currently locked.

alter table world_config
  add column if not exists locations_map_locked boolean not null default false;
