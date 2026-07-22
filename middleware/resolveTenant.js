// middleware/resolveTenant.js
//
// PLACEHOLDER — Phase 1, Section 5, step 4 ("Real Supabase Auth wiring")
// is intentionally NOT done yet. Every route below now expects
// `req.worldId` to be set by this middleware, but this middleware
// currently refuses every request rather than faking a worldId — per
// the explicit decision to not test this rewrite live until real auth
// is wired.
//
// When wiring real auth, replace the body of this function with:
//   1. Read the Supabase session/JWT from the request (e.g. an
//      Authorization: Bearer <token> header) and verify it against
//      Supabase Auth to get the authenticated user id.
//   2. Look up that user's single world (SELECT id FROM worlds WHERE
//      user_id = $1 — remember: one world per user is a v1 DB
//      constraint, so this is always at most one row).
//   3. If no world exists yet for a brand-new user, this is the place
//      to auto-create one (ties into "a brand-new user gets a clean,
//      correctly-scoped empty world automatically" in the Definition
//      of Done).
//   4. Set req.worldId = <that world's id> and call next().
//
// Nothing below this comment should need to change in the route files
// once that's done — they already just read req.worldId.

function resolveTenant(req, res, next) {
  next(new Error(
    "Auth not wired yet (multi_tenant_pivot_scope.md Section 5, step 4). " +
    "req.worldId has no source until real Supabase Auth is implemented here."
  ));
}

module.exports = { resolveTenant };
