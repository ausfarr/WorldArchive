-- Migration 024: Add 'spells' to entries_category_check
--
-- entries.category has a CHECK constraint that predates the migrations/
-- folder -- same blind spot documented for the old Locations fix
-- (migrations/007). Confirmed directly (not just via grep) that no
-- migration through 023 ever adds 'spells' to it, which means every
-- attempt to write a Spell entry -- AI-generated or procedural --
-- fails at this constraint after generating successfully. This is the
-- root cause of Spells "Roll Randomly" (and AI generation) silently
-- not working.
--
-- Drops and re-adds the constraint with the full current category list,
-- same pattern the Locations fix used. Current list confirmed against
-- archive/js/render.js's CATEGORY_LABELS.
--
-- Run this in the Supabase SQL editor. Idempotent-safe.

ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_category_check;

ALTER TABLE entries
  ADD CONSTRAINT entries_category_check
  CHECK (category IN (
    'factions', 'npcs', 'enemies', 'classes', 'items',
    'spells', 'logs', 'survivors', 'locations'
  ));
