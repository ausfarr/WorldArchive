-- Migration 025: Fix plans.monthly_quota units bug
--
-- migrations/012_billing.sql originally inserted monthly_quota = 25
-- (intended as "25 generations/month"). migrations/015_field_assist_points.sql
-- then converted every generation-counting column in the schema from
-- "generations" to "points" (1 generation = 5 points, see that file's
-- header) and correctly included `update plans set monthly_quota =
-- monthly_quota * 5` in that backfill -- 25 -> 125 points, matching
-- GENERATION_CAP (lib/worldConfigRepo.js) which made the same 25 -> 125
-- move for the legacy beta cap.
--
-- Verified directly against the live `plans` table during the v1.0.0
-- launch-cleanup session (see session_addendum_v1_launch_cleanup.md):
-- the live row holds monthly_quota = 1250, not 125. That's a further,
-- unexplained 10x on top of the already-correct 015 backfill -- no
-- migration file between 015 and 024 touches monthly_quota, so this was
-- some manual edit against the live DB, not a code/migration bug. Net
-- effect: a $5/mo subscriber's quota reads as 250 generations/month
-- instead of the intended 25.
--
-- This sets it directly to the verified-correct value rather than
-- another relative multiply, since the exact provenance of the 1250
-- value (and thus the "correct" multiplier to reverse it) isn't known.
--
-- Run this by hand against Supabase (SQL editor or CLI) before this is
-- correct in production -- no migration runner exists, per repo
-- convention (see CLAUDE.md). Safe to re-run.

UPDATE plans
  SET monthly_quota = 125
  WHERE id = 'chronicled_monthly';
