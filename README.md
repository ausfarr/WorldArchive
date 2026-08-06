# Chronicled

An automated worldbuilding content pipeline for tabletop RPGs and other
game settings — generate lore-consistent NPCs, monsters, items, and more,
with AI-generated art, auto-filed into a live, browsable wiki for your
world. Live at [chronicled.world](https://chronicled.world).

**Status:** private beta, multi-tenant (each user gets their own private
world/archive). See `CHANGELOG.md` for version history and what's
shipped so far.

## What it does

A guided setup wizard takes a new world through lore, factions, a stat
system, a visual style guide, and category labeling — then generates
content grounded in that world's own established lore, not a fixed
template:

- **8 core content categories:** Factions, NPCs, Bestiary (enemies),
  Classes, Items, Logs, Survivors, Locations — each with its own
  generator, full regenerate/edit support, and (where applicable)
  AI-generated portrait art matching the world's style guide.
- **Quests:** tie NPCs, Locations, Enemies, Items, and Logs into a
  DM-buildable structure — build one by hand or let the archive propose
  one from the world's own roster.
- **Campaigns:** sequence multiple Quests into an ordered story arc,
  with AI-assisted planning.
- **Dungeon/Battle Maps:** AI-illustrated, grid-baked-in battle maps per
  Location — save and use at the table or in any VTT.
- **Generative world art:** a world mood board, per-faction accent
  banners, and a fully computed world map (factions/locations laid out
  algorithmically, not just an illustrative backdrop).
- **PDF export:** whole-world, per-category, per-entry, per-Quest, and
  per-Campaign — print-ready, respects each world's own category
  labels/skinning.
- **Per-world visual identity:** palette, fonts, and per-faction accent
  colors, chosen during setup and applied site-wide.

## Architecture

- **Backend:** Node.js + Express (`server.js`, `routes/*.js`)
- **Database / Auth / Storage:** Supabase (Postgres + Auth + Storage,
  isolated per user via RLS-equivalent tenant scoping —
  `middleware/resolveTenant.js`)
- **Text generation:** Anthropic Claude (`lib/claude.js`) — defaults to
  Haiku for cost, see `CONTENT_MODEL` below
- **Image generation:** Google Gemini (`lib/imagegen.js`)
- **PDF export & battle-map grid compositing:** headless Chromium via
  `puppeteer-core` + `@sparticuz/chromium` (`lib/pdfExport.js`,
  `lib/dungeonMapCompositor.js`)
- **Frontend:** plain HTML/CSS/JS, no build step (`archive/` is the live
  per-user archive site; `marketing/` is the public chronicled.world
  marketing site, deployed separately)

## Setup

1. `npm install`
2. Set the following as environment variables (Render dashboard secrets
   in production, a local `.env` for development — never commit real
   keys):
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` — service-role-equivalent key; the backend's
     only Supabase client, bypasses RLS
   - `SUPABASE_PUBLISHABLE_KEY` — anon/public key, exposed to the
     browser via the `/config.js` route
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
   - Optional: `CONTENT_MODEL` (defaults to Claude Haiku), `PORT`
     (defaults to 3000), `IMAGEGEN_ASPECT_RATIO` (defaults to `16:9`)
3. Run every file in `migrations/` against your Supabase project, in
   numeric order — there's no migration runner, apply each `.sql` file
   directly via the Supabase SQL editor or CLI.
4. `npm start`
5. Visit `http://localhost:3000` — sign up, and the setup wizard walks
   you through creating your first world.

## Repo structure

- `server.js` — Express entry point, mounts every route
- `routes/` — one file per API surface (content generators, wizard
  steps, Quests, Campaigns, export, admin)
- `lib/` — shared logic: Claude/Gemini API wrappers, per-category
  content templates, the tenant-scoped data repo (`entriesRepo.js`),
  roster/context builders for grounding generation in a world's own
  data, PDF/image compositing
- `prompts/` — every system prompt, one file per content type
- `middleware/` — tenant resolution, the beta generation cap
- `migrations/` — Supabase schema migrations, run manually in order
- `archive/` — the actual per-user archive site (what a signed-in user
  sees): category pages, dossier pages, the setup wizard, shared
  CSS/JS
- `marketing/` — the public chronicled.world marketing site (separate
  static deployment, own version stamp — see `CHANGELOG.md`'s notes on
  keeping both version files in sync)
- `scripts/` — one-off dev/debug tooling (model comparison, tenant
  isolation tests); not part of the running app

## Versioning & changelog

See `CHANGELOG.md` for the full version history and what shipped in
each release, plus links to detailed per-feature design notes. The
public-facing version of the same history is at
[chronicled.world/changelog.html](https://chronicled.world/changelog.html)
— run `node scripts/buildMarketingChangelog.js` after adding a new
version to `CHANGELOG.md` to regenerate it (strips internal-only notes
and addendum links; skim the diff and lighten the tone before
publishing, per the reminder the script prints).
