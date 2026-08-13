-- Migration 024: Add 'spells' to entries_category_check
--
-- Phase 1 of the R5 SRD ingestion / import-fixes session (see
-- session_addendum_r5_srd_ingestion_and_import_fixes.md). `entries.category`
-- carries a CHECK constraint that predates the migrations/ folder -- the
-- same "blind spot" class of bug the original Locations category hit
-- (added to the app well before this repo tracked schema changes as
-- files). No migration through 023 ever added 'spells' to it, so every
-- attempt to write a spell entry -- AI-generated or procedural
-- ("Roll Randomly") -- generates fine and then fails silently at the
-- final DB write. This is the confirmed root cause of Spells' "Roll
-- Randomly doesn't work" report, and would equally break AI-generated
-- Spells' confirm-entry step.
--
-- Full current category list, cross-checked against archive/js/render.js's
-- CATEGORY_LABELS, lib/entriesRepo.js's generic accessors, and
-- routes/confirmEntry.js's WRITERS map (which has every category except
-- 'factions', handled specially there -- but 'factions' is still a valid
-- entries.category value written via its own path in confirmEntry.js):
-- factions, npcs, enemies, classes, items, spells, logs, survivors,
-- locations. Nine values, one more than the current DB constraint allows.
--
-- Same drop + re-add pattern as migrations/020 and 022 used for
-- world_config_ruleset_check.
--
-- Run this in the Supabase SQL editor. Idempotent-safe.

ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_category_check;

ALTER TABLE entries
  ADD CONSTRAINT entries_category_check
  CHECK (category IN (
    'factions',
    'npcs',
    'enemies',
    'classes',
    'items',
    'spells',
    'logs',
    'survivors',
    'locations'
  ));
