# Session Addendum: Pathfinder 2e Removal (Phase R1, shipped)

Scope: remove Pathfinder 2e from the codebase, per the decision locked in
`session_addendum_ruleset_recovery_plan.md` ("Pathfinder 2e is being
removed, not just deprioritized"). Nothing else touched — Phase R2/R3 of
the recovery plan, and any other adjacent issue noticed along the way,
are explicitly out of scope for this session (see "Flagged, not fixed"
below).

Repo was re-cloned fresh from GitHub at the start of this session per the
task instructions, and the concrete removal list was re-verified against
that fresh clone before starting — it matched the recovery plan's list
exactly, with no new pf2e code having landed since.

## What shipped

**Deleted entirely:**
- `lib/rulesets/pf2e/` (17 files: class/enemy/item/spell/survivor
  formulas+repo+template, `homebrewEnemyGenerator.js`,
  `npcCombatDefaults.js`, `statFormulas.js`)
- `prompts/rulesets/pf2e/` (5 content-prompt files + `.gitkeep`)
- `scripts/ingestSrdPf2e.js`
- `scripts/testPf2eClassFormulas.js`, `testPf2eItemFormulas.js`,
  `testPf2eSpellFormulas.js`, `testPf2eStatFormulas.js`,
  `testPf2eSurvivorFormulas.js`

**Pf2e branches/references removed from (files kept, only pf2e-specific
code cut):**
- `lib/rulesets/index.js` — `pf2e` removed from `RULESET_IDS`,
  `RULESET_META`, and the `REGISTRY` object entirely.
- `middleware/requireCategoryAvailable.js` — comment only.
- `routes/generateEnemy.js`, `generateClass.js`, `generateItem.js`,
  `generateSpell.js`, `generateSurvivor.js` — each lost its
  `handlePf2eXGenerate` function, its pf2e-specific `require()`s, and the
  `ruleset === "pf2e"` dispatch branch. `generateSpell.js`'s dispatch
  collapsed to a single `handle5eSpellGenerate` call (spells never had an
  Echoes/Generic branch to begin with) — the now-unused `getRuleset`
  import was removed with it.
- `routes/npcCombatant.js` — pf2e branch removed from the Combatant
  upgrade; the ruleset gate is now `5e`/`generic` only. The `level`/`role`
  request fields (pf2e-only) were dropped from the destructure since
  nothing reads them anymore.
- `routes/confirmEntry.js` — every pf2e writer import and every
  `ruleset === "pf2e"` branch across the enemies/classes/items/spells/
  survivors dispatch removed.
- `routes/generate.js` (NPC route) — pf2e's `DEFAULT_NPC_COMBAT_PROFILE_PF2E`
  import and both `ruleset === "pf2e"` branches (import path + fill/
  regenerate path) removed.
- `routes/wizard.js` — the `/wizard/set-ruleset` error message and a
  comment updated to reflect 3 valid rulesets instead of 4. The picker
  itself was already fully data-driven off `lib/rulesets/index.js`'s
  `listRulesets()`, so no separate hardcoded pf2e option existed to
  remove there.
- `lib/campaignEntryGenerators.js` — pf2e import + branch removed from
  `createNewNpc`'s default-combat-profile attachment.
- `lib/entryTemplate.js` — `pf2e` key removed from
  `COMBAT_PROFILE_RENDERERS`. A stray legacy NPC with
  `combatProfile.ruleset === 'pf2e'` (none should exist — see
  "Verification" below) now falls through to the existing `|| "./rulesets/5e/enemyTemplate"`
  default instead of a dedicated pf2e renderer, consistent with how
  every other unrecognized/legacy ruleset value already behaves here —
  not a new failure mode.
- `prompts/rulesets/generic/classContentPrompt.js` — comment only.
- `archive/classes/index.html`, `enemies/index.html`, `items/index.html`,
  `spells/index.html`, `survivors/index.html` — each page's ruleset
  dispatch (`initXGenerateForm`) no longer branches on `'pf2e'`.
  `enemies/index.html` and `spells/index.html` had their pf2e-only
  form-building functions (`wirePf2eEnemyForm`, `wirePf2eSpellForm`)
  deleted outright since nothing else used them.
  `items/index.html`'s `wirePf2eItemForm` was **renamed** to
  `wireGenericItemForm` rather than deleted — Generic Items always
  shared that exact form/handler with pf2e (identical `{name, faction}`
  body shape), so Generic needed it kept, just under an honest name.
- `archive/js/render.js` — `applySpellsNavVisibility()` and
  `renderNpcCombatantAction()` no longer check for `'pf2e'`. In
  `renderNpcCombatantAction()`, since the ruleset gate is now 5e-only,
  the level/role vs. target-CR field ternary collapsed to just the CR
  field (the only reachable branch left) and the pf2e-shaped
  `level`/`role` submission logic was removed with it.
- `archive/wizard-stats.html` — the fixed-ruleset-container visibility
  check and its explanatory note text no longer mention pf2e; three
  comments updated.
- `archive/licenses.html` — the "Pathfinder 2nd Edition" attribution
  section removed outright (it only ever said "not available yet, no
  ORC-licensed source found" — nothing left to attribute now that the
  ruleset itself is gone), and the intro paragraph's "5th Edition or
  Pathfinder 2nd Edition" wording trimmed to "5th Edition." **Not on the
  task's explicit file list**, but this is direct pf2e-removal content
  (an attribution page for a system that no longer exists), not adjacent
  scope — included per the "Also check" instruction to look at
  ruleset-conditional archive pages not already listed.
- `scripts/testNpcCombatProfile.js` — **not on the deletion list, but
  needed a fix**: it directly imported the now-deleted
  `lib/rulesets/pf2e/npcCombatDefaults.js` and asserted two pf2e-specific
  render checks. Removed the import and both `testPf2e*Render()`
  functions; the file was explicitly named in the task's shared-files
  list, so this was in scope, not a side trip.
- `prompts/rulesets/5e/spellContentPrompt.js` — one comment
  ("same reasoning as PF2e's Bestiary") referenced the now-deleted
  `prompts/rulesets/pf2e/enemyContentPrompt.js`'s header; reworded to
  stand alone.

**New migration:**
- `migrations/022_remove_pf2e.sql` — drops and re-adds
  `world_config_ruleset_check` as `CHECK (ruleset IN ('echoes', '5e',
  'generic'))`. Does **not** touch `migrations/020_ruleset_foundation.sql`
  (already applied, left alone per instructions) or `srd_library`'s own
  separate `ruleset IN ('5e', 'pf2e')` CHECK constraint — see "Flagged,
  not fixed" below for why that one was deliberately left alone.

**Changelog:** added a new bullet under `## Unreleased` in
`CHANGELOG.md` linking here, next to the original ruleset-genericization
entry (left unedited as the accurate historical record of what actually
shipped in that project).

## Flagged, not fixed (found while in here, out of scope for this session)

Per the task's explicit instruction to stop and note rather than
self-extend:

1. **`srd_library`'s own `ruleset` CHECK constraint still allows
   `'pf2e'`** (`migrations/020_ruleset_foundation.sql` line 65:
   `CHECK (ruleset IN ('5e', 'pf2e'))`). Harmless today — confirmed
   `scripts/ingestSrdPf2e.js` was never run (it's one of the files
   deleted this session, and it was "written but intentionally inert"
   per the original addendum), so no `srd_library` row has
   `ruleset = 'pf2e'` to begin with — but the constraint itself is now
   stale. The task's explicit migration instruction named only
   `world_config_ruleset_check`, so `migrations/022` doesn't touch this
   one. Worth a follow-up migration if anyone wants the schema fully
   consistent, but zero functional impact either way.
2. **`routes/npcCombatant.js`'s Combatant-upgrade UI in
   `archive/js/render.js` never actually supported the Generic ruleset**,
   even though the backend (`routes/npcCombatant.js`) has supported
   `5e`/`generic` since Phase 7/10 (confirmed: the route's ruleset gate
   was `ruleset !== "5e" && ruleset !== "pf2e" && ruleset !== "generic"`
   before this session, and `renderNpcCombatantAction()`'s frontend gate
   was only ever `ruleset !== "5e" && ruleset !== "pf2e"` — Generic was
   never wired into the UI). This predates pf2e removal and isn't caused
   by it; removing pf2e simply shrunk the already-Generic-less frontend
   gate down to 5e-only. Left exactly as found (not fixed, not widened)
   — flagging for whoever picks up Phase R2/R3 next, since it's exactly
   the kind of "system that predates or sits outside the ruleset
   project's dispatch pattern" gap the recovery plan is tracking.

Nothing else adjacent was touched — no Spells wizard toggle, no Import
button promotion, no Combatant AI-toggle gating, no procedural/manual
entry work. Those remain Phase R2/R3, per the recovery plan.

## Verification

- **`node -c` on every touched `.js` file** — all pass.
- **Full server boot test** — booted `server.js` with fake env vars
  (`SUPABASE_URL`/`SUPABASE_SECRET_KEY`/`SUPABASE_PUBLISHABLE_KEY`/
  `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`STRIPE_SECRET_KEY` all fake,
  no real DB reachable) — starts cleanly, `GET /version.js` returns 200.
  Confirms `lib/rulesets/index.js`'s registry `require()`s (and every
  route that requires it) resolve correctly with the pf2e key gone —
  a broken/missing require would have crashed at boot, per this repo's
  existing "fail loudly at startup, not silently at request time" design
  for the registry.
- **Test suite** — ran every `scripts/test*.js` that runs offline (per
  `CLAUDE.md`'s own description of which ones do):
  `test5eClassFormulas.js`, `test5eItemFormulas.js`,
  `test5eSpellFormulas.js`, `test5eStatFormulas.js`,
  `test5eSurvivorFormulas.js`, `testGenericStatFormulas.js`,
  `testNpcCombatProfile.js`, `testRefundLogic.js` — **all pass**.
  Confirmed the five `testPf2e*.js` scripts are gone from `scripts/`
  (not just failing) via `ls`. `testTenantIsolation.js` and the
  `testPipeline*`/`testEnemyPipeline.js` scripts need real Supabase/
  Anthropic/Gemini credentials this sandbox doesn't have, consistent
  with every prior session's same limitation — not run.
- **Headless-browser check** (Playwright + the real pre-installed
  Chromium, real server, stubbed Supabase auth client + intercepted
  `/api/*` responses so no real DB was needed):
  - Wizard's `/wizard/ruleset-options` response for a non-admin returns
    exactly `["5e", "generic"]` — never `pf2e`.
  - `archive/enemies/index.html` on a stubbed 5e world renders the real
    5e Mode selector (`#gen-mode`) via `initEnemyGenerateForm()`'s actual
    dispatch, with zero uncaught JS errors and zero occurrences of the
    string "pf2e" anywhere in the rendered page.
  - `archive/classes/index.html` on a stubbed Generic world renders the
    shared real-ruleset name+faction form, zero JS errors, zero "pf2e"
    in the rendered page.
  - `archive/js/render.js`'s `applySpellsNavVisibility()` correctly
    hides the Spells nav link for a Generic world and shows it for a 5e
    world (confirmed via computed style: `none` vs. non-`none`) — proves
    the spells-registry-entry check still works with pf2e removed from
    the condition.
  All of the above ran cleanly with no pf2e code path anywhere in the
  loop, satisfying the task's verification bar for a real browser check
  (not just static grep).
- **Full-repo grep sweep** for `pf2e`/`PF2e`/`PF2E`/`pathfinder`/
  `Pathfinder` after all edits: the only remaining hits are in
  `session_addendum_ruleset_genericization.md`,
  `session_addendum_ruleset_recovery_plan.md`, `world_forge_scope.md`,
  `migrations/020_ruleset_foundation.sql` (left alone per instructions —
  already applied), `CHANGELOG.md`/`SESSION_LOG.md` (historical
  devlog), and a handful of comments in `lib/rulesets/generic/*.js` /
  `lib/rulesets/5e/npcCombatDefaults.js` / `classFormulas.js` that
  compare their own design choice to pf2e's *by way of explaining why
  they're different* (e.g. "unlike 5e/pf2e's static default object, this
  one needs the world's own generic_system_json") — none of those files
  were on the task's removal list, none contain functional pf2e code or
  requires, and the comments read correctly as historical/comparative
  context even with pf2e gone, so they were left as-is rather than
  rewritten out of caution against unnecessary scope creep.

## Migration Austin needs to run

**`migrations/022_remove_pf2e.sql`** — apply by hand in the Supabase SQL
editor, same as every other migration in this repo (no runner). Tightens
`world_config`'s `ruleset` CHECK constraint to `('echoes', '5e',
'generic')`. Safe against existing data — every real world has always
been `echoes`/`5e`/`generic` in practice (pf2e was admin-testing-only,
per the recovery plan's own finding that "no real world has ever used
it"); the migration's own header includes a `SELECT` to run first if it
ever fails unexpectedly.
