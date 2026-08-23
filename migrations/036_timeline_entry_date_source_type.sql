-- 036_timeline_entry_date_source_type.sql
--
-- Widens timeline_events.source_type's CHECK constraint to add
-- 'entry_date' -- a fourth deterministic Timeline trigger (see
-- lib/timelineEvents.js's createEntryDateEvents): any of Factions/NPCs/
-- PCs/Items' structured date fields (foundingDate/birthDate/
-- appointedDate/deathDate/createdDate/discoveredDate -- see
-- lib/calendar.js's DATE_FIELDS_BY_CATEGORY) getting newly set or
-- changed on ANY write path (new generation, regenerate, or a manual
-- dossier edit) now auto-creates a Timeline event for that specific
-- date, with no DM opt-in required -- same "auto, don't ask" precedent
-- Phase 7 already established for status flips (Trigger 2's extension).
--
-- Logs' own resolvedDate keeps its existing 'log_date' trigger
-- (Trigger 3) unchanged -- that one has its own richer cross-entry
-- "canonical date wins" resolution logic that doesn't generalize to a
-- plain per-field change check, so it's kept separate rather than
-- folded into this new trigger.
--
-- Postgres has no ALTER CONSTRAINT for a CHECK's expression -- drop and
-- re-add by the constraint's auto-generated name (the same "table_col_check"
-- pattern created by an inline `column type check (...)` at table-creation
-- time, confirmed against migrations/033_timeline_events.sql's own
-- `create table ... source_type text not null check (...)` -- no
-- explicit constraint name was given there, so Postgres generated
-- `timeline_events_source_type_check`).
--
-- APPLY BY HAND: no migration runner in this project -- run this against
-- the Supabase project via the SQL Editor (or CLI) before this phase's
-- code goes live.

alter table timeline_events drop constraint if exists timeline_events_source_type_check;
alter table timeline_events add constraint timeline_events_source_type_check
  check (source_type in ('chronicle', 'log_date', 'regenerate', 'entry_date'));
