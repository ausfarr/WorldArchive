// middleware/requireCategoryAvailable.js
//
// Multi-ruleset genericization safety net. Without this, a world on a
// non-Echoes ruleset hitting a generation route that hasn't been
// ruleset-genericized yet would silently fall through to Echoes' own
// generation logic (BODY/REFLEX/KNOWLEDGE attributes, 1-99 class
// leveling, the fixed weapon-skill list) -- mechanically wrong and
// confusing output for a world that picked 5e/generic specifically
// to NOT get that. Categories with no ruleset-specific mechanics at all
// (Factions, Locations, NPCs -- see world_forge_scope.md's registry
// section for why) are intentionally never gated by this and keep
// working identically for every ruleset.
//
// Mount AFTER enforceGenerationCap (needs req.refundGeneration to exist)
// and typically right where a route would otherwise start building its
// ruleset-specific dispatch, e.g.:
//   router.post("/generate-class", requireAiEnabled, enforceGenerationCap,
//     enforceEntryCapOnGenerate, requireCategoryAvailable("classes"), async (req, res) => {...
//
// A route that HAS been genericized for a given ruleset+category (see
// routes/generateEnemy.js) does its own dispatch instead of using this --
// this middleware is specifically for categories not yet ported, so
// their Echoes-only implementation doesn't silently misfire.
const { getRuleset } = require("../lib/worldConfigRepo");
const { hasCategory } = require("../lib/rulesets");

function requireCategoryAvailable(category) {
  return async function (req, res, next) {
    try {
      const ruleset = await getRuleset(req.worldId);
      // NOT special-cased to always pass for 'echoes' -- that was this
      // middleware's original shape, safe only because every category it
      // gated at the time (Classes/Items/Survivors) already had a real
      // Echoes registry entry. It broke the moment a category with NO
      // Echoes equivalent at all (Spells -- Echoes has no spell system)
      // needed gating: an 'echoes' bypass would let an Echoes world hit
      // /generate-spell and 500 deep inside a route with nothing to
      // dispatch to, instead of a clean 501 here. hasCategory() alone is
      // correct for both cases: it's true for echoes+classes/items/
      // survivors (real registry entries) and false for echoes+spells
      // (no registry entry), so this still doesn't change behavior for
      // any category Echoes actually has.
      if (hasCategory(ruleset, category)) {
        return next();
      }
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(501).json({
        error: `${category.charAt(0).toUpperCase() + category.slice(1)} generation isn't available yet for the '${ruleset}' ruleset.`
      });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireCategoryAvailable };
