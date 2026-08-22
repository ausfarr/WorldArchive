-- 033_pending_entry_updates_payload.sql
--
-- Session Prep Companion, Phase 7 -- formalizes the pending_entry_updates
-- stub table from Phase 3 (migrations/030) into the real suggestion
-- queue. Adds one column: a `payload` jsonb blob for suggestion-type-
-- specific structured data that doesn't fit `delta_text` (currently only
-- used by suggestion_type='status_flip' rows, which need a real
-- targetStatus value to apply -- e.g. { "targetStatus": "dead" } -- not
-- just a free-text description). 'regenerate' rows have no payload
-- (delta_text alone is the revision instruction).
--
-- APPLY BY HAND: no migration runner in this project -- run this against
-- the Supabase project via the SQL Editor (or CLI) before this phase's
-- code goes live.

alter table pending_entry_updates add column if not exists payload jsonb;
