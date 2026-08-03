-- 011_campaign_arc_pending_stages.sql
--
-- Fixes real data loss: a generated Campaign plan only lived in the
-- browser's JS memory. Clicking "Create this Quest" on an unmatched
-- stage navigates to the Quest builder -- a full page load -- which
-- wiped that in-memory state. Returning to the Campaign afterward showed
-- nothing from the plan except whatever had already been separately
-- "accepted." Fix: matched stages now commit to quest_ids immediately on
-- generate, and unmatched stages are persisted here so they're still
-- visible (with a working "Create this Quest" link) no matter how many
-- times the DM navigates away and back.

alter table campaign_arcs add column if not exists pending_stages_json jsonb not null default '[]'::jsonb;

-- pending_stages_json shape: [{ id, title, concept }]
-- id is a client-generated string (see archive/js/campaignArc.js), used
-- to remove exactly the right entry once its Quest is created --
-- matching by title/concept text would break on duplicate or edited
-- titles.
