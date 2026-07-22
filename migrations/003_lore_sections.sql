-- Migration 003: Lore sections table (Wizard Steps 2+3)
--
-- lore_sections holds the tagged, queryable lore content for a world —
-- the per-world, multi-tenant equivalent of lore/world_bible_sections.json
-- (which only ever served Austin's single hardcoded Echoes world). Mirrors
-- that file's shape: one row per section, tagged by category (and,
-- eventually, faction — see note below) so getRelevantSections()-style
-- filtering can work per-world instead of off one global flat file.
--
-- NOTE on faction_tags: left empty (or minimal) at Lore-generation time by
-- design. Factions (wizard Step 4) come AFTER Lore (Step 3) in the wizard
-- flow, so there's nothing to tag sections BY yet at ingestion time.
-- Category tagging (which of the 7 content-generator categories a section
-- is relevant to) is still applied. Backfilling faction_tags once a
-- world's factions exist is a known follow-up, not solved by this
-- migration — see world_forge_scope.md's Known Limitations.
--
-- Run this in the Supabase SQL editor. Idempotent-safe.

CREATE TABLE IF NOT EXISTS lore_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  category_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  faction_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  core boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'generated', -- 'generated' | 'imported'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lore_sections_world_id_idx ON lore_sections(world_id);

ALTER TABLE lore_sections ENABLE ROW LEVEL SECURITY;
-- Defense-in-depth backstop, matching Phase 1's pattern for the entries
-- table -- the backend uses the Supabase secret key day to day and
-- bypasses RLS, but this keeps direct client-side access closed off.

-- Safety net: lore_doc_ref was listed in the original (untracked, manually
-- created) world_config schema, but no code has referenced it yet. Adding
-- with IF NOT EXISTS so this migration is safe to run whether or not it's
-- already there. Stores the full raw composed/imported document text —
-- lore_sections above is the queryable, tagged breakdown of the same
-- content.
ALTER TABLE world_config
  ADD COLUMN IF NOT EXISTS lore_doc_ref text;
