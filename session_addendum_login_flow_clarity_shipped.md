# Session addendum: Log in vs. Save-your-world clarity

Follow-on to `session_addendum_anonymous_access_shipped.md`.

## Problem
Since v1.1 every visitor holds an anonymous Supabase session, and
`login.html` hard-defaulted to "Save Your World". Returning users who only
wanted to log in landed on the wrong screen: marketing had no "Log in" link
(only "Start Now" -> app root -> anonymous session), the in-app nav showed
anonymous users only "Save Your World", and switching modes meant finding a
small text link.

## What changed
- **`archive/login.html`**: text toggle replaced by two tabs. Mode
  resolution: explicit `?mode=` wins; otherwise Save iff
  `anonymousSessionHasContent()`, else Log in. The page paints Log in
  immediately and switches once the check resolves. Title, h1, button and
  password `autocomplete` follow the tab. On Log in with an anonymous
  session that has content, a one-line warning ("Logging in switches you to
  your account...") and a "Save it first" link (switches to the Save tab).
- **OAuth** now follows the selected tab: `linkOAuthIdentity` only in Save
  mode with an anonymous session; `signInWithOAuth` in Log in mode (and as
  the existing no-session fallback in Save mode). The redirect target
  (`/login.html`, no mode) is unchanged: after either flow the user is
  permanent and the existing redirect-away check applies.
- **`archive/js/auth.js`**: `renderAuthStatus()` shows `Log in` then
  `Save your world` for anonymous sessions (explicit `?mode=` links). New
  `anonymousSessionHasContent()`.
- **Marketing**: `Log in` -> `https://app.chronicled.world/login.html?mode=signin`
  on index, pricing, compare, changelog, roadmap, scroll-test (nav) and
  privacy, terms (header, beside Back). `Start Now` stays the CTA where it
  existed (changelog/roadmap never had one). `style.css`'s mobile rule
  previously hid every nav link except the CTA; `.nav-login` is now exempt.
- Cache-busters bumped via `scripts/bump-cache-version.js v1.12`.

## Design notes
- **No new API route.** "Has content" reuses `GET /api/wizard/review`
  (`setupCompletedAt`) plus a parallel fan-out over
  `GET /api/entries/:category` for the 8 content categories, resolving true
  on the first non-locked entry. It only runs for anonymous sessions and
  any failure resolves false (Log in), so a broken check can never trap
  someone on the Save screen. Cost: up to 9 small GETs on a no-`mode`
  visit; links that pass `?mode=` still run it (for the warning) but don't
  depend on its result for the tab.
- `getPostLoginDestination()` and `authFetch()` untouched. Password reset,
  new providers and anonymous-by-default are out of scope and unchanged.

## Verification
Playwright with stubbed Supabase client and mocked `/api` responses
(real Supabase/Turnstile not reachable from the sandbox):
- anon + 0 entries / only locked entries / API failure / no session ->
  Log in; anon + 1 non-locked entry / setup complete -> Save.
- `?mode=signin` and `?mode=save` override; warning shows only on Log in
  with content; "Save it first" switches tab.
- OAuth: Save tab -> `linkIdentity`; Log in tab -> `signInWithOAuth`;
  switching tabs by click changes the call.
- No console errors, no horizontal scroll at 375px (login + marketing nav).
- **Not verified here (needs a manual run against real auth):** real
  account login from a fresh browser, the Start Now -> add entry -> nav ->
  Save flow end to end, and the permanent-account redirect (code path
  unchanged).
