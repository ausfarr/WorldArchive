# Session Addendum — Map Backdrop No Longer Auto-Generates

## The bug

The Map tab (`archive/map.html`) auto-triggered an AI image generation
(`POST /api/map/generate-backdrop`) on page load, unconditionally,
whenever no backdrop existed yet for the world -- with zero regard for
the account-level AI Features toggle (Settings > AI Features,
`migrations/016_ai_toggle.sql`). An account with AI turned off (Manual
Mode) would still burn a real Gemini image generation just by opening
the Map tab, and `POST /api/map/generate-backdrop` had no
`requireAiEnabled` guard either, so there was no server-side backstop.

Every other AI image in the app (portraits, dungeon/battle maps) only
generates on an explicit button click. The map backdrop was the one
exception.

## The fix

**Frontend — `archive/map.html`:**
- Removed the auto-POST entirely. `loadAndRenderMap()` now just checks
  `GET /api/map/backdrop`; if none exists, it shows a new empty state
  (`#map-backdrop-empty`, styled like the Location dossier's battle-map
  empty state) instead of the Leaflet canvas, and returns -- no AI call
  fires on page load, ever.
- The empty state has a **Generate Backdrop** button
  (`#generate-backdrop-btn`, class `bm-btn ai-action`) that calls the
  same `POST /api/map/generate-backdrop` endpoint on click, then
  re-runs `loadAndRenderMap()` on success. `.ai-action` is the existing
  class `css/style.css`'s `body.ai-disabled` rule hides -- so this
  button disappears entirely for AI-off accounts, same as ✨ Help Me,
  Regenerate, and portrait Generate elsewhere.
- **Upload Custom Map** (already existed in the toolbar above the map)
  is unchanged and still always available -- it doesn't spend an AI
  call, so it's not gated.
- Added the missing `applyAiEnabledGating()` call on page load. Map.html
  never called this before, so `body.ai-disabled` was never being set
  on this page at all -- the new Generate Backdrop button wouldn't have
  hidden itself for AI-off accounts without this.

**Backend — `routes/map.js`:**
- Added `requireAiEnabled` middleware to `POST /map/generate-backdrop`,
  matching every other AI-spend route. This is the real enforcement;
  the frontend class-hiding is just the UX nicety. Comment above the
  route updated to explain why (previously explained only why it wasn't
  gated by `enforceGenerationCap`, which is still correct and
  unchanged -- this endpoint is at-most-once per world either way,
  `mapBackdropExists` still short-circuits a repeat call).

## Not changed

- `enforceGenerationCap` is still deliberately NOT applied to this
  route (same reasoning as before -- bounded, at-most-once setup cost,
  not the open-ended per-action risk the cap exists to bound).
- `POST /map/upload-backdrop` -- already had no AI-gating need and none
  added.
- No cache-version bump needed -- only `archive/map.html`'s inline
  script and `routes/map.js` (server-side) changed; neither is one of
  the three files `scripts/bump-cache-version.js` cache-busts
  (`render.js`, `mapLayout.js`, `portraitActions.js`).

## Files touched

- `archive/map.html`
- `routes/map.js`

## To verify after deploy

1. **AI off (Settings > AI Features > off):** open Map tab on a world
   with no backdrop yet. Confirm no network call to
   `/api/map/generate-backdrop` fires, the empty state shows, and
   **Generate Backdrop is not visible** -- only the note text and
   Upload Custom Map (in the toolbar above) are.
2. **AI on:** same world/tab. Confirm no auto-call on load either --
   empty state shows, Generate Backdrop **is** visible, and clicking it
   generates the backdrop and then renders the full interactive map.
3. **Direct API call while AI is off** (e.g. curl/Postman POST to
   `/api/map/generate-backdrop`): confirm a 403 with
   `{ "error": "ai_disabled", ... }`, same as any other generate route.
4. Existing worlds that already have a backdrop: confirm the Map tab
   still loads and renders exactly as before -- this only changes
   behavior for worlds with no backdrop yet.
