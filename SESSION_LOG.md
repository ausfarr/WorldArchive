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

**5e — resolved, real data ingested.** The scope doc's own suggested
starting point (5e-bits/5e-database) does NOT check out as CC-BY-4.0:
fetched its actual `LICENSE.md` and `README.md` directly — both license
the underlying game data under **OGL 1.0a**, not CC-BY-4.0 ("The
underlying material is released using the Open Gaming License Version
1.0a"). OGL 1.0a is a different, more restrictive license than what this
project's scope requires, with real ongoing legal ambiguity after
Wizards' disputed 2023 "deauthorization" attempt. Checked every other
community 5e-SRD-JSON project findable by search
(`BTMorton/dnd-5e-srd`, `soryy708/dnd5-srd` — itself a 5e-bits fork,
`vorpalhex/srd_spells` — archived, explicitly OGL) — all OGL 1.0a, none
CC-BY-4.0.

Found and verified `Tabyltop/CC-SRD` instead: its `README.md` states
plainly it's a direct conversion of Wizards' official SRD 5.1, "licensed
under the Creative Commons Attribution 4.0 International License," with
the exact WotC-mandated attribution text included verbatim (now
reproduced in `scripts/ingestSrd5e.js`'s `LICENSE_NOTE` and
`archive/licenses.html`). Cloned the repo directly
(`github.com/tabyltop/cc-srd`) and confirmed the license text is also
embedded as the first record inside its own JSON. Spot-checked the
Goblin entry against the real SRD stat block (AC 15 leather+shield, HP 7
(2d6), STR 8/DEX 14/CON 10/INT 10/WIS 8/CHA 8, Nimble Escape, Scimitar
+4 1d6+2, Shortbow +4 80/320 1d6+2, CR 1/4 50 XP) — exact match. Also
confirmed Ancient Red Dragon parses to CR 24 correctly. 201 monsters
total ("hundreds," per the checkpoint).

**Gap: Classes/Spells/Items not ingested.** Tabyltop's repo only ships
structured (per-item) JSON for monsters — everything else in the SRD is
one large text/HTML document dump, not per-spell/per-class/per-item
records. No other verified CC-BY-4.0 structured dataset for those
categories was found in the time available. Turning the full-text SRD
dump into structured spell/class/item rows needs a real parser against
SRD formatting conventions — genuine follow-up engineering work, not a
quick add. `scripts/ingestSrd5e.js` only implements `ingestMonsters()`
for now; its header comment documents this gap in full. **Deferred to a
future session**, not silently dropped.

**PF2e — BLOCKED, not ingested, deliberately.** This project's scope
requires ORC-licensed content specifically (not Paizo's Community Use
Policy, a separate, more restrictive fan-content license). The most
complete structured PF2e dataset found, `Pf2ools/pf2ools-data`,
explicitly reproduces Paizo's rules text under **CUP**, not ORC — its own
README's Legal section says so outright ("Content published by Paizo
Inc. is reproduced in accordance with the Community Use Policy"). CUP
terms are typically incompatible with a paid commercial product
(non-commercial-use / revenue-cap restrictions are standard for this
class of fan-content policy) — using it here would create exactly the
legal exposure this project's scope doc warns about.

Could not reach `paizo.com` at all from this sandbox's network egress
policy (hard-blocked by the environment, not a 404), so Paizo's own
`/licenses` page — the authoritative source for what Paizo has actually
released under ORC vs. CUP — could not be checked directly. Every
secondary source found via search describes real complexity/controversy
around ORC's practical scope for Paizo's own content (one search result
mentioned Paizo *prohibiting* ORC licensing on its own Pathfinder
Infinite community platform, which cuts against the assumption that
Paizo's own rules text is straightforwardly ORC-redistributable).

**Decision: do not guess.** `scripts/ingestSrdPf2e.js` is written but
intentionally inert — it exits with an explanation instead of ingesting
anything. `archive/licenses.html` says plainly that no verified PF2e
canonical source exists yet. This is the one item this session is
flagging as a real open question rather than resolving — **Austin (or a
lawyer) needs to check paizo.com/licenses directly** (or ask Paizo)
whether Player Core/GM Core/Monster Core rules TEXT is itself released
for redistribution under ORC, as opposed to ORC just being a legal
template Paizo published for OTHER publishers' own original content —
those are different things, and the difference is exactly what
determines whether Phase 9 (Pathfinder 2e) can ever get a canonical
import library or stays Homebrew-only indefinitely.

**Footer attribution**: added a "Content Licenses" link to the footer of
all 14 `archive/*.html` pages (bulk edit, `.footer-license-link` in
`css/style.css`), pointing at the new `archive/licenses.html`. Checkpoint
screenshots taken (licenses page renders correctly; wizard Step 1's new
Ruleset field lays out correctly — its `<select>` is empty in the
screenshot only because this sandbox has no real Supabase project for
`/api/wizard/ruleset-options` to hit, expected per the Pre-flight notes
above).
