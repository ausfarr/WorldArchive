// lib/adminAccess.js
//
// Single source of truth for "who is an admin" -- previously
// routes/adminCost.js had its own inline ADMIN_EMAILS array. Pulled out
// here because middleware/resolveTenant.js now needs the same check (for
// the read-only admin "view as" override) and a second hardcoded copy
// would inevitably drift out of sync with the first.
//
// Deliberately still a plain in-code allowlist, not a Supabase-level
// permission or table -- same reasoning as the original adminCost.js
// comment: Postgres views bypass RLS on their underlying tables by
// default, and this app's anon key is intentionally public client-side,
// so admin gating belongs in server code that runs behind the
// service-role-equivalent client, not in the DB layer.

// TODO(Austin): add any co-founder/teammate emails here if that ever
// becomes a thing. Single-entry allowlist is fine for a solo beta.
const ADMIN_EMAILS = ["ausfarr@gmail.com"];

function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(email);
}

module.exports = { ADMIN_EMAILS, isAdminEmail };
