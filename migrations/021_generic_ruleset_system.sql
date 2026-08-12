-- Migration 021: Generic ruleset system config on world_config
--
-- Phase 10 of the multi-ruleset genericization project. A Generic-
-- ruleset world has no fixed attribute set (unlike Echoes'
-- BODY/REFLEX/KNOWLEDGE/PRESENCE/SANITY/FATE or 5e's six ability
-- scores) -- it's fully world-defined, same UX pattern as the existing
-- Skills wizard step's editable pool (migrations/005_skill_system.sql),
-- not a new pattern.
--
-- generic_system_json shape:
--   {
--     attributes: [{ key: "might", label: "Might" }, ...],  -- world-chosen, any count
--     useFormula: true | false,   -- "compute derived stats from a formula"
--                                  -- vs. "let the model write stat blocks
--                                  -- as flavor text, no formula" (scope doc's
--                                  -- own toggle wording)
--     derivedStats: [             -- only present/used when useFormula is true
--       { key: "hitPoints", label: "Hit Points", attributeKey: "might", coefficient: 2, base: 10 }
--     ]
--   }
--
-- Run this in the Supabase SQL editor. Idempotent-safe.

ALTER TABLE world_config
  ADD COLUMN IF NOT EXISTS generic_system_json jsonb;
