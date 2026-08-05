// Single source of truth for the app's displayed version number.
// Bump this one line when you ship something new — every page picks it
// up automatically via the /version.js route below, no per-file edits.
//
// IMPORTANT -- this number is now ALSO used as a cache-busting query
// param on <script src="js/render.js?v=..."> tags across every archive/
// *.html page (added this session after a real bug: browsers kept
// serving a stale cached render.js after deploy, since there was
// nothing telling them a new version existed). Since these are static
// HTML files with no build/templating step, that query param has to be
// bumped by hand alongside this constant -- use
// scripts/bump-cache-version.js (added this session) to do both at
// once instead of hand-editing 24 files.
module.exports = {
  APP_VERSION: "v0.11"
};
