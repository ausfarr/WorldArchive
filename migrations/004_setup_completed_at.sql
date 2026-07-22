-- Migration 004: Setup completion marker on world_config
--
-- Adds setup_completed_at, set by Step 8 (Review & Confirm) when the user
-- finishes the wizard. Not currently read/branched on by anything (no
-- gating logic exists yet that checks "has this user finished setup") --
-- it's a real, useful signal for future use (e.g. redirecting incomplete
-- users back into the wizard on login), added now so it exists once
-- that logic is built, rather than requiring another migration later.
--
-- Run this in the Supabase SQL editor. Idempotent-safe.

ALTER TABLE world_config
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;
