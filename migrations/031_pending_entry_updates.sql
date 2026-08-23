-- 031_pending_entry_updates.sql
--
-- Session Prep Companion, Phase 3 -- stub table for Section 6a's
-- suggested-update queue: when a Log resolves an in-world date for
-- something that has no canonical date field set yet (its "first
-- mention"), that resolved date doesn't get silently written onto the
-- referenced entry -- it surfaces here as a reviewable candidate instead.
-- Deliberately minimal for now -- Phase 7 formalizes this into the real
-- DM-facing suggestion queue (regenerate-prefill, status-flip triggers,
-- dismiss/apply UI), per the scope doc's own note that this stub is
-- "fine to create now and fill in properly in Phase 7."
--
-- APPLY BY HAND: no migration runner in this project -- run this against
-- the Supabase project via the SQL Editor (or CLI) before this phase's
-- code goes live.

create table if not exists pending_entry_updates (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  entry_id text not null,
  category text not null,
  suggestion_type text not null, -- 'regenerate' | 'status_flip' (Phase 7 adds status_flip's real trigger)
  delta_text text not null,
  source text, -- free-text pointer to what generated this, e.g. "log:some-log-id"
  status text not null default 'pending', -- 'pending' | 'applied' | 'dismissed'
  created_at timestamptz not null default now()
);

create index if not exists pending_entry_updates_world_id_idx on pending_entry_updates(world_id);

-- No RLS policy, same reasoning as 008_cost_log.sql / 009_campaign_modules.sql
-- -- only ever touched via lib/supabaseClient.js's service-role client.
