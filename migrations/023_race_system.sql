-- Migration 023: Race/Species reference system on world_config
--
-- R4 Phase 3 -- Austin's call (see
-- session_addendum_ruleset_recovery_r4_5e_completeness_scope.md, decision
-- #1): a small, editable/addable/removable reference pool, same shape as
-- Skills (migrations/005_skill_system.sql), NOT a full 9th content
-- category (no generation route, no procedural table, no portrait
-- tie-in, no wizard category-config toggle -- a handful of races per
-- world, not hundreds of unique generated instances).
--
-- Shape: a JSON array of
--   { key, name, abilityScoreIncrease: { str, dex, con, int, wis, cha },
--     choiceNote, size, speed, traits: [{ name, description }], flavor }
-- populated from lib/rulesets/5e/starterRaces.js's hand-authored SRD
-- starter list by default, or generated/edited per world via the
-- Stats & Skills wizard step (5e-only -- see archive/wizard-stats.html's
-- fixed-ruleset-container).
--
-- Run this in the Supabase SQL editor. Idempotent-safe.

ALTER TABLE world_config
  ADD COLUMN IF NOT EXISTS race_system_json jsonb;
