// routes/srdLibrary.js
//
// Multi-ruleset genericization, Phase 11: read-only listing endpoint so
// the frontend's Import/Reflavor picker (archive/enemies/index.html) can
// browse srd_library without a direct DB round trip from the browser
// (this app has no client-side DB access -- see CLAUDE.md). Thin wrapper
// around lib/srdLibraryRepo.js's listSrdEntries, which already existed
// for server-side use (routes/generateEnemy.js's Homebrew reference-
// monster lookup) -- this just exposes the same read path over HTTP.
const express = require("express");
const { listSrdEntries } = require("../lib/srdLibraryRepo");

const router = express.Router();

router.get("/srd-library", async (req, res) => {
  try {
    const { ruleset, category } = req.query;
    if (!ruleset || !category) {
      return res.status(400).json({ error: "ruleset and category query params are required." });
    }
    const entries = await listSrdEntries(ruleset, category);
    res.json({ entries });
  } catch (err) {
    console.error("Listing SRD library failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
