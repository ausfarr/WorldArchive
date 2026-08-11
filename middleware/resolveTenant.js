// middleware/resolveTenant.js
//
// Real implementation — Phase 1, Section 6, step 1
// (multi_tenant_pivot_scope.md). Replaces the placeholder that refused
// every /api request.
//
// What this does, per request:
//   1. Reads the Supabase-issued JWT from `Authorization: Bearer <token>`.
//   2. Verifies it against Supabase Auth (supabase.auth.getUser) to get
//      the authenticated user's id -- this is a real network round-trip
//      to Supabase's auth server, not a local JWT decode, so a
//      revoked/expired/forged token is always caught here.
//   3. Looks up that user's single world (v1: one world per user, a DB
//      constraint -- see multi_tenant_pivot_scope.md Section 5 schema).
//      Auto-creates one on the user's first-ever authenticated request.
//   4. Sets req.userId + req.worldId and calls next().
//
// Nothing in the route files needs to change -- they already just read
// req.worldId.

const { supabase } = require("../lib/supabaseClient");
const { isAdminEmail } = require("../lib/adminAccess");

// Read-only admin "view as" override -- lets an allowlisted admin browse
// another user's world through the normal archive UI without ever
// authenticating as that user. Deliberately implemented as a request
// header (`X-Admin-View-World-Id`), NOT a route param or query string
// leaking into browser history/logs any more than necessary, and checked
// AFTER the requester's own JWT has already resolved a real admin
// identity -- a non-admin sending this header is silently ignored, never
// given an error that would confirm the header does anything.
//
// This only ever swaps which worldId the rest of the request pipeline
// reads/writes against -- req.userId/req.userEmail stay the admin's own,
// so cost-logging (lib/costContext.js) and any future "who did this"
// auditing still attributes correctly to the admin, not the viewed user.
// Actual write-blocking for admin-view requests happens in
// middleware/blockAdminViewMutations.js, mounted right after this one --
// this file's job is only to resolve which worldId is in play.
const ADMIN_VIEW_HEADER = "x-admin-view-world-id";

async function resolveAdminViewOverride(req) {
  const requestedWorldId = req.headers[ADMIN_VIEW_HEADER];
  if (!requestedWorldId || !isAdminEmail(req.userEmail)) return null;

  const { data, error } = await supabase
    .from("worlds")
    .select("id")
    .eq("id", requestedWorldId)
    .maybeSingle();
  if (error || !data) return null; // bad/unknown id -- fall through to the admin's own world

  return data.id;
}

function extractBearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

// Race-safe get-or-create: v1 enforces one world per user via a unique
// index on worlds.user_id (multi_tenant_pivot_scope.md Section 5), so we
// lean on that instead of a DB trigger -- see that doc's Section 6
// write-up for why this was chosen over a trigger/webhook approach.
async function getOrCreateWorldId(userId) {
  // Fast path: world already exists (true for every request after the
  // user's very first one).
  const { data: existing, error: selectError } = await supabase
    .from("worlds")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing.id;

  // No world yet -- likely this user's first authenticated request ever.
  // Insert one. If a near-simultaneous request already won this race, the
  // unique constraint on user_id throws Postgres error 23505, which we
  // treat as expected rather than a failure.
  const { data: inserted, error: insertError } = await supabase
    .from("worlds")
    .insert({ user_id: userId, name: "My World" })
    .select("id")
    .single();

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }
  if (inserted) return inserted.id;

  // Lost the race -- re-select to get the row the other request created.
  const { data: afterRace, error: raceSelectError } = await supabase
    .from("worlds")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (raceSelectError) throw raceSelectError;
  return afterRace.id;
}

async function resolveTenant(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: "Missing or malformed Authorization header. Expected 'Bearer <token>'."
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData || !userData.user) {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }

  try {
    req.userId = userData.user.id;
    req.userEmail = userData.user.email;

    const adminViewWorldId = await resolveAdminViewOverride(req);
    if (adminViewWorldId) {
      req.worldId = adminViewWorldId;
      req.isAdminView = true;
    } else {
      req.worldId = await getOrCreateWorldId(userData.user.id);
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { resolveTenant, getOrCreateWorldId };
