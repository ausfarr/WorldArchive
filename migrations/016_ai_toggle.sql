-- 016_ai_toggle.sql
--
-- PENDING -- Austin still needs to run this by hand against Supabase
-- (SQL editor or CLI), same as 015_field_assist_points.sql before it.
--
-- Account-level "AI features" kill switch (Settings > AI Features). See
-- session_addendum_create_entry_collapse_and_ai_toggle.md for the full
-- decision record.
--
-- Scoped to the ACCOUNT (user_id), not the world -- this app is one
-- world per user today, but billing/subscriptions/credits are already
-- keyed by user_id rather than world_id specifically so they survive a
-- future multi-world feature (see 012_billing.sql's header comment), and
-- there's no reason for this toggle to behave differently. A user with
-- AI off should stay off across every world they ever create.
--
-- One row per user, created lazily on first read/write (see
-- lib/userSettingsRepo.js's getOrCreateUserSettings -- same race-safe
-- select -> insert -> re-select-on-23505 pattern as
-- worldConfigRepo.getOrCreateWorldConfig) rather than backfilled here,
-- since there's no per-user trigger point at signup to hook into and a
-- missing row is always safe to interpret as "AI on" (the column
-- default) until that user's first Settings visit or gated API call.
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ai_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
