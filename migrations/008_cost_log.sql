-- 008_cost_log.sql
--
-- Persisted, per-call cost logging. Replaces lib/costTracker.js's
-- process-lifetime in-memory total (which resets on every Render
-- redeploy and can't be broken down per user) with a durable table, so
-- Austin can answer "what does this actually cost to run per month" and
-- "which users are expensive" with a real query instead of watching
-- console logs during a manual test pass.
--
-- Not a metering/billing system (Phase 5, still open per
-- multi_tenant_pivot_scope.md) -- this is cost visibility only, same
-- estimate-not-metered-fact caveat that already applies to Gemini image
-- costs in lib/costTracker.js.

create table if not exists cost_log (
  id uuid primary key default gen_random_uuid(),
  world_id uuid references worlds(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  category text not null default 'unknown',   -- 'npcs', 'bestiary', 'items', 'wizard', etc.
  provider text not null,                     -- 'claude' | 'gemini'
  input_tokens integer,                       -- null for gemini (image calls aren't token-metered)
  output_tokens integer,                      -- null for gemini
  estimated_cost_usd numeric(10,5) not null,
  created_at timestamptz not null default now()
);

create index if not exists cost_log_user_id_idx on cost_log(user_id);
create index if not exists cost_log_world_id_idx on cost_log(world_id);
create index if not exists cost_log_created_at_idx on cost_log(created_at);

-- No RLS policy is added here on purpose: this table is never queried
-- with the anon/publishable key, only from the backend via the
-- service-role-equivalent client in lib/supabaseClient.js (see
-- routes/adminCost.js). Row Level Security defaults to fully locked for
-- any role that isn't the table owner, so leaving RLS off (rather than
-- adding an "admin-only" policy that could itself be a future exposure,
-- per the world_config_by_user lesson) keeps this reachable only through
-- the one code path that's supposed to read it.
