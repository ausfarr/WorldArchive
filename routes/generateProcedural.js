// routes/generateProcedural.js
//
// Procedural (non-AI) entry generation -- see procedural_generation_scope_
// proposal.md. Deliberately thin, per CLAUDE.md's "route files stay thin"
// convention: all the real logic (weighted picks, template fills, formula
// calls) lives in lib/proceduralGenerators.js. This route does NOT write
// to the database itself -- it only returns the generated `entry` object,
// same preview shape a regenerate call already returns (routes/generateX.js),
// and the frontend immediately follows up with the existing
// POST /api/confirm-entry to persist it. That's the "no new write path"
// constraint from the proposal: the only place any of these 8 categories
// actually get written is the one route that already does it for AI and
// Manual Mode entries alike.
//
// No enforceGenerationCap here -- there's no AI/Claude call anywhere in
// this path, so it doesn't spend any of the points budget that middleware
// guards. enforceEntryCapOnGenerate still applies (a procedural entry is
// still a new row against the same per-world entry limit manual/AI
// entries share).
//
// Ruleset Recovery Phase R3: dispatches by ruleset for the categories
// that actually have per-ruleset mechanics, THE SAME WAY
// routes/confirmEntry.js already dispatches its write path -- read that
// file's "enemies"/"classes"/"items"/"survivors" branches before touching
// this one, this mirrors it exactly rather than inventing a different
// pattern. Echoes' own generateProcedurally() (lib/proceduralGenerators.js)
// stays the untouched fallback for every category on an 'echoes' world,
// and for the ruleset-agnostic categories (npcs/locations/factions/logs)
// on every ruleset -- same categories routes/confirmEntry.js's WRITERS
// map never branches by ruleset either, since neither has any mechanical
// fields in any ruleset (see world_forge_scope.md's registry section).
const express = require("express");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { generateProcedurally } = require("../lib/proceduralGenerators");
const { getRuleset, getGenericSystem } = require("../lib/worldConfigRepo");
const { GENERATORS_5E } = require("../lib/proceduralGenerators/5e");
const { GENERATORS_GENERIC } = require("../lib/proceduralGenerators/generic");

const router = express.Router();

// "spells" is new here -- Echoes/generic have no spells category at all
// (see requireCategoryAvailable.js's same hasCategory() gate every AI
// generation route already uses), so it's only ever reachable via
// GENERATORS_5E.spells below, never the Echoes fallback.
const VALID_CATEGORIES = new Set(["items", "enemies", "classes", "survivors", "spells", "npcs", "locations", "factions", "logs"]);

// Categories with a real per-ruleset generator -- everything else
// (npcs/locations/factions/logs) stays ruleset-agnostic and always falls
// through to Echoes' generateProcedurally(), same as confirmEntry.js's
// WRITERS map never branching those categories by ruleset.
const RULESET_AWARE_CATEGORIES = new Set(["enemies", "classes", "items", "survivors", "spells"]);

router.post("/generate-procedural", enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { category, name } = req.body || {};
    if (!VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ error: `Unknown category '${category}'` });
    }

    if (RULESET_AWARE_CATEGORIES.has(category)) {
      const ruleset = await getRuleset(worldId);
      if (ruleset === "5e") {
        const generator = GENERATORS_5E[category];
        if (!generator) {
          return res.status(501).json({ error: `${category} isn't available yet for the '5e' ruleset.` });
        }
        const entry = await generator(worldId, { name });
        return res.json({ preview: false, category, entry });
      }
      if (ruleset === "generic") {
        const generator = GENERATORS_GENERIC[category];
        if (!generator) {
          return res.status(501).json({ error: `${category} isn't available yet for the 'generic' ruleset.` });
        }
        const genericSystem = await getGenericSystem(worldId);
        if (!genericSystem || !Array.isArray(genericSystem.attributes) || !genericSystem.attributes.length) {
          return res.status(400).json({ error: "This world hasn't configured its homebrew attribute system yet -- finish that setup before rolling one procedurally." });
        }
        const entry = await generator(worldId, genericSystem, { name });
        return res.json({ preview: false, category, entry });
      }
      // 'echoes' (or an unrecognized ruleset) falls through to the
      // long-established Echoes generator below -- 'spells' has no
      // Echoes registry entry at all, so it 501s here rather than
      // silently falling into generateProcedurally(), matching
      // requireCategoryAvailable.js's own hasCategory() reasoning.
      if (category === "spells") {
        return res.status(501).json({ error: "Spells generation isn't available for this world's ruleset." });
      }
    }

    const entry = await generateProcedurally(worldId, category, { name });
    res.json({ preview: false, category, entry });
  } catch (err) {
    console.error("Procedural generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
