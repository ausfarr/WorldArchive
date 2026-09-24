-- 039_timeline_lore_date_source_type.sql
--
-- Bug batch 1, Phase 4 (session_addendum_bug_batch_1.md): Timeline events
-- extracted from the world's lore prose by "Find dates in lore" on the
-- Timeline page (lib/loreDateExtraction.js) get their own source_type,
-- 'lore_date', so they're always distinguishable from dates the DM or a
-- structured entry field established. Same pattern as
-- migrations/036_timeline_entry_date_source_type.sql.
--
-- Nothing else changes schema-wise: an approximate date's precision
-- ("c. Year 512") rides inside the existing world_date jsonb as
-- { year, monthIndex, day, precision: 'year'|'month'|'day', approximate: true }.
--
-- Fail-safe until this runs: extraction (the AI call + review checklist)
-- still works; only "Add selected to Timeline" is refused with a clear
-- "run migration 039" message (routes/timeline.js), and nothing is
-- written.
--
-- Run this by hand against Supabase (SQL editor or CLI) -- no migration
-- runner exists, per repo convention (see CLAUDE.md).

alter table timeline_events drop constraint if exists timeline_events_source_type_check;
alter table timeline_events add constraint timeline_events_source_type_check
  check (source_type in ('chronicle', 'log_date', 'regenerate', 'entry_date', 'lore_date'));
