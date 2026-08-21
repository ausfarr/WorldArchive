# Session addendum: pricing comparison table, OAuth, demo grounded in your own idea

Three independent, additive changes, prompted by a look at a competitor's
dense Free/Pro feature-comparison table and a question about whether
requiring signup is costing us conversions.

## 1. Pricing page: hybrid comparison table

`marketing/pricing.html` kept its existing `.tier-card` cards (they carry
the narrative/story) and gained a new table underneath, reusing
`marketing/compare.html`'s existing `.compare-table` /
`.compare-table-wrap` / `.compare-yes` CSS rather than writing new styles.

Important distinction from the competitor's table we were comparing
against: Chronicled doesn't have a permanent Free tier — it's **Free Trial
→ Subscription** (`lib/billingRepo.js`'s `TRIAL_CAP` = 50 points ≈ 10
generations, one-time, vs. the $5/mo subscription's 25/cycle). The new
table's two columns are `Free Trial` / `Subscription`, not `Free` / `Pro`.

Also: portraits are **not** separately metered in real billing —
`middleware/enforceGenerationCap.js` charges the same
`POINTS_PER_GENERATION` for a portrait as any text generation. The table
says so explicitly ("drawn from the same generation count above, not a
separate limit") rather than implying a per-category quota split we don't
actually have (unlike the demo below, which *does* split text vs. portrait
caps — see `lib/demoUsageRepo.js` — that split only exists in the demo, not
in real billing).

## 2. One-click OAuth on login/signup

`archive/js/auth.js` gained `signInWithOAuth(provider)`, a thin wrapper
around Supabase's `auth.signInWithOAuth()`. `archive/login.html` gained two
buttons (Google, Discord) alongside the existing email+password form —
additive, not a replacement, since some users will still prefer
email+password.

**This does not work yet in production** — it requires enabling the
Google and Discord providers in the Supabase project's Auth dashboard and
registering OAuth app credentials (client id/secret, redirect URI) with
each provider. That's a manual, non-code step outside this repo.

## 3. Demo: grounded in your own idea, not just a preset

The real gap in the existing `/api/demo` flow (`routes/demo.js`,
`lib/demoPresets.js`): it could only generate against one of 3 fixed genre
presets (High Fantasy / Sci-Fi-Cyberpunk / Post-Apocalyptic), which proves
generation *quality* but not Chronicled's actual differentiator —
generation grounded in *your own* world, not a generic template (see
`marketing/compare.html`'s "grounded, not generic" pitch).

Rather than building real anonymous rows in the `worlds` table (rejected —
`worlds.user_id` is `NOT NULL` + unique per `middleware/resolveTenant.js`'s
comments, and making it nullable brings RLS/cleanup/reassignment
complexity that's a lot for a trial feature), this extends the existing
demo infrastructure, unchanged in every way except:

- `archive/demo.html` gained a freeform `#custom-setting` textarea next to
  the genre-preset cards.
- `archive/js/demoGenerator.js`'s `handleGenerate()` sends `customSetting`
  instead of `preset` when the visitor typed something.
- `routes/demo.js`'s `/generate` route accepts an optional `customSetting`
  string (capped at `MAX_CUSTOM_SETTING_LENGTH` = 500 chars), wraps it as
  `Genre & tone: <text>` to match the exact shape
  `lib/demoPresets.js`'s fixed presets already provide, and falls back to
  the existing preset-key path when it's absent. `generateDemoNpc`/
  `generateDemoEnemy` needed zero changes — they only ever read
  `preset.settingContext`.
- Still nothing persisted server-side (no `worlds`/`entries` row, same
  IP-based cap via `lib/demoUsageRepo.js`) — session continuity across the
  demo's 2 free generations is purely client-side (the typed text just
  stays in the textarea).
- **Signup handoff:** `showSignupWall()` now stashes the visitor's typed
  setting in `sessionStorage` (`chronicled_demo_lore` key) right before
  showing the "Sign Up Free" CTA. `archive/wizard-lore.html`'s `init()`
  checks for that key (only when there's no already-saved lore for the
  account — that always wins) and, if present, switches to the existing
  "Import Existing" panel with the text prefilled, then clears the key so
  it can't reappear on a later visit. This is a straight reuse of the
  Import Existing path — no new save route.

## Verification

- `node scripts/testDemoUsage.js` — the existing IP-cap test — couldn't be
  run against live Supabase in this session's sandbox (network egress not
  allowlisted for the Supabase host here); this is an environment
  limitation, not something the change touched. Manually verified the new
  `customSetting` wiring with a scratch script that mocks
  `lib/demoUsageRepo.js` and the Claude call, confirming: (a) a
  `customSetting` request's system prompt actually contains the visitor's
  typed text, (b) the existing `preset` request path is untouched, (c) a
  request with neither still 400s as before.
- Pricing table and login page changes are static HTML/CSS — reviewed by
  reading the rendered output; not yet checked in an actual browser this
  session.
- Cache-busting version bumped to `v1.0.1` via
  `node scripts/bump-cache-version.js v1.0.1` (touches `auth.js` and
  `demoGenerator.js`, both changed here).
