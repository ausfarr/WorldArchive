-- 009_campaign_modules.sql
--
-- Campaign Structure -- see session_addendum_campaign_structure_scope.md
-- for the full design conversation. A Campaign Module ("quest") is a
-- structure that REFERENCES existing NPCs/Locations/Items/Logs -- it is
-- deliberately NOT a 9th content category (that would break the locked
-- "fixed 8 categories" decision, multi_tenant_pivot_scope.md Section 2).
-- One new small table instead, same reasoning as Dungeon Maps choosing
-- raw_json.dungeonMap over a new table for a *smaller* addition -- this
-- one is big enough (its own name/summary/status, referencing MULTIPLE
-- entries across MULTIPLE categories) that a JSON column on any single
-- entry would be the wrong shape.
--
-- entries_json holds the ordered reference list:
--   [{ category: "npcs"|"locations"|"items"|"logs", entryId, role, note }]
-- role/note are DM-facing free text ("quest-giver", "withholds the map
-- until paid"). No foreign keys into the entries table on purpose --
-- entries live across 8 different categories in one shared table
-- (lib/entriesRepo.js), and a composite FK there would need
-- (category, id) as a compound key Postgres can't easily enforce
-- against a table that also serves 7 unrelated categories. Referential
-- integrity (does entryId actually still exist) is checked in
-- application code at read time instead, same tolerance-of-drift
-- already accepted elsewhere (e.g. a deleted NPC leaving a dangling
-- relationship reference on another entry's raw_json).

create table if not exists campaign_modules (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  name text not null,
  summary text,
  status text not null default 'planned', -- 'planned' | 'prepped' | 'run'
  entries_json jsonb not null default '[]'::jsonb,
  created_via text not null default 'manual', -- 'manual' | 'ai'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_modules_world_id_idx on campaign_modules(world_id);

-- No RLS policy added, same reasoning as 008_cost_log.sql -- this table
-- is only ever touched via lib/supabaseClient.js's service-role client
-- from the backend (see routes/campaignModule.js), never with the
-- anon/publishable key, so leaving RLS off keeps it reachable only
-- through that one gated code path rather than adding a policy that
-- could itself become a future exposure.
