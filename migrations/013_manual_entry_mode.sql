-- 013_manual_entry_mode.sql
--
-- v0.9 Manual Mode, Piece 1 (Full Manual Entry). See
-- session_addendum_manual_entry_mode_shipped.md for the full decision
-- record. Adds the "entries per world" cap -- independent of the
-- existing generation cap/quota (migrations/006, 012) -- that applies to
-- every entry in a world (AI-generated or manually created alike)
-- unless the account has an active subscription.
--
-- Deliberately NOT a redundant running counter like generation_count:
-- the entry cap is "how many entries currently exist in this world,"
-- which must go DOWN when an entry is deleted (unlike a lifetime spend
-- counter). The live count is always a plain `select count(*) from
-- entries where world_id = ...` (see entriesRepo.countEntries) --
-- entries_purchased below is the only thing that needs its own column,
-- since purchases only ever add and never need to reflect deletions.

alter table world_config
  add column if not exists entries_purchased integer not null default 0;
