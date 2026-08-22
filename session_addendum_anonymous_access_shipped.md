# Session addendum: anonymous-by-default access

Follow-on to `session_addendum_split_quotas_and_regenerate_gate.md`
(previous round, same session). Austin's follow-up: instead of a separate
no-account "demo" bolted onto the side, make the Free tier itself work
with no account at all — the whole real app, not a sandbox. An account
(email/password or OAuth) is only required the moment someone wants to
pay: subscribe, buy credits, or buy an entry pack.

## Key technical fact this relies on

Supabase's anonymous auth (`supabase.auth.signInAnonymously()`) issues a
completely real session/JWT/user id — not a fake client-side-only thing.
`middleware/resolveTenant.js` (verifies any Supabase JWT via
`supabase.auth.getUser()`, gets-or-creates a `worlds` row keyed by that
user id) needed **zero changes**. An anonymous visitor gets a real
`worldId`, real persisted `entries`, and the free-tier quota logic from
last round (`FREE_MONTHLY_GENERATION_CAP`/`FREE_MONTHLY_IMAGE_CAP` in
`middleware/enforceGenerationCap.js`) applies identically, since it only
ever checks "is there a subscriptions row" — equally false for an
anonymous user or a real-email free user.

The one shared choke point every authenticated page already funnels
through, `archive/js/auth.js#requireAuth()`, is the only place that
needed to change. Because every page (`wizard*.html`, `dossier.html`,
every category index, `settings.html`, `map.html`, etc.) already calls it
in its own `init()`, this one change made the whole app anonymous-capable
with zero other page-level edits.

## What changed

**`archive/js/auth.js`**
- `requireAuth()`: when there's no session, calls
  `supabase.auth.signInAnonymously()` (Turnstile-guarded, see below)
  instead of redirecting to `/login.html`. `authFetch()`'s existing
  fallback (redirect to login on a missing/expired session) is
  **deliberately untouched** — that path fires on session *expiry*
  mid-use, not first visit, and silently minting a fresh anonymous
  session there would risk quietly dropping a real subscriber into a
  brand-new empty anonymous world on token expiry.
- New `upgradeAnonymousAccount(email, password)` — calls
  `supabase.auth.updateUser({ email, password })`, Supabase's documented
  anonymous-to-permanent upgrade path. Converts the SAME user id/world in
  place, unlike `signUp()` (which creates an unrelated second account).
- New `linkOAuthIdentity(provider)` — calls `supabase.auth.linkIdentity()`,
  same in-place-upgrade reasoning, distinct from `signInWithOAuth()`
  (which starts a brand-new identity/session).
- `renderAuthStatus()`: an anonymous session now renders "Save Your
  World" (linking to `login.html`) instead of an email + Sign Out link —
  showing "Sign Out" for an anonymous session would be a data-loss trap
  (there's no credential to sign back in with; signing out just abandons
  that world).
- New Turnstile helpers (`loadTurnstileScript`, `getTurnstileToken`) —
  see "Abuse prevention" below.

**`server.js`**
- `/config.js` now also exposes `window.TURNSTILE_CONFIG = { siteKey }`
  from `process.env.TURNSTILE_SITE_KEY`, same "safe to expose
  client-side" pattern as the existing Supabase publishable key (it's the
  public site key, not the secret).
- Unmounted and removed the `routes/demo` require/mount entirely (see
  "Demo removal" below).
- Trimmed the `trust proxy` comment's dangling reference to
  `routes/demo.js`'s per-IP rate limiting (that file no longer exists);
  kept the rest of that comment's bug-fix history intact.

**`archive/index.html`**
- Removed the demo-era special case that redirected signed-out visitors
  to `/demo.html` instead of calling `requireAuth()`. Reverted to the
  exact same `requireAuth()` + `getPostLoginDestination()` pattern every
  other page already uses.

**`archive/login.html`**
- Reframed from "the mandatory gate to enter the app" to "save your
  progress or log into an existing account." Default mode renamed
  `signup`→`save`; "Save" mode calls `upgradeAnonymousAccount()` when the
  current session is anonymous (the common case), or falls back to plain
  `signUp()` if there's somehow no session at all yet (e.g. cleared
  storage before ever loading another page).
- **Bug caught and fixed during this same round:** the static HTML
  defaults (title "Log In", button "Log In") were left over from the old
  `signin`-default behavior, out of sync with the new JS default of
  `save` — `applyMode()` was previously only invoked on toggle-click or
  behind the old `?mode=signup` check, so a fresh page load showed
  mismatched copy (title said "Log In" while the mode variable said
  `save`, meaning a submit would silently run the wrong branch relative
  to what the button appeared to say). Fixed by calling
  `applyMode(mode === "save")` unconditionally on load, and updated the
  static markup to match the new default directly (belt-and-suspenders
  against the pre-JS flash).
- OAuth buttons: `handleOAuthClick()` now checks session anonymity at
  click time and calls `linkOAuthIdentity()` vs `signInWithOAuth()`
  accordingly.
