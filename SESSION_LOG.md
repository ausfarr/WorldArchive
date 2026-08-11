# Session Log — Multi-Ruleset Genericization

Running log of decisions, deviations, and open questions for this project,
per the session prompt's "Working Discipline" section. Gets folded into
`session_addendum_ruleset_genericization.md` at the end (Phase 14).

## Pre-flight notes

- `world_forge_scope.md` referenced by the session prompt as required
  pre-reading does **not exist** in this repo. Treated as: this project's
  scope doc is the session prompt itself; Phase 14 will *create*
  `world_forge_scope.md` fresh as the going-forward source of truth,
  rather than update a pre-existing file.
- This is genuinely a multi-week-scale project compressed into one
  session. Working phase-by-phase with real checkpoints as instructed;
  later phases (9-13 especially) will likely get a narrower implementation
  than 1-3, with gaps called out explicitly here rather than silently
  skipped, per the deliverable requirement.
- Dev environment has no real Supabase/Anthropic/Gemini credentials
  available (no `.env`, sandboxed session) — all verification is
  syntax/logic-level (`node -c`, `require()` smoke tests, boot the server
  with dummy env vars and hit routes) rather than live DB round-trips.
  `scripts/testPipeline.js` and friends fail even on a clean pre-project
  checkout in this sandbox (network-mocking issue unrelated to this
  project — confirmed via `git stash`), so that's a pre-existing
  environment limitation, not a regression to chase.

## Phase 1 — Ruleset Foundation

- `migrations/020_ruleset_foundation.sql`: `world_config.ruleset` (default
  `'echoes'`, CHECK-constrained to the 4 known values), `srd_library`
  (shared, non-tenant-scoped canonical content; RLS with an explicit
  authenticated-SELECT policy per the spec, no write policy — writes are
  service-role only via the Phase 2 ingestion scripts), `world_srd_imports`
  (tenant-scoped join table; RLS enabled with no policies at all, matching
  this codebase's existing closed-by-default pattern for tables the
  client never touches directly, e.g. `lore_sections`).
- Added generic nullable filter columns (`cr`, `level`, `class_name`,
  `rarity`) to `srd_library` directly in this migration rather than a
  later Phase-2-specific ALTER, since the spec's "mirror onto columns for
  querying" guidance was clear enough to commit to up front and it avoids
  a second migration touching the same brand-new table.
- **Ruleset lock semantics** (spec says "permanent," but the wizard's
  established pattern is progressive-commit with a live draft): decided
  the lock takes effect at `setup_completed_at`, not at first-save. Step 1
  can be revisited and the ruleset changed like any other still-in-progress
  wizard field right up until Review & Confirm (Step 8) — after that,
  `setRuleset()` throws unconditionally and no route calls it again. This
  matches how every other wizard field behaves (editable pre-completion)
  while still satisfying "no UI or route ever changes an existing world's
  ruleset" for any world a user is actually using.
- `lib/rulesets/index.js` registry: explicit `require()` per filled-in
  entry (not directory auto-discovery) so a missing/typo'd module fails
  loudly at server boot. Echoes' entry points at the exact files every
  route already imported — zero behavior change. `5e`/`pf2e`/`generic`
  start as empty category maps; Phase 3 adds the first real entry
  (`5e.enemies`).
- Admin gate lives in exactly one place: `listRulesets()`. Re-checked
  server-side in `/wizard/set-ruleset` too (never trust the frontend
  having filtered the picker).
- Checkpoint verification done: registry logic (`listRulesets` returns
  `[5e, pf2e, generic]` for a non-admin email, all 4 for
  `ausfarr@gmail.com`), full server boot with dummy env vars (no crash,
  new route mounts and returns 401 pre-auth as expected, matching every
  other `/api/*` route), inline wizard.html script parses cleanly. Could
  not verify against a real Supabase project (no credentials in this
  environment) — Austin should re-run the Phase 1 checkpoint from the spec
  (new non-admin world sees exactly 5e/pf2e/generic, admin sees all 4,
  pre-migration world reads `ruleset='echoes'`) against the real DB before
  trusting this further.

## Phase 2 — SRD Data Ingestion

(to be filled in)
