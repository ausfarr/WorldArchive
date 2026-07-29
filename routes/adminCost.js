// routes/adminCost.js
//
// Read-only cost visibility for Austin: all-time total, this-month
// total, and per-user spend/generation-count, sourced from the
// persisted cost_log table (migrations/008_cost_log.sql).
//
// Access control is deliberately a hardcoded allowlist checked in code,
// NOT a Supabase-level permission or view -- see the world_config_by_user
// exposure (migrations/007/008 in the earlier session): Postgres views
// bypass RLS on their underlying tables by default, and this app's anon
// key is intentionally public client-side. This route only ever reads
// via the service-role-equivalent client in lib/supabaseClient.js, and
// the allowlist check happens before any query runs.
const express = require("express");
const { supabase } = require("../lib/supabaseClient");

const router = express.Router();

// TODO(Austin): add any co-founder/teammate emails here if that ever
// becomes a thing. Single-entry allowlist is fine for a solo beta.
const ADMIN_EMAILS = ["ausfarr@gmail.com"];

router.get("/admin/cost-summary", async (req, res) => {
  try {
    if (!req.userEmail || !ADMIN_EMAILS.includes(req.userEmail)) {
      return res.status(403).json({ error: "Not authorized." });
    }

    const { data: rows, error } = await supabase
      .from("cost_log")
      .select("user_id, category, provider, estimated_cost_usd, created_at");
    if (error) throw error;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalAllTimeUsd = 0;
    let totalThisMonthUsd = 0;
    const byUser = {};

    for (const row of rows) {
      const cost = Number(row.estimated_cost_usd) || 0;
      totalAllTimeUsd += cost;
      if (new Date(row.created_at) >= monthStart) totalThisMonthUsd += cost;

      const key = row.user_id || "unknown";
      if (!byUser[key]) byUser[key] = { userId: key, totalCostUsd: 0, callCount: 0 };
      byUser[key].totalCostUsd += cost;
      byUser[key].callCount += 1;
    }

    // cost_log only stores user_id (not email) -- look emails up from
    // Supabase Auth in one call per user, not per row. Beta-scale user
    // counts make this fine; worth batching differently if the tester
    // list gets large.
    const userIds = Object.keys(byUser).filter((id) => id !== "unknown");
    const emailById = {};
    await Promise.all(
      userIds.map(async (id) => {
        try {
          const { data } = await supabase.auth.admin.getUserById(id);
          if (data && data.user) emailById[id] = data.user.email;
        } catch (lookupErr) {
          console.error(`[admin] Could not look up email for user ${id}:`, lookupErr.message);
        }
      })
    );

    const perUser = Object.values(byUser)
      .map((u) => ({
        userId: u.userId,
        email: emailById[u.userId] || "(unknown)",
        totalCostUsd: Number(u.totalCostUsd.toFixed(4)),
        callCount: u.callCount
      }))
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

    res.json({
      totalAllTimeUsd: Number(totalAllTimeUsd.toFixed(4)),
      totalThisMonthUsd: Number(totalThisMonthUsd.toFixed(4)),
      perUser
    });
  } catch (err) {
    console.error("Cost summary failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