- Bottom "already logged in, skip this page" check now excludes
  anonymous sessions (`!session.user.is_anonymous`) — an anonymous
  visitor should still see the save/upgrade form, not get redirected away
  from the one page that lets them secure it.
- Removed the "Try it without an account first" link (the whole app is
  that now).

**`routes/billing.js`**
- New shared `requireRealEmail(req, res)` guard, called at the top of all
  three checkout routes (`checkout/subscribe`, `checkout/credits`,
  `checkout/entries`) — an anonymous Supabase user has no email
  (`req.userEmail` undefined), and Stripe Checkout needs a real one.
  Returns a 400 with a clear "add an email first" message rather than
  letting Stripe's own API reject an incomplete request.

## Demo removal

Fully superseded, not just deprecated — an anonymous visitor now gets the
REAL wizard/generation pipeline grounded in whatever they actually type,
with real persistence, strictly better than the demo's canned-preset,
nothing-saved sandbox. Deleted: `routes/demo.js`, `lib/demoPresets.js`,
`lib/demoUsageRepo.js`, `archive/demo.html`, `archive/js/demoGenerator.js`,
`scripts/testDemoUsage.js`. Also cleaned up dangling references:
- `archive/wizard-lore.html`'s `chronicled_demo_lore` sessionStorage
  handoff (built specifically to bridge the old demo into the wizard —
  nothing to bridge from anymore).
- `lib/rulesets/5e/homebrewEnemyGenerator.js`'s
  `generateHomebrew5eEnemy()` had four override params
  (`settingContextOverride`/`factionOptionsTextOverride`/
  `loreContextOverride`/`rosterOverride`) added specifically for the demo
  route's `worldId: null` call pattern. Verified via grep that all three
  real call sites (`routes/generateEnemy.js`, `routes/npcCombatant.js`,
  `lib/campaignEntryGenerators.js`) always pass a real `worldId` and never
  pass these overrides, so removed them rather than leaving dead
  parameterization.
- `scripts/bump-cache-version.js`'s `CACHE_BUSTED_SCRIPTS` list dropped
  `"demoGenerator"`.
- `migrations/027_demo_usage.sql`'s `demo_usage` table is left in the DB,
  unused — migrations are additive/historical per repo convention, not
  something a later migration retroactively edits or drops.

## Abuse prevention: Cloudflare Turnstile

`signInAnonymously()` has zero friction (no email, no verification) — a
scripted actor could loop it to farm unlimited free-tier allowances.
Discussed and rejected a per-IP creation-cap-only approach (weaker —
bypassable by IP rotation, and risks false-positive-blocking real users
behind shared/CGNAT IPs) in favor of Cloudflare Turnstile, which stops the
signup attempt itself and runs invisibly for the large majority of real
visitors.

Implementation: rather than adding the Turnstile script + a widget `<div>`
to every one of the ~25 pages that call `requireAuth()`, Turnstile is
loaded dynamically from within `requireAuth()` itself, only at the moment
it actually needs to mint a new anonymous session — injects the script
tag if not already present, renders an off-screen (not `display:none` —
Turnstile needs to actually render to run its checks) widget, resolves
its callback token, and passes it as
`signInAnonymously({ options: { captchaToken } })`. A missing site key
(local dev, or before Austin finishes the manual setup below) just means
no client-side token is sent — Supabase's own dashboard-side CAPTCHA
requirement, once enabled, is the real enforcement point, so this never
silently bypasses protection.

**Manual steps still needed (cannot be done from this repo):**
1. Create a free Turnstile site in the Cloudflare dashboard → get a Site
   Key + Secret Key.
2. Set `TURNSTILE_SITE_KEY` (the Site Key) as an env var on the server.
3. In the Supabase dashboard (Authentication → Attack Protection), enable
   CAPTCHA protection, select Turnstile, paste the Secret Key.

## Consequence surfaced in copy

An anonymous visitor who clears browser storage or switches
devices/browsers loses access to that world permanently — no
email/password exists yet to sign back in with. `login.html`'s "Save
Your World" framing and a new paragraph in `marketing/terms.html`'s
Accounts section both call this out explicitly, independent of ever
paying.

## Verification

- All touched backend files pass `node --check`; all touched HTML files'
  inline `<script>` blocks extracted and passed `node --check` too.
- Could not exercise real Supabase anonymous auth or Turnstile from this
  sandbox (no network egress to Supabase, and Turnstile requires Austin's
  own Cloudflare site + Supabase dashboard config first per the manual
  steps above) — this is a code-review-level verification only. Still
  needed once configured: confirm a brand-new visitor gets a silent
  anonymous session and lands in the wizard with a real, persisted world;
  confirm the free monthly cap still triggers identically for anonymous
  vs. real-email free accounts; confirm the upgrade path (adding an
  email from an anonymous session) preserves the same world/entries
  rather than starting a fresh one; confirm the three checkout routes
  correctly reject an anonymous account with no email.
- Grepped the whole repo post-deletion for every removed file's name/path
  and confirmed no live code (only historical addendum docs and the
  intentionally-kept `027_demo_usage.sql` migration) still references any
  of them.
