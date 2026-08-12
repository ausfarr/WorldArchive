-- Migration 022: Remove Pathfinder 2e from the ruleset CHECK constraint
--
-- Phase R1 of the multi-ruleset recovery plan (see
-- session_addendum_ruleset_recovery_plan.md /
-- session_addendum_pf2e_removal_shipped.md). PF2e is being removed, not
-- deprecated -- it only ever shipped Homebrew-tier support (no path to
-- Import/Reflavor without resolving an unresolved ORC-vs-CUP licensing
-- question) and no real world has ever used it, so this is a clean
-- tightening of the constraint migrations/020_ruleset_foundation.sql
-- originally added, not a data migration -- there is nothing to migrate.
--
-- Run this in the Supabase SQL editor. Idempotent-safe.
--
-- Safe against any pre-existing row: every world_config row has always
-- backfilled to 'echoes' by default (migrations/020), and this session's
-- code removal confirms no route ever set ruleset = 'pf2e' for a real
-- world outside this project's own admin testing -- but if a stray
-- 'pf2e' row exists, this constraint will fail to apply until that row
-- is corrected by hand; check `SELECT id, ruleset FROM world_config
-- WHERE ruleset = 'pf2e'` first if this migration errors.

ALTER TABLE world_config
  DROP CONSTRAINT IF EXISTS world_config_ruleset_check;

ALTER TABLE world_config
  ADD CONSTRAINT world_config_ruleset_check
  CHECK (ruleset IN ('echoes', '5e', 'generic'));
