# Phase 1 Supabase Rewrite — Deploy Notes

## Files in this package (drop into the matching paths in your repo)

```
lib/supabaseClient.js     NEW
lib/entriesRepo.js        NEW
lib/roster.js             REWRITTEN (same function names, now async + worldId-based)
lib/fileWriter.js         REWRITTEN (save*Entry per category + saveImage via Storage)
lib/factionRoundup.js     REWRITTEN (async + worldId-based)
middleware/resolveTenant.js  NEW — placeholder, blocks all /api requests until real auth
routes/generate.js            REWRITTEN
routes/generateEnemy.js       REWRITTEN
routes/generateItem.js        REWRITTEN
routes/generateSurvivor.js    REWRITTEN
routes/generateLog.js         REWRITTEN
routes/generateClass.js       REWRITTEN
routes/generateFaction.js     REWRITTEN
routes/confirmEntry.js        REWRITTEN
server.js                     REWRITTEN (wires in resolveTenant middleware)
package.json                  UPDATED (adds @supabase/supabase-js)
```

Every other file in your repo (all *Template.js files, prompts/*, lib/claude.js,
lib/imagegen.js, lib/statFormulas.js, lib/itemFormulas.js, lib/worldBible.js,
the entire archive/ folder) is UNTOUCHED — confirmed via diff against a fresh
clone of your repo.

## What changed structurally

- The old manifest.js + data/<id>.js two-file-per-entry pattern is gone.
  One row in the `entries` table now IS both the manifest listing and the
  full dossier — see lib/entriesRepo.js for the row shape.
- Every roster.js/fileWriter.js function's first argument is now `worldId`
  (a worlds.id uuid), not a filesystem `archiveRoot` path.
- Every one of those functions is now `async` — routes now `await` them.
- fileWriter.js collapsed from 2 functions per category (writeXDataFile +
  appendToXManifest) into 1 (saveXEntry), since there's no longer a
  separate manifest file to keep in sync.
- saveImage() uploads to the `portraits` Supabase Storage bucket at
  `{worldId}/{entryId}.png` and returns a public URL instead of writing
  to local disk.

## What's a known, deliberate placeholder

`middleware/resolveTenant.js` currently refuses every /api request with a
clear error message. This is intentional — real Supabase Auth wiring
(Section 5, step 4 of the pivot doc) is the very next task, not part of
this pass. The comment block at the top of that file spells out exactly
what to replace it with.

## What's a known, deliberate simplification

The rendered "footer" links (the small "Faction: The Ferro-Kings" link at
the bottom of a dossier page) are plain text now instead of HTML anchors,
because the maps needed to build those (FACTION_LABEL, FACTION_CATEGORY_ID)
are private to each *Template.js file and weren't exported. Since the live
archive UI isn't reading from Supabase yet this phase anyway (that's Phase
3/4), this has zero visible effect right now — just flagging it so it
doesn't look like an oversight later. Everything else (bodyHtml, tags,
eyebrow, subtitle) matches the original fidelity closely, including the
per-category tag badges (tier-elite/tier-boss color coding, rarity badges,
etc.) which I double-checked and fixed to match after the first pass
resembled but didn't exactly reproduce the original tag logic.

## Also flagged, not fixed (out of scope for this pass)

`scripts/testEnemyPipeline.js` imports `loadWindowExport` from lib/roster.js
for its own local file-parsing test logic. That export no longer exists
(there's nothing to vm-parse anymore — reads go through Supabase now), so
that one dev script will break if run. It's a standalone test script, not
part of the running server, so it doesn't block deployment — just needs an
update (or removal) whenever you next touch it.

## Testing performed (in-sandbox, no live Supabase access)

- Syntax-checked all 15 new/changed files (`node -c`)
- Installed real dependencies via `npm install` (including the new
  @supabase/supabase-js) against a full clone of your actual repo
- Booted the real server.js with the full unmodified module graph and
  fake Supabase credentials — confirmed no require/wiring errors
- Confirmed resolveTenant correctly blocks all /api/* routes with a clear
  error while leaving the static archive/ site serving normally
- Functionally exercised all 7 save*Entry functions + saveImage against a
  mocked Supabase client, using your REAL unmodified *Template.js files —
  confirmed correct bodyHtml generation and correct row shape for the
  entries table
- Functionally exercised the read paths (buildRosterContext,
  buildEnemyRosterContext, readNpcManifest, buildFactionRoundup) against a
  mocked Supabase client with sample rows — confirmed correct context
  strings and roundup aggregation

None of this touched your real Supabase project (this sandbox can't reach
supabase.co) — the very next real test should be against your actual
database, once auth is wired (or with a temporary worldId if you change
your mind on that).

## Suggested deploy steps (per your existing workflow)

1. Copy these files into the GitHub repo (ausfarr/WorldArchive), preserving
   the paths above.
2. Replit: Git pane → Pull.
3. Replit: Stop → Run (picks up the new @supabase/supabase-js dependency
   and confirms your 3 Secrets are loaded).
4. Since resolveTenant blocks everything right now, the only thing worth
   spot-checking immediately is that the server *starts* without crashing
   and the static site still loads — real /api testing waits for auth.
