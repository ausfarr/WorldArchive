// routes/adminWorlds.js
//
// Read-only world listing for Austin's admin panel -- powers the
// "Browse Worlds" section in archive/admin.html, which lets him pick a
// world to view via the X-Admin-View-World-Id override in
// middleware/resolveTenant.js. Same allowlist-in-code gating pattern as
// routes/adminCost.js (see that file's header comment for why this is
// deliberately not a Supabase view/RLS-level permission).
//
// Beta-scale user counts make an all-rows-then-aggregate-in-JS approach
// fine here, same as adminCost.js's per-user cost breakdown -- worth
// revisiting (a real GROUP BY via an RPC, or pagination) once the tester
// list gets large enough that pulling every worlds/entries row on every
// admin page load stops being cheap.

const express = require("express");
const { supabase } = require("../lib/supabaseClient");
const { isAdminEmail } = require("../lib/adminAccess");

const router = express.Router();

router.get("/admin/worlds", async (req, res) => {
  try {
    if (!isAdminEmail(req.userEmail)) {
      return res.status(403).json({ error: "Not authorized." });
    }

    const { data: worlds, error: worldsError } = await supabase
      .from("worlds")
      .select("id, user_id, name, created_at")
      .order("created_at", { ascending: false });
    if (worldsError) throw worldsError;

    // Entry counts, excluding locked placeholders -- a freshly-created
    // world with nothing generated yet shouldn't look identical to one
    // with real content just because both have plenty of placeholder rows.
    const { data: entryRows, error: entriesError } = await supabase
      .from("entries")
      .select("world_id")
      .eq("locked", false);
    if (entriesError) throw entriesError;

    const entryCountByWorld = {};
    for (const row of entryRows || []) {
      entryCountByWorld[row.world_id] = (entryCountByWorld[row.world_id] || 0) + 1;
    }

    // world_config carries setup_completed_at -- useful to flag worlds
    // that are still mid-wizard (nothing worth viewing yet) vs. ones with
    // a finished setup.
    const { data: configRows, error: configError } = await supabase
      .from("world_config")
      .select("world_id, setup_completed_at");
    if (configError) throw configError;
    const setupCompletedByWorld = {};
    for (const row of configRows || []) {
      setupCompletedByWorld[row.world_id] = !!row.setup_completed_at;
    }

    // One auth lookup per distinct owner, not per world -- same batching
    // approach as adminCost.js's email lookup.
    const emailByUserId = {};
    await Promise.all(
      [...new Set((worlds || []).map((w) => w.user_id))].map(async (userId) => {
        try {
          const { data } = await supabase.auth.admin.getUserById(userId);
          if (data && data.user) emailByUserId[userId] = data.user.email;
        } catch (lookupErr) {
          console.error(`[admin] Could not look up email for user ${userId}:`, lookupErr.message);
        }
      })
    );

    const result = (worlds || []).map((w) => ({
      worldId: w.id,
      name: w.name || "Untitled World",
      ownerEmail: emailByUserId[w.user_id] || "(unknown)",
      createdAt: w.created_at,
      entryCount: entryCountByWorld[w.id] || 0,
      setupCompleted: !!setupCompletedByWorld[w.id]
    }));

    res.json({ worlds: result });
  } catch (err) {
    console.error("Admin worlds list failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
