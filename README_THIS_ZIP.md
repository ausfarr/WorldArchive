# Phase 3 Genericization — files to deploy

Extract this zip's contents directly into the root of `ausfarr/WorldArchive`,
overwriting the existing files at the same paths. Folder structure matches
the repo exactly:

```
lib/
  loreContext.js       — added faction-tag filtering
  worldFlavor.js        — NEW shared helper (setting/faction/stat-label context)
  imagegen.js            — fixed responseModalities bug (image generation)
prompts/
  npcContentPrompt.js
  enemyContentPrompt.js
  itemContentPrompt.js
  classContentPrompt.js
  logContentPrompt.js
  survivorContentPrompt.js
  factionContentPrompt.js
routes/
  generate.js             — NPCs
  generateEnemy.js
  generateItem.js
  generateClass.js
  generateLog.js
  generateSurvivor.js
  generateFaction.js
scripts/
  migrateEchoesToWizard.js  — NEW, one-time script (see below)
```

## Deploy

1. Upload/commit these files into the repo at the paths above (replacing
   the existing ones).
2. `git push` — Railway auto-deploys.
3. No `server.js` or frontend changes needed — every route kept its exact
   request/response contract.

## After deploying: run the Echoes migration once

From a Railway shell (or locally with a `.env` pointed at the real
Supabase project):

```
node scripts/migrateEchoesToWizard.js <your-echoes-worldId>
```

Find `<worldId>` in Supabase's Table Editor → `worlds` table. This imports
your real World Bible into `lore_sections` and regenerates all 5 factions'
Deep Lore dossiers through the new generic pipeline, preserving the legacy
short-key faction convention (`ferro_kings`, etc.) so your existing
NPCs/enemies/logs keep matching correctly in Roundup tables.

## Test after deploying

Generate one NPC and one enemy for Echoes post-migration and confirm they
show up in that faction's Roundup on the live Factions page — that's the
one spot a subtle key mismatch would silently fail instead of erroring.

## Known non-blocking gaps

- Per-faction accent colors (the CSS `--ferro-kings` etc. vars) only apply
  to Echoes' original 5 factions — generic worlds render with the default
  cyan accent. Flagged as Phase 4 polish, not urgent.
- `lib/worldBible.js`, `lore/world_bible_sections.json`, and
  `prompts/wizardFactionPrompt.js`'s stale comments referencing the old
  system are now dead code, safe to delete whenever convenient.
