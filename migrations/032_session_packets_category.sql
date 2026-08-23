-- 032_session_packets_category.sql
--
-- Session Prep Companion, Phase 4 -- adds 'session-packets' to
-- entries.category's CHECK constraint (see migrations/024_spells_
-- category_check.sql for the same pattern, most recently used to add
-- 'spells').
--
-- DELIBERATE DEVIATION FROM THE "FIXED 8 CATEGORIES" PRINCIPLE: Campaign
-- Modules/Arcs (migrations/009, 010) got their own dedicated tables
-- specifically BECAUSE they're structural references, not generated
-- narrative content with their own dossier page -- see 009's header
-- comment. A Session Packet is the opposite: it's real generated
-- content (opening read-aloud text, scene beats, NPC voice reminders, a
-- complications deck) that needs exactly the archive infrastructure
-- every other category already has -- a browsable list page, a dossier
-- view, raw_json + body_html storage, and the standard preview->confirm
-- flow (session_prep_companion_scope.md Section 3 explicitly asks for
-- "its own manifest/category... so past packets are browsable, same
-- pattern as every other generated category," and to reuse
-- confirmEntry.js's dispatch). Reusing the shared `entries` table gets
-- all of that for free; a bespoke table (Campaign-Module-style) would
-- mean re-implementing the list/dossier/confirm machinery from scratch
-- for no benefit. 'spells' already set the precedent that this
-- constraint can grow when a new category genuinely needs the same
-- shape as the original 8 -- this is the same kind of addition.
--
-- APPLY BY HAND: no migration runner in this project -- run this against
-- the Supabase project via the SQL Editor (or CLI) before this phase's
-- code goes live.

ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_category_check;

ALTER TABLE entries
  ADD CONSTRAINT entries_category_check
  CHECK (category IN (
    'factions', 'npcs', 'enemies', 'classes', 'items',
    'spells', 'logs', 'survivors', 'locations', 'session-packets'
  ));
