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
    const worldId = await getOrCreateWorldId(userData.user.id);
    req.userId = userData.user.id;
    req.worldId = worldId;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { resolveTenant, getOrCreateWorldId };
