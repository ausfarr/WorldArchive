// Single source of truth for the version stamp shown across the marketing
// site (chronicled.world). Bump this one line when you ship something new
// -- every marketing page picks it up automatically, no per-page edits.
//
// Kept separate from lib/version.js (the app's own source of truth):
// this site is a separate static deployment with no backend of its own,
// so it can't read that file directly. Bump both together when you cut
// a new version.
window.APP_VERSION = "v0.8";
