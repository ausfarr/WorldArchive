# World Forge — NPC Pipeline v1

Automated NPC generation + real Archive browsing for *Echoes of the Neon*.

## How to run

The app starts automatically via the **Start application** workflow (`npm start`).  
It listens on port 5000 and serves the full archive + NPC generator.

## Stack

- **Runtime**: Node.js / Express
- **Entry point**: `server.js`
- **Archive static files**: `archive/` (index.html, dossier.html, css, js, data)
- **NPC pipeline**: `routes/generate.js` → `lib/claude.js`, `lib/imagegen.js`, `lib/fileWriter.js`
- **Prompts**: `prompts/npcContentPrompt.js`, `prompts/artPromptPrompt.js`

## Required secrets

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude — NPC content + art prompt generation |
| `IMAGEGEN_API_KEY` | Image generation (Gemini / Nano Banana) |

Add these via Replit Secrets if they aren't already set.

## Environment variables

| Variable | Value |
|---|---|
| `PORT` | `5000` (set in shared env) |

## User preferences

<!-- Add any remembered preferences here -->
