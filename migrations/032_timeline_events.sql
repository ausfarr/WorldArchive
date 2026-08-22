-- 032_timeline_events.sql
--
-- Session Prep Companion, Phase 6 -- world-wide Timeline of Events (see
-- session_prep_companion_scope.md Section 5 + 5a). Deterministic
-- aggregation table, same "built by scanning confirmed content at
-- confirm-time, never a separate generation call" pattern as
-- lib/factionRoundup.js. Single running list per world (NOT per-Campaign
-- -- a recurring NPC's arc across multiple Quests/Campaigns is meant to
-- read as one continuous thread).
--
-- Three trigger sources write here (see lib/timelineEvents.js):
--   'chronicle'  -- a confirmed Session Chronicle (Phase 5), dated to its
--                   own in-world date. session_number always set.
--   'log_date'   -- a confirmed Log (not a Chronicle) whose resolvedDate
--                   was set (Phase 3). session_number always null.
--   'regenerate' -- a DM-opted-in Regenerate/status-flip confirm (Section
--                   5a's toggle). session_number always null.
--
-- linked_entry_ids/linked_faction_ids are plain JSON arrays, not FK-backed
-- join tables -- same "application-level integrity, not a DB constraint"
-- tradeoff already accepted for campaign_modules.entries_json/campaign_
-- arcs.quest_ids (see migrations/009's comment): entries live across
-- multiple categories in one shared table, so a real FK here isn't
-- practical, and a dangling reference is tolerated the same way
-- elsewhere in this cross-referencing system.
--
-- APPLY BY HAND: no migration runner in this project -- run this against
-- the Supabase project via the SQL Editor (or CLI) before this phase's
-- code goes live.

create table if not exists timeline_events (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  source_type text not null check (source_type in ('chronicle', 'log_date', 'regenerate')),
  source_id text not null,
  source_category text not null,
  session_number integer,
  world_date jsonb, -- { year, monthIndex, day } -- see lib/calendar.js's WorldDate shape
  summary text not null,
  linked_entry_ids jsonb not null default '[]'::jsonb, -- [{ category, entryId }, ...]
  linked_faction_ids jsonb not null default '[]'::jsonb, -- [factionKey, ...]
  created_at timestamptz not null default now()
);

create index if not exists timeline_events_world_id_idx on timeline_events(world_id);

-- No RLS policy, same reasoning as 008_cost_log.sql / 009_campaign_modules.sql
-- -- only ever touched via lib/supabaseClient.js's service-role client.
