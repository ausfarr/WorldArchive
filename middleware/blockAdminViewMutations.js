// middleware/blockAdminViewMutations.js
//
// Mounted right after resolveTenant (needs req.isAdminView) and before
// every route below it. This is the actual read-only guarantee for the
// admin "view as" feature -- deliberately a single blanket check here
// rather than trusting every individual route file to remember to check
// req.isAdminView itself. New POST/PATCH/PUT/DELETE routes added later
// are automatically covered without needing to know this feature exists.
//
// GET (and HEAD/OPTIONS) always pass through untouched -- that's the
// entire point of admin view mode.

function blockAdminViewMutations(req, res, next) {
  const isSafeMethod = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  if (req.isAdminView && !isSafeMethod) {
    return res.status(403).json({
      error: "Read-only admin view -- actions are disabled while viewing another user's world."
    });
  }
  next();
}

module.exports = { blockAdminViewMutations };
