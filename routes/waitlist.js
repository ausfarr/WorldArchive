const express = require("express");
const { supabase } = require("../lib/supabaseClient");

const router = express.Router();

// Public marketing-site signup form -- the chronicled.world landing page
// and the itch.io listing both post here. Deliberately NOT mounted under
// /api + resolveTenant in server.js: there's no logged-in user yet, this
// is a pre-account lead capture, not a tenant-scoped request.
//
// CORS is opened narrowly, just for this one route, since the landing
// page lives on a separate Render Static Site (chronicled.world) from
// this API (app.chronicled.world). Every other route stays same-origin
// only, this is the sole intentional exception.

const ALLOWED_ORIGINS = new Set([
  "https://chronicled.world",
  "https://www.chronicled.world"
]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.options("/waitlist", (req, res) => {
  setCorsHeaders(req, res);
  res.sendStatus(204);
});

router.post("/waitlist", async (req, res) => {
  setCorsHeaders(req, res);

  const email = String(req.body?.email || "").trim().toLowerCase();
  // Freeform channel tag ("landing_page", "itch", etc) so signups can be
  // compared by source later -- see session note on tagging testers by
  // recruitment channel. Not validated against a fixed list on purpose;
  // this is just an attribution breadcrumb, not a security boundary.
  const source = String(req.body?.source || "").trim().slice(0, 100) || null;

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const { error } = await supabase
    .from("waitlist_signups")
    .insert({ email, source });

  // 23505 = unique violation -- this email already signed up. Treated as
  // success rather than surfaced as an error, so the form never leaks
  // whether a given address is already on the list.
  if (error && error.code !== "23505") {
    console.error("Waitlist signup failed:", error);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }

  res.json({ ok: true });
});

module.exports = router;
