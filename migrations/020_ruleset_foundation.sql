-- Migration 020: Ruleset foundation
--
-- First migration of the multi-ruleset genericization project (see
-- session_addendum_ruleset_genericization.md for the full design). Adds
-- the schema a world's mechanical system (Echoes / 5e / Pathfinder 2e /
-- Generic) hangs off of, plus the canonical SRD/ORC content library new
-- worlds can import from. Nothing in this migration changes any existing
-- generation behavior by itself -- it's additive schema only. Every
-- existing world backfills to ruleset = 'echoes', so every route that
-- doesn't yet branch on ruleset (everything, until Phase 3+) keeps
-- generating exactly as it always has.
--
-- Run this in the Supabase SQL editor. Idempotent-safe.

-- ============================================================
-- world_config.ruleset
--
-- Picked once, at world creation (wizard Step 1), and permanent from
-- then on -- no route in this codebase ever updates this column after
-- the wizard's own set-ruleset step (see routes/wizard.js). Enum-like via
-- CHECK rather than a real Postgres enum type, matching this codebase's
-- existing preference for jsonb + CHECK over native enum types elsewhere
-- (e.g. entries.category is a plain text column, not an enum).
--
-- Default 'echoes' is what makes this a zero-risk migration for every
-- world that already exists: they all backfill to the exact ruleset
-- they've always implicitly been running, with no behavior change.
ALTER TABLE world_config
  ADD COLUMN IF NOT EXISTS ruleset text NOT NULL DEFAULT 'echoes';

ALTER TABLE world_config
  DROP CONSTRAINT IF EXISTS world_config_ruleset_check;

ALTER TABLE world_config
  ADD CONSTRAINT world_config_ruleset_check
  CHECK (ruleset IN ('echoes', '5e', 'pf2e', 'generic'));

-- ============================================================
-- srd_library
--
-- The canonical, pre-vetted SRD (5e, CC-BY-4.0) / ORC (Pathfinder 2e)
-- content library -- NOT tenant-scoped (no world_id). One shared table
-- read by every world on a given ruleset, populated only by
-- scripts/ingestSrd5e.js and scripts/ingestSrdPf2e.js running with the
-- service-role client. See those scripts for source/license details per
-- row (license_note duplicates the relevant one-liner onto the row
-- itself so a UI can display per-item attribution without a join back to
-- static copy).
--
-- data_json holds the full structured source record for that item, in
-- whatever shape the ingestion script produced it (mirrors this
-- codebase's entries.raw_json convention -- full fidelity in the JSON
-- blob, a handful of common fields also mirrored onto real columns so
-- filtering/browsing doesn't require unpacking JSON for every row).
--
-- cr/level/class_name/rarity are deliberately all nullable and all
-- present on every row regardless of category -- a monster uses cr, a
-- spell/class feature uses level, a class uses class_name, an item uses
-- rarity; each category only ever populates the columns relevant to it.
-- Simpler than a per-category table split, and this table is read-heavy/
-- write-rarely (ingestion only), so the sparse columns cost nothing
-- meaningful.
CREATE TABLE IF NOT EXISTS srd_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset text NOT NULL CHECK (ruleset IN ('5e', 'pf2e')),
  category text NOT NULL, -- 'monsters' | 'classes' | 'subclasses' | 'spells' | 'items'
  srd_id text NOT NULL, -- source dataset's own stable slug/index, e.g. "goblin", "fireball"
  name text NOT NULL,
  data_json jsonb NOT NULL,
  source_edition text NOT NULL, -- e.g. "5e SRD 5.1", "PF2e Remaster ORC"
  license_note text NOT NULL,
  cr numeric,
  level integer,
  class_name text,
  rarity text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ruleset, category, srd_id)
);

CREATE INDEX IF NOT EXISTS srd_library_ruleset_category_idx ON srd_library(ruleset, category);

ALTER TABLE srd_library ENABLE ROW LEVEL SECURITY;

-- Unlike this codebase's usual "RLS enabled, zero policies, backend uses
-- the service-role key day to day" pattern (see migrations/003's
-- lore_sections comment) -- srd_library is genuinely fine to read
-- directly as any authenticated user, since it's shared canonical
-- content, not tenant data. Explicit SELECT policy per this project's
-- scope doc. No INSERT/UPDATE/DELETE policy at all -- default-deny for
-- those, so only the service-role client (used exclusively by
-- scripts/ingestSrd5e.js / ingestSrdPf2e.js) can write.
DROP POLICY IF EXISTS srd_library_select_authenticated ON srd_library;
CREATE POLICY srd_library_select_authenticated
  ON srd_library FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- world_srd_imports
--
-- Join table recording "this world imported this srd_library row" --
-- deliberately a join table rather than a jsonb array on world_config
-- (per this project's scope doc), since routes need fast "is this
-- specific srd_library_id already imported into this world" checks (the
-- Import button's disabled state) and Phase 12's billing/entry-cap
-- exclusion needs to identify imported entries without re-parsing
-- raw_json on every entries row.
--
-- entry_id links back to the entries row the import produced (entries PK
-- is a composite of world_id/category/entry_id, not a single id column
-- -- see entriesRepo.js -- so this stores the entry_id string, not a
-- foreign key, matching how entries are addressed everywhere else in
-- this codebase).
CREATE TABLE IF NOT EXISTS world_srd_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  srd_library_id uuid NOT NULL REFERENCES srd_library(id) ON DELETE CASCADE,
  entry_id text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, srd_library_id)
);

CREATE INDEX IF NOT EXISTS world_srd_imports_world_id_idx ON world_srd_imports(world_id);

ALTER TABLE world_srd_imports ENABLE ROW LEVEL SECURITY;
-- Tenant-scoped, never read/written client-side -- same closed-by-default
-- pattern as lore_sections (RLS on, no policies, backend-only access via
-- the service-role client).
