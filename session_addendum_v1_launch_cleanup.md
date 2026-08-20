# Session Addendum: v1.0.0 Launch Cleanup (shipped)

Built on branch `claude/v1-launch-cleanup-4a8obz`, one commit per phase.
This was a copy/UI cleanup session, not a feature build — no new
functionality, just removing beta-era language and correcting copy to
describe what's actually live now that `BILLING_ENABLED` is being
flipped to `true`.

## ⚠️ MUST RUN BY HAND BEFORE MERGING

**`migrations/025_fix_monthly_quota_units.sql` needs to be run against
the live Supabase project before this is fully correct in
production.** No migration runner exists in this project (per
`CLAUDE.md`) — apply it by hand via the Supabase SQL editor or CLI,
same as every other file in `migrations/`.

## Phase 1 — Verification result

Queried the live `plans` table directly via the Supabase MCP tools
(project `urtixpjyhhqcpzypvbni`, `select * from plans where id =
'chronicled_monthly'`) before writing any marketing copy, per this
session's explicit instructions.

**Finding: `monthly_quota` was wrong, but not in the way the session
prompt anticipated.** The prompt's hypothesis was that the row might
still hold the original buggy `25` (raw generations, never converted to
points). That wasn't it — `migrations/015_field_assist_points.sql`'s
`update plans set monthly_quota = monthly_quota * 5` had clearly already
run at some point (25 → 125, correctly matching `GENERATION_CAP` in
`lib/worldConfigRepo.js`, which made the same 25→125 move for the legacy
cap). But the live value was **1250**, not 125 — a further, unexplained
10x on top of the already-correct migration-015 backfill. No migration
file between 015 and 024 touches `monthly_quota` at all, so this wasn't
a code/migration bug — most likely a manual edit against the live DB at
some point, with the wrong multiplier. Net effect if left as-is: a
$5/mo subscriber's quota would read as 250 generations/month instead of
the intended 25.

