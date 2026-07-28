-- 007_waitlist.sql
--
-- Public marketing-site waitlist signups (chronicled.world landing page
-- and the itch.io listing both point here). Deliberately NOT tied to
-- Supabase Auth or the worlds/world_config tables -- these are
-- pre-account leads, not users yet. See routes/waitlist.js for the
-- public, unauthenticated endpoint that writes here.

create table if not exists waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text,
  created_at timestamptz not null default now()
);

-- One signup per email (case-insensitive) -- resubmitting the same
-- email is treated as a no-op success by routes/waitlist.js rather than
-- surfaced as an error, so this constraint never bubbles up to a user.
create unique index if not exists waitlist_signups_email_key
  on waitlist_signups (lower(email));
