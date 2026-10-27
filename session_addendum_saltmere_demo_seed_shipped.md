# Session Addendum: Saltmere demo seed script — shipped

`scripts/seedSaltmereDemo.js` (+ `scripts/lib/saltmereSeed.js`,
`scripts/testSaltmereSeed.js`). Expands the Saltmere Sprawl demo world with the
79-entry content pack in `saltmere_pack/` so the static demo is richly
populated. No app/server code, auth, billing, or schema was changed.

## Usage

```
node scripts/seedSaltmereDemo.js                                   # dry-run (default): table of create/skip + adaptations
node scripts/seedSaltmereDemo.js --apply  --confirm-host <host>    # backup, then create
node scripts/seedSaltmereDemo.js --remove --confirm-host <host>    # delete exactly what the seed created (+ images)
```

`--world-name` (default "Saltmere Sprawl") or `--world-id`; `--dry-run` forces a
preview even with `--apply`/`--remove`. `<host>` is the host of `SUPABASE_URL`;
requiring it means a write can never go to whichever project the shell happens
to point at.

## How it works

1. **World lookup.** `worlds.name` is never updated by the app (it stays "My
   World"); the user-chosen name is the wizard Step 1 `worldName` in
   `world_config.draft_json["1"]`. Both are checked. Aborts if zero or several
   worlds match, or if the world isn't `5e`.
2. **Dedupe.** A pack entry is skipped if the world already has the same
   (app category, name), case/punctuation-insensitive — including locked ghost
   placeholders (filling one would overwrite an existing row; the app's own Fill
   button is the right tool). Dedupe is strict: "Tunnel Maw" ≠ "The Tunnel Maw".
3. **Ids.** The generators' own rule: slugify the name (factions use
   `lib/factionDeepLore.js`'s variant), suffixed if a *different* entry holds the
   id. Portraits live at `<world>/<entryId>.png` with no category in the path, so
   portrait-category ids are kept unique *across* categories (the hazard "Cable
   Siren" and the diver "Cable Siren" would otherwise overwrite each other's
   image; the diver keeps the pack's `cable-siren-diver`).
4. **Cross-links (rule 5).** Implemented as plan-then-write rather than
   write-then-patch: pass 1 assigns every final id (slug→id map, with skipped
   duplicates mapping to the existing entry), pass 2 rewrites
   `relationships[].toId`, `notableNpcs[].toId`, `locationId`, `faction`,
   `classes[].classId` and spell `classes` and writes each entry once. Refs into
   entries that already exist resolve by id, then by name (leading "The"
   ignored for lookups only — the pack's `seawall-authority` finds "The Seawall
   Authority"). Anything unresolvable is left as-is and listed. Equivalent
   outcome to the two-write version without rewriting 79 rows.
5. **Writers.** Entries go through the same `save*Entry()` functions
   `routes/confirmEntry.js` / the generate routes use, after the same code-side
   post-processing (see below). The entry linker's **backfill** (rewrites other
   entries that name a new one) and **ghost placeholders** are intentionally not
   run: they'd edit/add rows the seed doesn't own. Faction
   `syncReciprocalRelationships` is skipped for the same reason (it writes into
   other factions); each new faction's Roundup is rebuilt at the end so member
   lists show.
6. **Tag.** `demoSeed: "saltmere-v1"` inside the content object (survives
   rebakes) and top-level via `patchEntryMeta`; `scripts/.seed-saltmere-ids.json`
   is written incrementally as a second record. `--remove` deletes the union,
   plus portraits/banners, backs up first, and — like the app's own delete —
   clears ids other entries stored for a removed entry (only if any do).
7. **Backups.** `--apply` and `--remove` write the world's full `entries` dump
   to `scripts/backups/` (git-ignored) before any change.
8. **Timeline.** Not written (events would outlive `--remove`). The Timeline
   page's "Sync timeline" button backfills dated entries on demand.

## Adaptations (pack → app schema)

The pack is shaped like a content-prompt *response*; the generate routes then
compute fields in code, which saving the pack verbatim would skip. Adapters in
`scripts/lib/saltmereSeed.js` mirror each route's post-processing. Validation
reads the real prompt schemas (`prompts/*ContentPrompt.js`,
`prompts/rulesets/5e/*`) by parsing the schema template literals, so it can't
drift from them. The dry-run prints every adaptation; the notable ones:

- **Hazards:** `toHit`/`damageDice` parsed out of action text; CR **computed**
  with `computeChallengeRating` (same as the Homebrew generator, flagged
  `estimated`). Computed CRs are far below the pack's targets (e.g. Tunnel Maw
  8→3, Pale Listener 7→1) because the formula doesn't see saves/special damage.
- **Salvage:** `wondrous item`→`wondrous`, rarity capitalised, `{name,description}`
  properties → strings, `harpoon` (not an SRD weapon) → `javelin`, resolved stats
  + rarity/value check as the generator does.
- **Dive Roles:** ability names → lowercase keys, bare subclass names →
  `{name, flavor:"", features:[]}`, unlock level + saves via the route's rules.
- **Divers:** HP / proficiency / spell slots / passive Perception computed from
  the class; skills → lowercase keys; `backgroundKey` validated against the
  world's real Backgrounds (SRD 5.2.1 ships only acolyte/criminal/sage/soldier —
  the others become `null`, as the route does for an unknown pick).
