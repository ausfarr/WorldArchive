-- Migration 002: Wizard columns on world_config
-- Adds support for Phase 2 (World Setup Wizard):
--   - category_config_json: per-category { label, enabled, blurb } for the
--     7 fixed content categories (Step 7 of the wizard). Read by the
--     archive's category pages/homepage once Phase 3/4 rewires the
--     frontend read path.
--   - draft_json: scratch space for in-progress wizard state. Every
--     "generate for me" result and manual field edit autosaves here as
--     one JSON blob across Steps 1-7. Nothing touches the "official"
--     columns (factions_json, stat_system_json, style_guide_json,
--     lore_doc_ref, category_config_json) until Review & Confirm (Step 8)
--     splits draft_json out into them and clears the draft.
--
-- Run this in the Supabase SQL editor. Idempotent-safe via IF NOT EXISTS.

ALTER TABLE world_config
  ADD COLUMN IF NOT EXISTS category_config_json jsonb;

ALTER TABLE world_config
  ADD COLUMN IF NOT EXISTS draft_json jsonb;

-- Optional but recommended: default draft_json to an empty object rather
-- than NULL, so wizard code can always assume an object to merge into
-- without a null-check on first load.
ALTER TABLE world_config
  ALTER COLUMN draft_json SET DEFAULT '{}'::jsonb;

-- Backfill any existing rows (should just be Austin's own world_config
-- row from Phase 1 testing) so draft_json is never NULL going forward.
UPDATE world_config
SET draft_json = '{}'::jsonb
WHERE draft_json IS NULL;
