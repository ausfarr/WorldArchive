// routes/adminIngestSrdOrigins.js
//
// One-time (re-runnable/idempotent) admin trigger for
// scripts/ingestSrdOrigins5e.js's SRD ingestion (Backgrounds, Species --
// from character-origins.md, the one downfallx/dnd-5e-srd-markdown file
// R5 Phase 4's ingestion never touched). Same pattern as
// routes/adminIngestSrdFull.js, and needed for the same reason here:
// this app's hosting plan has no shell access and Austin has no local
// dev environment, so the deployed service is the only place with both
// SUPABASE_URL/SUPABASE_SECRET_KEY and real network access.
//
// Extra reason this route matters THIS session specifically: the R6
// session that wrote scripts/ingestSrdOrigins5e.js had real Supabase
// credentials present but its egress proxy returned a policy-denial 403
// on every connection attempt to the Supabase project host -- confirmed
// via the proxy's own status endpoint, not a bad key. So this script was
// written and verified offline (re-parsing the live source markdown and
// asserting against it -- see scripts/verifySrdOriginsIngest.js) but was
// never actually run against production. This route is the real path to
// getting it run. See session_addendum_r6_*.md for the full network
// finding.
//
// Same allowlist gating as adminIngestSrd.js/adminIngestSrdFull.js --
// isAdminEmail() checked before any work runs.
//
// Usage: while signed in as the admin account, open the browser's dev
// tools (F12) -> Console tab, and run:
//   authFetch('/api/admin/ingest-srd-origins-5e').then(r => r.json()).then(console.log)

const express = require("express");
const { isAdminEmail } = require("../lib/adminAccess");
const { ingestAll } = require("../scripts/ingestSrdOrigins5e");

const router = express.Router();

router.get("/admin/ingest-srd-origins-5e", async (req, res) => {
  try {
    if (!isAdminEmail(req.userEmail)) {
      return res.status(403).json({ error: "Not authorized." });
    }

    const results = await ingestAll();
    return res.json({
      ok: true,
      message: "SRD Backgrounds/Species ingestion complete.",
      counts: results
    });
  } catch (err) {
    console.error("Admin SRD Origins ingestion failed:", err);
    return res.status(500).json({ error: err.message || "Ingestion failed." });
  }
});

module.exports = router;
