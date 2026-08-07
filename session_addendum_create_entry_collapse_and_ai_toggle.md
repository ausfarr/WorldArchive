# Session Addendum — "Create Entry" Collapse + Account-Level AI Toggle

Two independently-scoped changes shipped together this session. Full
decision record; `CHANGELOG.md`'s `## Unreleased` entry is the scannable
summary.

## Change 1 — "Create Entry" staged reveal

### What shipped

Each of the 8 category index pages (`archive/{factions,npcs,enemies,
classes,items,logs,survivors,locations}/index.html`) had its `.sheet`
panel showing three things at once: the category-specific AI form
(`#gen-form`'s fields + its own-labeled submit button), a
"+ Create Manually" button, and a "Generate Procedurally" button — all
injected/visible simultaneously. Collapsed into a staged reveal:

- **Stage 0** (default): just "+ Create Entry".
- **Stage 1** (click Stage 0): "Generate with AI" / "Enter Manually" /
  "Roll Randomly" (renamed from "+ Create Manually" / "Generate
  Procedurally" per the locked labels) plus a Cancel/✕ back to Stage 0.
  "Enter Manually" and "Roll Randomly" fire immediately — no Stage 2
  needed, since neither takes form input first.
- **Stage 2** (click "Generate with AI" only): reveals the category's
  own AI fields + its existing submit button, replacing Stage 1's row
  rather than stacking under it. Submits through the exact same
  `#gen-form` handler, same endpoint, untouched.

**Follow-up (post-review, confirmed with Austin):** Stage 2's submit
button label was renamed from category-specific ("Generate NPC",
"Generate Enemy", "Generate Faction", "Generate Class", "Generate Item",
"Generate Log", "Generate PC", "Generate Location") to a plain
"Generate" on all 8 pages — both the button's initial HTML text and the
`btn.textContent = '...'` reset in each page's own submit handler's
`finally` block (the `'Generating…'` in-flight state is untouched). Two
lines changed per page. No behavior change — same handler, same
endpoint, same everything else.

### How it's implemented

Per the scoping doc's plan: mechanical, identical edit on all 8 pages
(wrap the existing field `<div>`s in `<div id="gen-form-fields">`,
between `<form id="gen-form">`'s opening tag and the submit button) plus
one new centralized function in `archive/js/render.js`,
`wireCreateEntryCollapse()`, that builds/wires the three stages and is
called from each page's init block in place of the old
`wireManualCreateButton(); wireProceduralGenerateButton();` pair.

`wireManualCreateButton()`/`wireProceduralGenerateButton()` (the two
button-injecting functions) no longer exist as standalone wiring — their
click-handler bodies were extracted to plain named functions,
`handleManualCreateClick(category)` and
`handleProceduralGenerateClick(btn, category)`, callable directly.
`wireCreateEntryCollapse()`'s Stage 1 "Enter Manually"/"Roll Randomly"
buttons call these directly; nothing about the underlying
fetch/redirect/overlay logic changed.

Verified (headless Chromium against a fixture harness loading the real
`render.js`, since full in-browser testing needs a live Supabase session
this sandbox doesn't have — see Testing below): Stage 0 → 1 → 2
transitions, Cancel back to Stage 0, "Enter Manually" opening the real
edit overlay via `EDIT_FORM_BUILDERS`, and the Stage 2 submit button
text/behavior staying untouched.

### Resolved: Stage 2 submit button label

Flagged as an open question rather than decided silently — Austin
confirmed: rename it. See the Follow-up note above.

## Change 2 — Account-level "AI features" toggle

### Scope (locked, confirmed against the real repo)

Disabling AI turns off, server-side AND client-side:
- The category-tab AI generation path (Stage 2 above / `#gen-form`
  submit) — all 8 `/generate-X` routes.
- Fill In and Regenerate. **Repo correction:** these buttons don't
  actually live on the dossier page itself (dossier.html has no edit/
  fill/regen UI of its own today) — they're rendered on the *category
  index* grid cards (`buildEntryCardHtml()` in `render.js`, classes
  `.fill-in-btn`/`.regen-btn`). Gated the same way regardless of where
  they render.
- The ✨ Help Me field-assist button (`.field-assist-btn`, built in
  `efField()` and reused across every bespoke edit form).
- Generate Image on portrait slots (`portraitActions.js`'s `genBtn`) —
  given a new `ai-action` class, distinct from Upload's
  `portrait-action-btn`, so it can be targeted without touching Upload.

**Explicitly out of scope this pass** (per Austin's instruction — noted,
not silently included or skipped):
- Wizard AI steps (faction generation, lore compose/import, style guide
  colors) — still fire regardless of the toggle.
- Campaign Module AI generation / "Generate one" for unmatched slots.
- World Mood Board / Faction Banner art generation.

All three still spend real Claude/Gemini calls with AI turned off. Flag
for a follow-up pass if Austin wants full coverage.

### Server-side enforcement

- `migrations/016_ai_toggle.sql` — new `user_settings` table, one row
  per `user_id` (not `world_id` — same rationale as `subscriptions`/
  `credit_ledger` in `012_billing.sql`: survives a future multi-world
  feature), `ai_enabled boolean not null default true`.
  **PENDING — Austin still needs to run this by hand against Supabase**,
  same as `015_field_assist_points.sql` before it (also still pending as
  of this session).
- `lib/userSettingsRepo.js` — `getOrCreateUserSettings` follows
  `worldConfigRepo.getOrCreateWorldConfig`'s exact race-safe
  select → insert → re-select-on-`23505` pattern. `getAiEnabled`/
  `setAiEnabled` wrap it.
- `middleware/requireAiEnabled.js` — 403s with
  `{ error: "ai_disabled", message: "AI features are turned off for
  this account -- enable them in Settings to use this." }` when off.
  Wired as the **first** middleware (before `enforceGenerationCap`/
  `enforceEntryCapOnGenerate`) on all 8 `/generate-X` routes,
  `/field-assist`, and `/entries/:category/:id/generate-image` — same
  insertion point/ordering convention those two already used. **Not**
  applied to `/confirm-entry`, `/generate-procedural`, or
  `/entries/:category/:id/upload-image` — those have no AI spend and
  must keep working with AI off (verified: Roll Randomly and Upload
  both skip this middleware entirely).
- `routes/billing.js` — `/billing/status` (the existing account-status
  endpoint Settings already reads) gained an `aiEnabled` field on all
  three response branches (beta/trial/subscribed). New
  `PATCH /api/settings/ai-toggle` (body: `{ aiEnabled: boolean }`) flips
  it via `setAiEnabled`.

### Client-side gating

CSS-driven rather than per-element JS, so it applies uniformly to
controls that exist at page-load time AND ones rendered later (entry
cards, edit overlays) without re-running anything after each re-render:

- `archive/js/render.js`: `getAiEnabledStatus()` — a memoized fetch
  against `/api/billing/status` (reusing the same endpoint/response
  Settings already polls, per the "don't add a second redundant call"
  instruction — this repo had no *existing* global billing-status fetch
  on every page to literally reuse, so the implementation is: extend the
  one account-status endpoint that already existed for this purpose, and
  call it once per page). `applyAiEnabledGating()` adds
  `body.ai-disabled` when the account has AI off.
- `archive/css/style.css`: `body.ai-disabled .ai-generate-entry-btn,
  .field-assist-btn, .regen-btn, .fill-in-btn, .ai-action { display:
  none !important; }`.
- `applyAiEnabledGating()` is called from all 8 category index pages'
  init blocks and from `dossier.html`'s (for portrait Generate).
  `settings.html` doesn't need it — its only AI-adjacent control is the
  toggle itself, populated from the same `/billing/status` payload
  `loadUsage()` already fetches (`wireAiEnabledToggle(data.aiEnabled)`),
  no extra call.
- `archive/settings.html` — new "AI Features" `<h2>` section, same
  visual pattern as "Billing & Usage"/"Export", single checkbox, on by
  default, PATCHes `/api/settings/ai-toggle` on change with an
  optimistic-then-verified update (reverts the checkbox on failure).

## Testing performed

- `node -c` on every changed/new `.js` file (all pass).
- Full server boot with fake env vars
  (`SUPABASE_URL`/`SUPABASE_SECRET_KEY`/`SUPABASE_PUBLISHABLE_KEY`/
  `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`STRIPE_SECRET_KEY` all fake) —
  boots clean, `/config.js` returns 200, an unauthenticated
  `POST /api/generate-npc` correctly 401s at `resolveTenant` before ever
  reaching `requireAiEnabled` (proves the middleware chain is wired, not
  that it 403s — a real Supabase project is needed to exercise the
  actual AI-off 403 path end-to-end; flagging this as unverified against
  a live DB).
- Headless Chromium (puppeteer-core, pre-installed Chromium at
  `/opt/pw-browsers`) against a fixture HTML harness loading the real
  `render.js`/`portraitActions.js`/`style.css` unmodified (this sandbox
  has no real Supabase project to log into, so full in-app browser
  testing wasn't possible — this is the closest practical substitute):
  confirmed Stage 0/1/2 transitions and Cancel; confirmed "Enter
  Manually" opens the real `EDIT_FORM_BUILDERS` overlay with its ✨ Help
  Me buttons intact; confirmed `body.ai-disabled` hides
  `.field-assist-btn`, the Stage 1 "Generate with AI" button, `.regen-btn`
  (on a card built via the real `buildEntryCardHtml()`), and the
  portrait `.ai-action` Generate button, while `.edit-btn`, "Enter
  Manually", and the portrait Upload label all stay visible.
- Mentally checked `getOrCreateUserSettings` against
  `getOrCreateWorldConfig`'s pattern — select → insert → `23505` →
  re-select — matches exactly, just re-keyed to `user_id`/
  `user_settings`.
- `node scripts/bump-cache-version.js v0.13` — ran clean, no `glob`
  issue. **Correction to the brief:** the script's actual implementation
  (per its own header comment) already does a plain `fs.readdirSync`
  scan specifically *because* "this repo doesn't have [glob] installed
  and it's not worth adding just for a one-off helper script" — it
  doesn't import `glob` at all. The "known issue" flagged in the task
  brief doesn't reproduce against the current repo state; ran the real
  script rather than hand-bumping. `lib/version.js` → `v0.13`, 26 script
  tags updated across 24 HTML files.

## Deliberately not touched

Per instructions: `/api/generate-procedural`, `/api/confirm-entry`,
`buildBlankEntryStub`, `generateManualEntryId`, and no backend route
logic beyond the new `requireAiEnabled` gate insertions.
