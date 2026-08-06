# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Chronicled** (repo name `worldarchive`, package name `chronicled`) is an automated worldbuilding content pipeline for tabletop RPGs: a guided setup wizard takes a user through lore, factions, a stat system, a visual style guide, and category labeling, then generates lore-consistent content (NPCs, monsters, items, factions, locations, etc.) grounded in that world's own data — not a fixed template. Content is auto-filed into a live, per-user browsable wiki ("the Archive"). Live at chronicled.world. Status: private beta, multi-tenant (one world per user).

See `README.md` for the feature list and `CHANGELOG.md` for full version history (reverse-chronological; each entry links to a `session_addendum_*.md` file with full architectural detail for that change).

## Commands

```
npm install       # install dependencies
npm start          # node server.js — runs the whole app, no build step
```

There is no lint script, no test script, and no bundler/build step — the frontend (`archive/`, `marketing/`) is plain HTML/CSS/JS served statically, no templating or compilation.

**Database migrations** — no migration runner. Apply every file in `migrations/*.sql` against the Supabase project by hand, in numeric filename order (via the Supabase SQL editor or CLI), whenever pulling in schema changes.

**"Tests"** are standalone Node scripts in `scripts/`, run directly and read individually to see what they check — there's no test runner or `npm test`:
- `node scripts/testTenantIsolation.js` — exercises real Supabase (needs `SUPABASE_URL`/`SUPABASE_SECRET_KEY`); creates and cleans up its own throwaway users; safe to run against the real project.
- `node scripts/testPipeline.js` / `testPipelineGemini.js` / `testPipelineHybrid.js` / `testEnemyPipeline.js` — mock `global.fetch` for the Anthropic/Gemini calls, so they run without real API keys or a DB; check generation logic end-to-end offline.
- `node scripts/compareTextModels.js` — real API calls comparing content models (backs the `/api/debug/compare-text-models` route and the `CONTENT_MODEL` default decision noted in `lib/claude.js`).

**Version bump when shipping a UI-affecting change:** `node scripts/bump-cache-version.js vX.Y` bumps `lib/version.js`'s `APP_VERSION` *and* the `?v=...` cache-busting query params on `render.js`/`mapLayout.js`/`portraitActions.js` `<script>` tags across every `archive/*.html` page in one shot (there's no build step to do this automatically). `marketing/version.js` is a separate static-site version stamp kept in sync by hand when cutting a release.

## Environment variables