`migrations/025_fix_monthly_quota_units.sql` sets it directly to the
verified-correct `125` (rather than another relative multiply, since the
exact provenance/multiplier that produced 1250 isn't known — see that
file's own header for the full reasoning). `subscriptions` had zero rows
(no real subscribers yet), so this had no user-facing impact yet, but
would have as soon as the first real subscriber signed up.

Every other number used in Phase 3 copy was confirmed directly against
code (not from memory, per instructions):

| Number | Value | Source |
|---|---|---|
| Trial cap | 10 generations (50 points) | `lib/billingRepo.js`'s `TRIAL_CAP = 50` |
| Legacy/subscriber generation unit | 5 points = 1 generation | `lib/worldConfigRepo.js`'s `POINTS_PER_GENERATION = 5` |
| Subscription quota | 25 generations/month (125 points) | live `plans` row, corrected per above |
| Credit pack | 5 generations per $2 unit | `routes/stripeWebhook.js`'s `CREDITS_PER_PACK_UNIT = 5` |
| Free entry cap | 30 entries/world | `lib/worldConfigRepo.js`'s `FREE_ENTRY_CAP = 30` |
| Entry pack | 25 entries per $5 unit | `routes/stripeWebhook.js`'s `ENTRIES_PER_PACK_UNIT = 25` |
| Entries unlimited while subscribed | confirmed | `middleware/enforceEntryCap.js` — `unlimited` only when `subscription.status === "active"` |
| Lapsed-subscription behavior | quota → 0, credits stay spendable, entries revert to capped | `routes/stripeWebhook.js` header comment + `migrations/015`'s `check_and_spend_subscription_generation` (non-active status forces `v_quota := 0`) + `enforceEntryCap.js` |

The $5/month and $2 / $5 dollar figures themselves come from Stripe
Price objects (`stripe_price_id` on the `plans` row, `STRIPE_CREDIT_PRICE_ID`,
`STRIPE_ENTRY_PACK_PRICE_ID` env vars) — not independently re-derived
against the Stripe API this session, taken as given from the task
description since they matched every other confirmed number's shape.

## Phase 2 — Beta framing removed

**Footer pattern** — every `archive/*.html` and `marketing/*.html` page
had an inline script appending `' · beta'` to `window.APP_VERSION`, plus
a static fallback `v0.7 · beta` span for pre-JS render. Grepped instead
of trusting the task's "15 files" estimate — found **25** archive pages
and **8** marketing pages with the pattern (`archive/campaign-arcs/`,
`archive/campaigns/`, and `archive/spells/`, `archive/survivors/`,
`archive/logs/`, `archive/licenses.html`, `archive/admin.html` weren't
in the original count). Fixed all of them via `sed`, both the static
span and the JS override.

**Substantive marketing copy rewrites:**
- `marketing/index.html` — dropped "FREE BETA" eyebrow, pointed the nav
  CTA, hero CTA, and final-CTA section directly at
  `https://app.chronicled.world/login.html?mode=signup` ("Sign Up"),
  removed the waitlist email-capture form from the primary CTA path
  entirely, rewrote the status line and origin-story closing line.
- `marketing/compare.html` — same CTA fix, "Beta Access" → "Get
  Started", beta-status line rewritten.
- `marketing/pricing.html` — full rewrite. Was "we're in beta, billing
  is built but off"; now describes the live trial/subscription/credits
  tiers with real numbers, plus **a new Entries section this page never
  had before** (30 free/world, $5 per 25-pack) — the task flagged this
  page previously never mentioned entries at all, confirmed true.
  FAQ items rewritten to match (subscribe-carries-over, price-could-
  change, what-happens-at-trial-limit, one-world-per-account).
- `marketing/terms.html` — §2/§3 rewritten from "beta, billing not
  active" to the real terms: subscription/credit/entry-pack billing,
  Stripe self-serve cancellation, and what happens to quota/entries/
  credits if a subscription lapses (quota → 0, entries stop being
  unlimited, nothing already created is touched, credits/entries never
  expire) — sourced from `routes/stripeWebhook.js`'s header comment and
  `enforceEntryCap.js`, not invented.
- `marketing/privacy.html` — the "Usage data" table row and two "once
  billing is switched on" mentions rewritten to describe what's actually
  tracked/active now.
- `marketing/roadmap.html` — footer only, no substantive beta copy found
  in the body.
- `marketing/js/waitlist-form.js` + `routes/waitlist.js` — **left
  untouched**, per instructions (the backend route is also used by the
  itch.io listing per its own header comment). Only the primary-CTA
  wiring in `index.html`/`compare.html` was removed; nothing about the
  waitlist feature itself changed.

**Deliberately left alone** (not in scope, and inert once
`BILLING_ENABLED=true`): `archive/settings.html`'s `data.state ===
"beta"` branch and `routes/billing.js`'s `state: "beta"` API value are
an internal billing-status enum, not user-facing copy — that branch only
fires when `BILLING_ENABLED` is false, so it's dead code once the flag
flips, not something users will ever see. Also left alone:
`archive/js/render.js`'s `BETA_FEEDBACK_FORM_URL` variable/comments
(the user-visible text it renders, "Got 2 minutes for a quick feedback
form?", never says "beta") and the many internal `lib`/`routes`
developer-rationale comments that reference "beta" as historical
context (e.g. "Beta-period stopgap for not having real metering yet") —
per `CLAUDE.md`'s own convention of dense rationale comments, and
because the task scope was specifically user-facing copy, not every
internal comment that happens to contain the word.

## Phase 3 — Version bump

`lib/version.js` and `marketing/version.js` both bumped to `v1.0.0`
(kept in sync per their header comments). `scripts/bump-cache-version.js`
ran with no modification needed — despite the task's warning about a
missing `glob` dependency, this script already uses a plain `fs`
directory scan (no `glob` import at all); ran cleanly after `npm
install`, bumping 77 script tags across 27 `archive/*.html` files.

## Phase 4 — login.html signup deep-link

`archive/login.html` now checks `?mode=signup` in the URL on page load
and applies the exact same state change the existing toggle-button click
handler already had (extracted into a shared `applyMode(isSignup)`
function so there's one source of truth for the signup/signin UI state
instead of two copies). This is what every rewritten marketing CTA in
Phase 2 links to.

## Phase 5 — v1.0.0 changelog entries

`CHANGELOG.md`: the `## Unreleased` section already had substantial
content (internal bug fixes/doc corrections accumulated since v0.95,
not yet versioned) rather than being empty as assumed. Per this file's
own versioning note ("Public launch becomes `v1.0.0`"), folded that
existing content into a new `## v1.0.0 — 08/20/2026 — Public Launch`
entry, added new bullets on top for billing-live and the
`monthly_quota` fix, and left `## Unreleased` empty again above it,
matching the doc's stated convention. `v0.95`'s entry is untouched.

`marketing/changelog.html`: new public entry describing the live
trial/subscription/credits/entries in user terms — no "we left beta" or
"launch" framing as a milestone, just what the product does now.
Checked for duplication against v0.9 (Manual Mode) and v0.95 (5e
ruleset) — both already have their own public entries, nothing to
merge. Also dropped the "Currently in beta" status line and a stray
"for beta" qualifier on the historical v0.6 entry (both purely cosmetic,
didn't touch the historical accuracy of what shipped in v0.6).

## Phase 6 — Small cleanup

Deleted two stale TODO comments exactly as specified — both already had
real values set, just still carried a "swap this in" comment:
`middleware/enforceGenerationCap.js`'s `CONTACT_EMAIL` and
`archive/js/render.js`'s `BETA_FEEDBACK_FORM_URL`.

## Verification

- `npm install` + `node server.js` (with dummy `STRIPE_SECRET_KEY`,
  since this sandbox has no real one) boots cleanly; `GET /login.html`
  returns 200 and `GET /version.js` correctly reports `v1.0.0`.
- `node -c` syntax-checked every touched `.js` file.
- Repo-wide `grep -in beta` sweep after all phases confirms nothing
  user-facing remains except the deliberately-preserved internal state
  enum and comments noted above.
- Real Supabase access (via the Supabase MCP tools, not a network-blocked
  sandbox connection like prior sessions hit) worked directly for both
  the Phase 1 read and confirming `subscriptions` is empty — this is
  the actual finding that drove the Phase 1 migration, not a guess.

## Files touched

Migration: `migrations/025_fix_monthly_quota_units.sql` (new, must run
by hand).

Copy/UI: all 25 `archive/*.html` pages with the footer pattern, plus
`archive/login.html` (deep-link), `archive/js/render.js` (TODO
cleanup), `middleware/enforceGenerationCap.js` (TODO cleanup),
`marketing/index.html`, `marketing/compare.html`, `marketing/pricing.html`,
`marketing/terms.html`, `marketing/privacy.html`, `marketing/roadmap.html`,
`marketing/changelog.html`, `lib/version.js`, `marketing/version.js`.

Docs: `CHANGELOG.md`, this file.
