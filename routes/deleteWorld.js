const express = require("express");
const { resetWorldConfig } = require("../lib/worldConfigRepo");
const { clearLoreSections } = require("../lib/loreRepo");
const { deleteAllEntries } = require("../lib/entriesRepo");
const { deleteAllPortraits } = require("../lib/fileWriter");

const router = express.Router();

// Wipes everything a world has ever generated and sends the user back to
// a fresh wizard -- but keeps their Supabase Auth account and worlds row
// intact (same world_id, same login). Austin's explicit call: "delete
// world" means start over, not delete the account.
//
// Order matters here: entries and portraits first (the expensive,
// generated content), then wizard config/lore last, since those are what
// the frontend checks to decide whether to redirect into the wizard.
//
// Deliberately does NOT touch generation_count (the beta usage cap in
// worldConfigRepo.js / middleware/enforceGenerationCap.js). If it did,
// "Delete World" would double as "reset my cap" -- letting a tester
// delete-and-recreate their way past the 25-generation limit, which
// defeats the whole point of the cap existing. The cap tracks the
// account, not the current world's content.
router.post("/world/delete", async (req, res) => {
  try {
    const worldId = req.worldId;
    await deleteAllEntries(worldId);
    await deleteAllPortraits(worldId);
    await resetWorldConfig(worldId);
    await clearLoreSections(worldId);
    res.json({ deleted: true });
  } catch (err) {
    console.error("Delete world failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
