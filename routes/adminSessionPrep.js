// routes/adminSessionPrep.js
//
// Admin-gated sanity-check endpoint for lib/sessionAssembly.js (Session
// Prep Companion, Phase 1 -- see session_prep_companion_scope.md Section
// 2). No real UI consumes this yet -- Phase 4's Session Packet generation
// is the first real caller of assembleSessionContext(). Same
// isAdminEmail-allowlist gating pattern as routes/adminWorlds.js/
// routes/adminCost.js, since this exposes raw internal shape (full
// resolved entries, not a curated response) that isn't meant for a normal
// user to hit.

const express = require("express");
const { isAdminEmail } = require("../lib/adminAccess");
const { assembleSessionContext } = require("../lib/sessionAssembly");

const router = express.Router();

router.get("/admin/session-assembly-test", async (req, res) => {
  try {
    if (!isAdminEmail(req.userEmail)) {
      return res.status(403).json({ error: "Not authorized." });
    }
    const { questId, campaignId } = req.query || {};
    if (!questId && !campaignId) {
      return res.status(400).json({ error: "Pass ?questId=... or ?campaignId=... as a query param." });
    }
    const context = await assembleSessionContext(req.worldId, { questId, campaignId });
    res.json(context);
  } catch (err) {
    console.error("Session assembly test failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