- **Contacts/Powers:** `toCategory` singular→plural; wrapping quote marks stripped
  from `signatureQuote`/dialogue/`overviewQuote` (templates re-add them); NPC
  relationship to a *location* kept (outside the prompt's listed targets, but the
  dossier link works).
- **Logs:** malformed `resolvedDateSubject: "entry"` → `null`. Dates validate
  against the world's calendar; invalid ones are dropped with a warning (none were).
- **Anomalies:** the app has no image support for spells, so their 8 images are
  not attached (reported, not silently ignored).

## Verification

- `node scripts/testSaltmereSeed.js` — 33 checks: resolver, dedupe, and an
  end-to-end apply / idempotent re-apply / `--remove` / failed-upload run on the
  in-memory fake (pre-existing rows byte-identical; storage objects removed =
  uploaded).
- Real server + real archive pages in headless Chromium against the fake DB
  after an apply: 9 dossiers across every category rendered with portraits, no
  page errors, cross-links followed to real dossiers.
- Read-only `--dry-run` against the live project: 78 create / 1 skip
  (`Gate Runner`), 0 unresolved links.
- **Not run:** `--apply` against any real database (no dev project exists).

## Apply on a real project

Apply migrations are not involved. After review, against the intended project:

```
node scripts/seedSaltmereDemo.js --dry-run
node scripts/seedSaltmereDemo.js --apply --confirm-host <SUPABASE_URL host>
# undo: node scripts/seedSaltmereDemo.js --remove --confirm-host <SUPABASE_URL host>
```

## Static demo tab (`marketing/demo/`)

A browsable, no-backend "Demo world" tab for chronicled.world (`/demo/`, linked
from the marketing nav, listed in `sitemap.xml`). It is a **snapshot**, so it
keeps working after the live Saltmere world is replaced with a real one.

- **Source of truth is committed:** `saltmere_pack/existing_world_snapshot.json`
  holds the 19 entries that were in the live world plus the config the page
  needs (category labels/blurbs, site title/tagline/status line, style-guide
  theme, calendar). Captured read-only with
  `node scripts/exportDemoSnapshot.js --capture` (SELECTs only; project URL and
  world id are scrubbed from the file).
- **Build** (`node scripts/exportDemoSnapshot.js`, no credentials, no database):
  loads the snapshot into the in-memory fake, replays the seed script against it
  (so ids, links and dossier HTML are exactly what the app's templates produce),
  and writes `marketing/demo/data.js` (97 entries) + `marketing/demo/images/`
  (70 portraits/banners) + `archive.css` (a copy of the app stylesheet, so
  entries look like the product). Dossier links are rewritten to `#/category/id`;
  every portrait `<img>` points at a bundled file or is dropped (the 19 live
  entries have no images; their stored URLs returned 400).
- **Viewer** (`index.html`, `demo.js`, `demo.css`): hash-routed hub / category
  grid / dossier, search, prev/next, the world's own theme and category names
  (Powers, Contacts, ...). Works from any static host and from `file://`.
- **Re-run** the build whenever the pack or the app's templates change.
- Verified in headless Chromium over plain static serving: all 97 dossiers render,
  0 dead internal links, 0 page errors, no horizontal scroll at 390px.
- Presentation-only choices in the exporter: the five new factions get accent
  colours from a small palette (the app generates these with a model call; not
  written anywhere); portrait images are the pack PNGs unmodified (~9 MB total).
