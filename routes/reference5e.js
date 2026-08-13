// routes/reference5e.js
//
// R4 Phase 5: read-only static-reference-data route -- unlike
// race_system_json (per-world, editable), the core Background/Feat
// lists in lib/rulesets/5e/backgroundsAndFeats.js are fixed, identical
// for every 5e world, and not stored in world_config at all. This route
// exists purely so the manual-entry frontend (which has no build step to
// share server-side modules with the browser -- see
// archive/js/rulesetManualForms.js's header comment) can populate its
// Background/Feat dropdowns without duplicating ~150 lines of hand-
// authored text client-side, the one exception to that file's usual
// "small tables only" duplication rule.

const express = require("express");
const { CORE_BACKGROUNDS, CORE_FEATS } = require("../lib/rulesets/5e/backgroundsAndFeats");

const router = express.Router();

router.get("/reference/5e/backgrounds-and-feats", (req, res) => {
  res.json({ backgrounds: CORE_BACKGROUNDS, feats: CORE_FEATS });
});

module.exports = router;
