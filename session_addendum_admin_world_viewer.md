# Session addendum — Admin read-only world viewer

**What was built:** Austin (as the single hardcoded admin) can now browse
any tester's world through the real archive UI, read-only.

## How it works

- **`lib/adminAccess.js`** — new shared `ADMIN_EMAILS`/`isAdminEmail()`,
  pulled out of `routes/adminCost.js` (which now imports it) so
  `middleware/resolveTenant.js` can use the same allowlist without a
  second copy drifting out of sync. Still a plain in-code allowlist, not
  a Supabase view/permission — same reasoning as the original
  `adminCost.js` comment (Postgres views bypass RLS on their underlying
  tables by default, and this app's anon key is intentionally public).

- **`middleware/resolveTenant.js`** — after resolving the real requester's
  identity from their JWT (unchanged), it now also checks for an
  `X-Admin-View-World-Id` request header. If present *and* the requester
  is an admin *and* that world id actually exists, `req.worldId` is
  swapped to the target world and `req.isAdminView = true` is set.
  `req.userId`/`req.userEmail` stay the admin's own throughout — cost
  logging and any future "who did this" auditing still attributes to the
  admin, not the viewed user. A non-admin sending this header is silently
  ignored (never a 403 that would confirm the header does anything).

- **`middleware/blockAdminViewMutations.js`** (new) — mounted right after
  `resolveTenant`/`attachCostContext`, before every route. Returns 403 for
  any non-GET request when `req.isAdminView` is true. This is the actual
  read-only guarantee, deliberately a single blanket check rather than
  trusting every route file to remember `req.isAdminView` itself — new
  mutating routes added later are covered automatically.

- **`routes/adminWorlds.js`** (new) — `GET /api/admin/worlds`, allowlist-
  gated like `adminCost.js`. Returns every world's id, name, owner email,
  entry count (non-locked entries only), setup-completed status, and
  created date. Same all-rows-then-aggregate-in-JS approach as
  `adminCost.js`'s per-user breakdown — fine at beta scale, worth
  revisiting (RPC/pagination) once the tester list grows.

- **`archive/js/auth.js`** — new `getAdminViewWorld()` /
  `setAdminViewWorld()` / `clearAdminViewWorld()` (sessionStorage, not
  localStorage — deliberately resets when the tab closes rather than
  persisting into an admin's next normal session). `authFetch()` now:
  (1) attaches `X-Admin-View-World-Id` on every call while a view is
  active, and (2) client-side blocks any non-GET call with an alert
  ("Actions are disabled...") before it ever hits the network — a UX nicety,
  not the real boundary, since almost every mutating call in the app
  already routes through `authFetch` per its own existing header comment.
  `renderAuthStatus()` (already called on every page) now also calls the
  new `renderAdminViewBanner()`, which injects a sticky top banner with an
  "Exit view" link whenever a view is active, and adds
  `body.admin-view-mode` (see CSS section below) — no per-page HTML edits
  needed, it piggybacks on a function every page already calls.

- **`archive/admin.html`** — new "Browse Worlds" section below the
  existing cost summary: a table of every world (name, owner email, entry
  count, setup status, created date) with a **View** button per row.
  Clicking it sets the sessionStorage flag and redirects to
  `/index.html`, which then loads that world's real archive with the
  banner active.

## UI hiding of mutating controls

Reuses the exact CSS mechanism `css/style.css` already uses for the
account-level AI toggle (`body.ai-disabled` — see `render.js`'s
`applyAiEnabledGating()`):

- `js/auth.js`'s `renderAdminViewBanner()` adds `body.admin-view-mode` to
  every page (piggybacking on the same sessionStorage check that already
  renders the banner).
- `css/style.css`'s existing `body.ai-disabled` selector list (Fill In,
  Regenerate, Generate with AI, field-level Help Me, portrait/battle-map
  generate) now also matches `body.admin-view-mode`, hiding every
  AI-spend control while viewing someone else's world.
- Two more rules added for `body.admin-view-mode` specifically (not
  AI-gated, so not already covered by `ai-disabled`):
  `#delete-entry-btn` (dossier page) and `#gen-form` (the entire
  "+ Create Entry" panel — Generate with AI / Enter Manually / Roll
  Randomly / Cancel — on all 8 category index pages under
  `archive/{npcs,enemies,items,classes,logs,survivors,factions,
  locations}/index.html`).

**Still not hidden** (relies on the click-time alert + server 403):
Delete World (Settings), portrait/image upload, map pin drag-to-
reposition, and the Campaign Arcs/Modules builder pages (see below).

## Explicitly out of scope this round

- **No pagination/search on the worlds list.** Fine for a handful of beta
  testers; worth adding once the list is long enough to scroll through.
- **No audit log of what an admin viewed/when.** Not needed yet since this
  is read-only and single-admin; would matter more with a second admin.
- **Campaign Arcs / Campaign Modules builder pages** (`archive/campaigns/
  builder.html`, `archive/campaign-arcs/builder.html`) still show their
  own generate/save controls in admin view mode — these weren't covered
  by the CSS hiding pass since they're a distinct, more complex UI than
  the shared category-page/dossier pattern. The server-side 403 and the
  `authFetch` click-time alert still block any real mutation there; it's
  a UX gap only, not a safety gap. Worth a follow-up pass if it comes up.

## Cache-busting

`auth.js` and `css/style.css` both changed. `auth.js` is in
`scripts/bump-cache-version.js`'s `CACHE_BUSTED_SCRIPTS` list — bumped
`lib/version.js`'s `APP_VERSION` from `v0.16` → `v0.17` and every
`?v=v0.16` query param to `?v=v0.17` by hand (the bump script itself
still can't run — missing `glob` dependency, noted in an earlier
session). This pass also caught and fixed a real gap in the *first*
version of this change: the 8 category index pages
(`archive/{category}/index.html`) and the 2 campaign builder pages also
load `auth.js` with a version query param and were missed in the first
bump — a browser with any of those pages cached would have kept serving
the old `authFetch()` without the admin-view header/block logic.
`css/style.css` isn't part of the cache-busted script list (no `?v=` on
its `<link>` tag anywhere) — not touched, not this session's problem to
fix.

## Testing before deploy

1. Log in as `ausfarr@gmail.com`, go to `/admin.html` — confirm the new
   "Browse Worlds" table loads and lists every tester's world.
2. Click **View** on a world that isn't your own — confirm the banner
   appears on `index.html`, the archive shows that world's real entries,
   the "+ Create Entry" panel and any dossier's "Delete This Entry"
   button are gone, and anything else you click shows the alert instead
   of doing anything.
3. Confirm a direct `curl` with a forged `X-Admin-View-World-Id` header
   but a non-admin's JWT is ignored (still resolves to that user's own
   world, header has no effect).
4. Click **Exit view** — confirm it clears the banner and returns to
   `/admin.html` with your own world back to normal on next navigation.
5. Confirm a non-admin never sees `/admin.html`'s content (should still
   403 as before — unchanged).
