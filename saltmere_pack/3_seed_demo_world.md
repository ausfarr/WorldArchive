# Claude Code prompt: seed the Saltmere demo world (79 new entries + art)

Repo: ausfarr/WorldArchive. Read `CLAUDE.md`, `world_forge_scope.md`, `session_addendum_demo_mode_scope.md` first.

## Goal
Expand the Saltmere Sprawl demo world to 100+ entries so the static demo (prompt 2) is richly populated. A content pack is in `saltmere_pack/`:
- `content/{factions,npcs,hazards,items,districts,anomalies,classes,divers,logs}.json` (79 entries, app content schemas)
- `images/*.png` (300x300 portraits; each entry's `image` field is a filename stem)

## Rules
1. Build `scripts/seedSaltmereDemo.js`. Do not change app/server code, auth, billing or schemas.
2. Target world: look up the existing Saltmere world by name (`--world-name "Saltmere Sprawl"`, or `--world-id`). Abort if not found. Additive only: never edit or delete existing entries.
3. Dedupe: skip any pack entry whose (category, name) already exists in that world (case-insensitive). Log skips.
4. Use the app's real entry-creation path (same repo/helpers the generators and manual-entry endpoints use, e.g. `lib/*Template.js`, ruleset 5e helpers) so entries get proper ids, templates, search index and tenant fields. Map categories: factions->Powers, npcs->Contacts, hazards->Hazards (5e enemy), items->Salvage (5e item), districts->Districts, anomalies->Anomalies (5e spell), classes->Dive Roles (5e class), divers->Divers (5e survivor), logs->Dive Logs.
5. Cross-links: pack ids are slugs. Resolve in two passes: create all entries, record slug->real id, then rewrite `relationships[].toId`, `notableNpcs[].toId`, `locationId`, `faction` fields to real ids (leave unresolved ones as-is and report them; for existing entries resolve by name).
6. Images: upload each `images/<stem>.png` through the app's normal portrait upload path (storage + DB reference). If an upload fails, keep the entry and report it.
7. Tag every created entry with `demoSeed: "saltmere-v1"` (metadata/tag field, whichever the schema allows without migration; if none exists, write ids to `scripts/.seed-saltmere-ids.json`). Provide `--remove` that deletes exactly those tagged/recorded entries and their images.
8. Flags: `--dry-run` (default; prints a table of what would be created/skipped, no writes), `--apply`, `--remove`.
9. Validation: before writing, check required fields per category against the real content prompt schemas (`prompts/*ContentPrompt.js`, `prompts/rulesets/5e/*`); fail the whole run with a clear message if any entry is invalid. If a pack field is not accepted by the app schema, adapt the pack value (do not weaken the schema) and list the adaptations.
10. Dates: `foundingDate` / `resolvedDate` use the world's custom calendar format; if the calendar differs, convert or drop with a warning.
11. Back up first: `--apply` writes a JSON dump of the world's entries to `scripts/backups/` before any insert.

## Tests / done when
- `--dry-run` prints per-category counts (expected new: factions 5, npcs 18, hazards 9, items 8, districts 9, anomalies 8, classes 6, divers 8, logs 8; fewer if deduped).
- Unit test for the slug->id resolver and the dedupe.
- Run `--apply` against a local/dev DB (not production) and show the entries render in the archive UI with images and working cross-links; then run `--remove` and confirm the world returns to its prior count.
- Do NOT run `--apply` on production. Print the exact command for Austin to run after review.
- Update `world_forge_scope.md` with a short note on the seed script and the tag.
