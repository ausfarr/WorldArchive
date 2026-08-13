// routes/adminIngestSrdFull.js
//
// One-time (re-runnable/idempotent) admin trigger for
// scripts/ingestSrd5eFull.js's SRD ingestion (Spells, Items, Feats,
// Magic Items -- from downfallx/dnd-5e-srd-markdown, a different,
// separately-verified CC-BY-4.0 source from routes/adminIngestSrd.js's
// monster ingestion). Same reasoning as that file: this app's hosting
// plan has no shell access and Austin has no local dev environment, so
// the deployed service itself is the only place that already has both
// SUPABASE_URL/SUPABASE_SECRET_KEY and real network access to fetch the
// source markdown files.
//
// Same allowlist gating as routes/adminIngestSrd.js/adminCost.js --
// isAdminEmail() checked before any work runs. Safe to leave mounted
// after use (idempotent upsert, admin-only), but can be deleted +
// unmounted from server.js once the ingestion has run successfully.
//
// Usage: while signed in as the admin account, open the browser's dev
// tools (F12) -> Console tab, and run:
//   authFetch('/api/admin/ingest-srd-5e-full').then(r => r.json()).then(console.log)
// A plain URL visit in a new tab will NOT work -- auth here is a Bearer
// token attached by authFetch() from the current page's Supabase
// session, not a cookie.

const express = require("express");
const { isAdminEmail } = require("../lib/adminAccess");
const { ingestAll } = require("../scripts/ingestSrd5eFull");

const router = express.Router();

router.get("/admin/ingest-srd-5e-full", async (req, res) => {
  try {
    if (!isAdminEmail(req.userEmail)) {
      return res.status(403).json({ error: "Not authorized." });
    }

    const results = await ingestAll();
    return res.json({
      ok: true,
      message: "SRD ingestion complete.",
      counts: results,
      note: "Classes (classes.md) are not ingested by this script -- deferred, see scripts/ingestSrd5eFull.js's header comment."
    });
  } catch (err) {
    console.error("Admin full SRD ingestion failed:", err);
    return res.status(500).json({ error: err.message || "Ingestion failed." });
  }
});

module.exports = router;