Required: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (service-role key — the backend's only Supabase client, bypasses RLS), `SUPABASE_PUBLISHABLE_KEY` (anon key, exposed to the browser via `/config.js`), `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (or `IMAGEGEN_API_KEY`/`IMAGEGEN_API_URL`).
Optional: `CONTENT_MODEL` (defaults to Claude Haiku — see `lib/claude.js`), `PORT` (3000), `IMAGEGEN_ASPECT_RATIO` (16:9), `BILLING_ENABLED` (kill switch, default off — see Generation caps below), `APP_BASE_URL`, Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CREDIT_PRICE_ID`, `STRIPE_ENTRY_PACK_PRICE_ID`) for billing.
Never commit real keys — use a local `.env` in dev, Render dashboard secrets in production.

## Architecture

### Request flow & multi-tenancy

Every request to `/api/*` (except the Stripe webhook, `/config.js`, `/version.js`, and the waitlist route — see the comments at the top of `server.js` for why each is excluded) passes through `middleware/resolveTenant.js`: it verifies the Supabase JWT from the `Authorization: Bearer` header via a real `supabase.auth.getUser()` round-trip, then looks up (or race-safely creates) that user's single world. It sets `req.userId` and `req.worldId` — every route and lib function downstream takes `worldId` as its first real parameter and scopes all data access to it. `middleware/attachCostContext.js` runs right after, tagging every Claude/Gemini call made during the request for cost logging (`lib/costContext.js`, `lib/costTracker.js`, `cost_log` table).

There is **no client-side database access** — the Supabase publishable key exposed via `/config.js` is used only for auth (sign up/in/out, session lookup) in the browser; all content reads/writes go through this app's own `/api` routes using the resulting JWT.

### Data model: one `entries` table, not files

All generated content lives in a single Postgres `entries` table (`world_id, category, entry_id, name, subtitle, faction, tags_json, body_html, raw_json, locked, ...`), accessed only through `lib/entriesRepo.js`'s generic `listEntries`/`getEntry`/`upsertEntry`/`patchEntryMeta`/`deleteEntry`/`searchEntries`/`countEntries`. `raw_json` holds the full old-style entry object (the app predates this schema — it used to write two flat files per entry, `data/<id>.js` + a `manifest.js` line); the mirrored columns (`name`, `faction`, `tags_json`, etc.) exist for querying without unpacking JSON. `lib/roster.js` and `lib/fileWriter.js` are thin, category-named wrappers around `entriesRepo.js` — don't add new direct Supabase queries against `entries` outside these files.

### The per-category generation pattern

All 8 content categories (Factions, NPCs, Bestiary/Enemies, Classes, Items, Logs, Survivors, Locations) follow the same pipeline, e.g. for NPCs (`routes/generate.js`):

1. **Route** (`routes/generateX.js`) — gated by `enforceGenerationCap` + `enforceEntryCapOnGenerate` middleware. Builds grounding context (`lib/roster.js`'s roster overlap, `lib/loreContext.js`, `lib/worldFlavor.js`'s setting/faction/stat-label context).
2. **Prompt builder** (`prompts/xContentPrompt.js`) — assembles the system prompt from that context. Prompts split into a cacheable static block (instructions/schema) + dynamic block (this world's data) via `buildCacheableSystemPrompt()` in `lib/claude.js`, using Anthropic prompt caching.
3. **Generation** — `callClaudeExpectingJson()` (`lib/claude.js`) calls the model, parses JSON with several fallback repair passes, and retries once (with a bumped token budget) on parse failure.
4. **Template** (`lib/xTemplate.js`) — builds the manifest entry shape and body HTML from the raw model output.
5. **Write** — `lib/fileWriter.js`'s `saveXEntry()` upserts into `entries` via `entriesRepo.js`.

New/regenerate/fill are the same route branching on whether `fillExistingId` is set and whether the target entry is `locked` (placeholder → "fill") vs already generated (→ "regenerate").

**Regenerate is preview-then-confirm, not write-on-generate**: a regenerate call returns `{ preview: true, entry, newBodyHtmlPreview, oldBodyHtmlPreview }` without touching the DB; the frontend shows a diff and only calls `POST /api/confirm-entry` (`routes/confirmEntry.js`) — the single shared write path for every category (factions are handled specially there, recomputing their Roundup + reciprocal relationships fresh at confirm time) — once the user accepts. `POST /api/confirm-entry` is also the creation point for manually-authored entries (Manual Mode, zero AI calls).

Portrait image generation is decoupled from entry creation: entries save with `imageUrl: null`, and the dossier page offers separate Generate/Upload actions (`routes/generateEntryImage.js`, `lib/imagegen.js` → Gemini).

### Grounding context (why generations stay world-consistent)

- `lib/worldConfigRepo.js` — typed read/write for wizard-step data (`world_config` table): draft (unsubmitted), lore, factions, stat system, skill system, style guide, category config.
- `lib/loreContext.js` / `lib/loreParsing.js` — pulls saved World Lore into prompts.
- `lib/worldFlavor.js` — setting framing sentence, the world's own faction list/enum (read from the **live archive**, not `world_config`, so prompts only ever offer factions a reader could actually click through to), and world-specific stat/skill display labels layered over fixed underlying keys (`body/reflex/knowledge/presence/sanity/fate` never change — only their labels do).
- `lib/roster.js` — "what already exists in this category" context for duplicate-avoidance, capped at `MAX_FULL_ROSTER_LINES` (60) full entries plus a tallied combo summary for anything older, to bound prompt cost as a world grows.

### Wizard: progressive-commit, AI-optional

The 8-step setup wizard (`routes/wizard*.js`, `archive/wizard*.html`) writes each step directly to its real destination on save as the user completes it (not batched until a final step) — this was a deliberate correction mid-build, kept for crash-survival and so later steps can ground in already-finalized earlier data. Every step is free-text-first with AI "Generate" as pure assist, not a requirement — including per-field "Help me" AI assist (`routes/fieldAssist.js`, `lib/fieldAssist.js`) across ~80 fields.

### Generation caps & billing

`middleware/enforceGenerationCap.js` gates every generation route (and field-assist, at a cheaper cost) behind a **points** system: 1 full generation = 5 points, 1 field assist = 1 point (avoids floating-point spend). `BILLING_ENABLED` env var is the switch:
- unset/`false` (current default): flat legacy beta cap, no trial/subscription concepts.
- `true`: full tiered flow — trial cap, then subscription quota, then rollover credits (`lib/billingRepo.js`, `migrations/012_billing.sql`, Stripe webhook in `routes/stripeWebhook.js`).

`middleware/enforceEntryCap.js` is a separate, independent cap on total entries per world (manual creation doesn't cost generation points, so it needs its own limit).

### PDF / image compositing

`lib/pdfExport.js` and `lib/dungeonMapCompositor.js` both drive headless Chromium via `puppeteer-core` + `@sparticuz/chromium` — the same dependency pair covers whole-world/per-category/per-entry/per-Quest/per-Campaign PDF export and baking the grid directly into battle-map PNGs server-side (so a plain "Save image as" gives a print/VTT-ready file).

### Frontend

Plain HTML/CSS/JS, no build step, no framework:
- `archive/` — the live per-user site: category pages, `dossier.html` (single-entry view/edit), the wizard pages, `map.html`, `settings.html`. Shared JS in `archive/js/` (`render.js` fetches from `GET /api/entries/:category[/:id]`).
- `marketing/` — the public chronicled.world marketing site; a **separate static deployment** with its own `version.js` (see Commands above for keeping the two version stamps in sync).

## Conventions to follow

- **Comments explain *why*, extensively** — this codebase's existing style is dense rationale comments (a decision made, a bug a change fixes, a tradeoff accepted, a pointer to the addendum doc that has the full story), not restating *what* the code does. Match this style in code you touch here rather than defaulting to comment-free.
- **Changelog + addendum pattern**: `CHANGELOG.md` is a scannable reverse-chronological index; add new work under `## Unreleased` (or a new version section) as a few bullets, and put full architectural detail in a new `session_addendum_<feature>_shipped.md` file linked from that entry. Don't put deep design rationale directly in `CHANGELOG.md`.
- **Migrations are additive and manual** — add a new numbered `migrations/0NN_description.sql` file rather than editing a shipped one; there's no runner, so remind whoever applies it that it needs to run by hand against Supabase.
- Route files stay thin: request parsing, middleware gating, and wiring together `lib/`/`prompts/` calls — the actual logic (prompt construction, parsing, persistence) belongs in `lib/` or `prompts/`.
