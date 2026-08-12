// routes/adminIngestSrd.js
//
// One-time (re-runnable/idempotent) admin trigger for
// scripts/ingestSrd5e.js's SRD ingestion, exposed as an HTTP route
// specifically because this app's hosting plan has no shell access and
// Austin has no local dev environment -- the deployed service itself is
// the only place that already has both SUPABASE_URL/SUPABASE_SECRET_KEY
// and real network access. Reuses ingestMonsters() directly from the
// script (already exported for exactly this kind of reuse) rather than
// duplicating the ingestion logic -- "reuse it, don't fork it," same
// principle this codebase applies everywhere else.
//
// Same allowlist gating as routes/adminCost.js -- isAdminEmail() checked
// before any work runs, no separate permission system. Safe to leave
// mounted after use (idempotent upsert, admin-only, so it's not a real
// standing risk), but Austin can also delete this file + its one
// server.js mount line once the ingestion has run successfully, since it
// has no ongoing purpose after that.
//
// Usage: while signed in as the admin account, visit (GET, in a browser
// tab is fine):
//   https://<your-render-backend-host>/api/admin/ingest-srd-5e

const express = require("express");
const { isAdminEmail } = require("../lib/adminAccess");
const { ingestMonsters } = require("../scripts/ingestSrd5e");

const router = express.Router();

router.get("/admin/ingest-srd-5e", async (req, res) => {
  try {
    if (!isAdminEmail(req.userEmail)) {
      return res.status(403).json({ error: "Not authorized." });
    }

    const count = await ingestMonsters();
    return res.json({
      ok: true,
      message: `Upserted ${count} 5e SRD monsters into srd_library.`,
      note: "Classes/Spells/Items are not ingested by this script -- no verified CC-BY-4.0 structured dataset exists for them yet. See scripts/ingestSrd5e.js's header comment."
    });
  } catch (err) {
    console.error("Admin SRD ingestion failed:", err);
    return res.status(500).json({ error: err.message || "Ingestion failed." });
  }
});

module.exports = router;
