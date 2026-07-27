const express = require("express");
const { searchEntries } = require("../lib/entriesRepo");

const router = express.Router();

// Archive-wide search bar (shared nav, every archive page). Full-text
// (ILIKE) against entry names/titles only -- no body-text or semantic
// search in this pass, see session_addendum_search_and_grouping.md.
// Zero Claude calls, so intentionally NOT gated by
// middleware/enforceGenerationCap.js -- pure Postgres read, same
// treatment as routes/entries.js.
router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) {
      return res.json({ results: [] });
    }
    const results = await searchEntries(req.worldId, q);
    res.json({ results });
  } catch (err) {
    console.error("Search failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
