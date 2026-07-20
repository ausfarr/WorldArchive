# World Forge — NPC Pipeline v1

Automated NPC generation + real Archive browsing for Echoes of the Neon.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `ANTHROPIC_API_KEY`
   - `IMAGEGEN_API_KEY` (Gemini/Nano Banana)
3. `npm start`
4. Visit http://localhost:3000 — full archive browsing, generator form on the NPCs page.

## Structure
See `npc_pipeline_v1_spec.md` (in the parent project) for full architecture notes.
Key files:
- `server.js` — Express entry point
- `routes/generate.js` — the pipeline (roster context → content → art prompt → image → file writes)
- `lib/roster.js` — reads live archive/npcs/* via vm sandbox for overlap-checking
- `lib/entryTemplate.js` — JSON → bodyHtml → ENTRY file (single source of truth for archive HTML shape)
- `lib/claude.js` / `lib/imagegen.js` — API wrappers
- `prompts/` — the two system prompts, built from the real reference files
- `archive/` — your actual site (index.html, dossier.html, css, js) + all data

## Tested (see scripts/testPipeline.js)
- vm-based parsing of real manifest.js/data files
- Templating against realistic + adversarial input (backticks, `${}`, quotes)
- Full pipeline with mocked Claude/image responses
- Static serving of real homepage/category/dossier pages

Not yet tested: real API calls (needs your keys — add them as secrets on whatever
host you deploy to, never paste them into chat).
