-- 010_campaign_arcs.sql
--
-- Campaigns (story arcs) -- see session_addendum_campaign_arcs_shipped.md
-- for the design conversation. A Campaign is a higher-level container
-- that references multiple existing Quests (campaign_modules rows, see
-- routes/campaignModule.js's naming note) in order -- it does NOT
-- duplicate or own Quest content, same "reference, don't own" principle
-- already used for how Quests reference NPCs/Locations/Items/Logs/
-- Enemies. Ordered list only for v1 (no staging/acts) -- Austin's
-- explicit call this session.
--
-- quest_ids is a plain ordered array of campaign_modules.id values, not
-- a foreign-key-backed join table -- same reasoning as campaign_modules'
-- own entries_json: application-level integrity (a quest that no longer
-- exists is handled gracefully at read time), not a DB constraint,
-- consistent with how the rest of this cross-referencing system already
-- tolerates drift (see 009_campaign_modules.sql's comment on the same
-- tradeoff).

create table if not exists campaign_arcs (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  name text not null,
  summary text,
  quest_ids jsonb not null default '[]'::jsonb,
  created_via text not null default 'manual', -- 'manual' | 'ai'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_arcs_world_id_idx on campaign_arcs(world_id);

-- No RLS policy, same reasoning as 008_cost_log.sql / 009_campaign_modules.sql.
