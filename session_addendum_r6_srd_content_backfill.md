# Session Addendum: R6 — Real SRD Backgrounds/Species/Feats + Magic Items + R5 Doc Backfill (shipped)

Built on branch `claude/r6-srd-content-backfill-1wzz1k`, checkpointed
with one commit per phase, stopping for review after each — same
discipline R4/R5 established. Read `session_addendum_r4_5e_completeness_shipped.md`
and reconstructed R5's history from its real commits (see
`session_addendum_r5_srd_ingestion_and_import_fixes.md`, written as part
of this session's Phase 5) before starting Phases 1–4.

**The single most consequential finding of this session is in Phase
0, and it changes the premise the whole session was scoped under: this
session's Supabase access does not actually work.** Read that section
before anything else — it explains why Phases 1–4 below were built and
verified entirely offline, contrary to the original plan.

## Phase 0 — Connectivity check + migration-state verification

**Real finding: Supabase is network-blocked in this sandbox, not just
unreachable-by-omission.** `SUPABASE_URL`/`SUPABASE_SECRET_KEY` were
both present and correctly read by `lib/supabaseClient.js` — this
genuinely is the first session in this project's history to have real
credentials. But every connection attempt to the project host
(`urtixpjyhhqcpzypvbni.supabase.co:443`) was rejected at the network
layer:

```
CONNECT urtixpjyhhqcpzypvbni.supabase.co:443 → 403
```

The session's egress proxy status endpoint confirms this is a policy
denial (`"connect_rejected" — "gateway answered 403 to CONNECT (policy
denial or upstream failure)"`), not a credentials problem or a wrong
project. Later, once dependencies were installed, the real
`@supabase/supabase-js` client surfaced a clearer message for the same
block: `"Host not in allowlist: urtixpjyhhqcpzypvbni.supabase.co. Add
this host to your network egress settings to allow access."` — this
environment's outbound network policy simply does not include the
Supabase host, regardless of what credentials are present.

**This means the migration-state checks Phase 0 was scoped to run
(real disposable inserts to confirm `022`/`023`/`024` are live) could
not be performed.** Per this session's own instruction not to retry or
route around policy denials, no workaround was attempted. GitHub raw
content (`raw.githubusercontent.com`) *was* reachable, so Phase 1's
ingestion source was never in question — only the write destination.

Given the choice of pausing entirely, whitelisting the host, or
proceeding with the established offline-test pattern every prior
session in this project's history has used (in-memory Supabase fakes,
`node -c`, server boot tests, real-source-but-local-write simulations),
Austin chose to proceed offline. Every phase below reflects that:
**built and thoroughly verified, but not one write in Phases 1–4
actually reached production this session.**

**Migration state, as of this session: still unconfirmed.** Source-level
facts (all three are additive/idempotent per their own header comments,
but "written" is not "run"):
- `migrations/022_remove_pf2e.sql` — tightens `world_config`'s ruleset
  CHECK to drop `pf2e`.
- `migrations/023_race_system.sql` — adds `world_config.race_system_json`
  (`ADD COLUMN IF NOT EXISTS`).
- `migrations/024_spells_category_check.sql` — adds `'spells'` to
  `entries.category`'s CHECK constraint (R5 Phase 1, drop+re-add).

None of these could be confirmed live this session. **Austin needs to
run all three by hand in the Supabase SQL editor if he hasn't already**
(and confirm `022` specifically, since it predates even R5).

## Phase 1 — Ingest real SRD Backgrounds + Species

New `scripts/ingestSrdOrigins5e.js` parses `character-origins.md` — the
one file in `downfallx/dnd-5e-srd-markdown` R5's ingestion never
touched. Writes new `srd_library` categories `'backgrounds'`/`'species'`
(no migration needed, same precedent R5 already set for
`'feats'`/`'magic-items'` — no CHECK constraint on that column).

**Two real findings from directly fetching and parsing the live
source**, not assumed from the scoping prompt:
- **Only 4 backgrounds exist in the free SRD** (Acolyte, Criminal,
  Sage, Soldier), not the 16 a full Player's Handbook has. Confirmed
  via file size (17,267 bytes, matching the repo's own stated size —
  not a truncated fetch) and `character-creation.md`'s own prose
  acknowledging the SRD is a GM-extensible subset. Species count (9)
  matched the scoping assumption exactly.
- **Species carry no ability score increase in the real 2024 rules** —
  that mechanic moved to Background. Confirmed no species entry has any
  ability-score field in the source at all.

`scripts/verifySrdOriginsIngest.js` (offline-default, `--live` flag):
30/30 checks pass against a live re-fetch of the real source.

Since this session's Supabase access is blocked, the ingestion script
was written and thoroughly verified against the real source but **never
actually run against production**. New `routes/adminIngestSrdOrigins.js`
(wired into `server.js`) lets Austin trigger it from the deployed app,
which has real network access — the same reason `adminIngestSrdFull.js`
existed for R5's ingestion.

## Phase 2 — Wire real SRD Species into the Race/Species reference system

New worlds' Race/Species pool now seeds from the real 9 ingested species
instead of `lib/rulesets/5e/starterRaces.js`'s hand-authored list, via
new `lib/rulesets/5e/raceSystemSeed.js`'s `getSeedRacePool()` — tries a
real `srd_library` read, falls back to the starter list on any failure.
`starterRaces.js` is kept, not deleted. **That fallback path is not
theoretical — it's what actually ran every single time this session
touched it**, given Phase 0's finding.

Resolved the ability-score-increase tension Phase 1 surfaced: real 2024
species genuinely grant no ability bonus, so
`lib/rulesets/5e/srdSpeciesMapper.js` produces `abilityScoreIncrease: {}`
— confirmed safe against the existing `applyAbilityScoreIncrease()`
formula (a true no-op), not a silently-dropped mechanic. Also
normalized `size` (descriptive SRD text → the UI's Small/Medium
picklist, with Human/Tiefling's genuine player's-choice-size preserved
in `choiceNote`) and `speed` (text → plain number).

New `scripts/test5eRaceSystemMapper.js`: 15/15 checks, including a live
exercise of the real fallback path against this session's actual
network-blocked Supabase (not simulated — it really failed and really
fell back, logged in the test output).

Verified: `node -c`, server boot test, full regression on existing 5e
formula suites, and a headless Chromium pass that let
`wizard-stats.html` run its own real init flow (fetch → assign →
render) against a stubbed `/api/wizard/race-system` response shaped
like real data.

## Phase 3 — Real SRD Backgrounds (2024 Origin Feat mechanic) + real SRD Feats

The real 2024 mechanic: a Background grants one specific named **Origin
Feat** immediately at level 1, deterministically (Acolyte → Magic
Initiate, Criminal → Alert, Sage → Magic Initiate, Soldier → Savage
Attacker) — separate and additive from the existing optional General
Feat at real ASI levels (R4 Phase 5's mechanic, unchanged, now sourced
from the real 17 ingested Feats instead of 10 hand-authored ones).

New `lib/rulesets/5e/srdBackgroundMapper.js`/`srdFeatMapper.js` parse
the real free-text fields (skill names back into this codebase's
18-skill-key vocabulary; each feat's combined category/prerequisite
string into real fields) — and caught a real bug before it shipped: a
`\b`-anchored "Repeatable" detection regex silently failed against the
source's `_Repeatable._` markdown italics (a literal underscore is a
`\w` character, so there's no boundary between `_` and `R`); fixed to a
trailing-only `\b`.

New `lib/rulesets/5e/backgroundsAndFeatsSeed.js` joins the two real
lists and exposes `eligibleAsiFeats()` — the ASI-level pool, which
excludes Epic Boon feats below level 19 and excludes a PC's own
Background-granted Origin Feat from its ASI-level pool **unless** that
feat is Repeatable (Magic Initiate/Skilled are, per the real SRD text —
so Acolyte can legally pick Magic Initiate again at an ASI level, but
Criminal can't double up on the non-repeatable Alert).

Old `lib/rulesets/5e/backgroundsAndFeats.js` (`CORE_BACKGROUNDS`/
`CORE_FEATS`) kept as an offline fallback, with an honest asymmetry
documented rather than papered over: the old lists predate the Origin
Feat mechanic entirely, so every fallback background's `originFeat` is
`null` — a real degraded mode, not a bug.

Wired through every consumer: AI Homebrew generation
(`routes/generateSurvivor.js`), procedural generation
(`lib/proceduralGenerators/5e.js`), the manual-entry reference route
(`routes/reference5e.js`), and `lib/rulesets/5e/survivorTemplate.js`
(renders Ability Scores + Origin Feat + a CC-BY-4.0 attribution line,
replacing the old invented "background feature" text that was never a
real 2024 mechanic).

New `scripts/test5eBackgroundFeatMapper.js`: 20/20 checks, covering the
Origin Feat grant for all 4 real backgrounds (not just the minimum 3
this project's own rule required), the category/prerequisite parser,
the Epic Boon level gate, and the repeatable-vs-non-repeatable dedup
logic.

Verified: `node -c`; full regression (all existing `test5e*.js` suites,
`testProceduralRulesetGenerators.js` re-run 5x clean per this project's
randomized-pick discipline); server boot test; headless Chromium pass
confirming the Survivors manual-entry form's own real fetch flow
renders the real background/feat dropdowns.

## Phase 4 — Wire the 260 real SRD Magic Items into Items' Import tier

Root cause confirmed exactly as scoped: R5 Phase 5 wired Items' Import
picker against `srd_library.category = 'items'` (mundane equipment)
only. `itemTemplate.js` already had a complete rarity/attunement
schema (built for the Homebrew tier) — the actual gap was
`routes/generateItem.js` hardcoding `rarity: null, requiresAttunement:
false` for **every** Import/Reflavor item regardless of source
category, silently correct for mundane equipment and silently wrong
for a real Magic Item.

Fixed by extending `lib/rulesets/5e/srdItemMapper.js`'s
`mapSrdItemMechanics()` to resolve real rarity (already a direct
column) and attunement (parsed from the row's `typeLine`, e.g.
`"Wondrous Item, Rare (Requires Attunement by a Spellcaster)"`) for any
`data_json` carrying a `rarity` field. Magic items' `itemType` strings
(`"Wondrous Item"`, `"Weapon (Battleaxe, Greataxe, or Halberd)"`, etc.)
never collide with mundane equipment's literal lowercase
`"weapon"`/`"armor"` values, so they cleanly fall through to the
existing generic branch — confirmed by direct inspection of all ~258
real rows, not assumed.

**Second real bug found and fixed while verifying the prompt's own
"does the dispatch need only an extended srdLibraryId lookup" caution
— it needed more:** the Regenerate-recovery fallback was hardcoded to
the `'items'` category, which would silently fail to recover a Magic
Item's `srdLibraryId` on Regenerate (`srd_id` is only unique *within* a
category, not globally). Fixed by stamping a new `srdSourceCategory`
field onto every Import/Reflavor item at creation time (defaults to
`'items'` for entries saved before this phase existed) and using it for
recovery instead of guessing.

`archive/items/index.html`'s picker now fetches both categories (two
calls — `routes/srdLibrary.js` takes one category per request, no
backend change needed) and renders two `<optgroup>`s, Magic Items
showing real rarity in the option label. CC-BY-4.0 attribution needed
zero new code — `srdLicenseNote` was already stamped regardless of
category and `itemTemplate.js` already renders it.

**Found and flagged, not fixed (explicitly out of scope — this
session's own "don't touch `ingestSrd5e.js`/`ingestSrd5eFull.js`"
instruction):** `scripts/verifySrd5eFullIngest.js` (a *different* file,
R5's own verify script) imports `parseWeapons`/`parseArmor`, which
don't exist — `ingestSrd5eFull.js` only ever exported the combined
`parseWeaponsAndArmor`. Confirmed via `git stash` that this predates
this session entirely; the script has apparently never run to
completion. Separately, live re-parsing during this session's testing
showed Spells/Classes now returning `null` for `level`/`school`/
`hitDie`/`primaryAbility` against the *current* live source — this
looks like upstream source-format drift since R5 shipped, not a bug
introduced here. Neither issue touches Magic Items (extensively
re-verified this phase) or Backgrounds/Species/Feats (independently
re-verified in Phases 1–3). **Worth a dedicated follow-up session** to
confirm and fix, since it means R5's Spells/Classes SRD data may be
stale or partially broken in ways no one has caught yet.

New `scripts/test5eMagicItemMapper.js`: 15/15 checks against the real
full corpus (all ~258 magic items, not a sample) — rarity resolved for
100%, and the `requiresAttunement` count matches the raw source's
"Requires Attunement" text count exactly.

Verified: `node -c`; full regression; an offline end-to-end simulation
of a real Import request (mocked `srd_library` row → mapper → item
object → rendered HTML) confirming rarity/attunement/
`srdSourceCategory`/license note all flow through; server boot test;
headless Chromium pass confirming the real picker UI.

## What this session established that no prior session could

Every previous addendum in this project's history (R1 through R5) notes
some version of "no reachable Supabase project in this sandbox" as a
standing limitation. This session had real credentials for the first
time — and the real finding is that having credentials isn't the same
as having network access. **The actual capability this session
establishes for the future is narrower than originally scoped: a
documented, reproducible way to detect and prove a Supabase network
block from inside a session** (the proxy status endpoint's
`recentRelayFailures`, plus the real client's own clearer "Host not in
allowlist" error once dependencies are installed) — not, as originally
hoped, a working live-fixture-testing capability. **A future session
with an environment whose egress policy actually allows the Supabase
host** would be the first to exercise this project's `scripts/testTenantIsolation.js`-style
disposable-fixture pattern against Phases 1–4's real code paths
end-to-end. That has still never happened for this project's ruleset
work, R1 through R6.

## The "done" matrix — final state

| Phase | Item | Status |
|---|---|---|
| 0 | Connectivity check | **Blocked** — Supabase network-blocked in this sandbox, confirmed via proxy diagnostics |
| 0 | Migration state (022/023/024) | **Unconfirmed** — could not verify live; source-level facts documented above |
| 1 | Real SRD Backgrounds + Species ingestion script | **Shipped**, verified offline against real source, **not run against production** |
| 2 | Race/Species pool seeded from real Species | **Shipped**, fallback path proven live (network-blocked this session) |
| 3 | Real Backgrounds + Origin Feat mechanic + real Feats | **Shipped**, 20/20 new tests, all consumers wired |
| 4 | 260 real Magic Items wired into Items Import | **Shipped**, 15/15 new tests, 2 real bugs found and fixed |
| 5 | R5 doc backfill + this addendum | **Shipped** |

## Explicitly flagged, not fixed / not built

- **Migration state for 022/023/024 remains unconfirmed** — Austin
  needs to check/run all three by hand.
- **Phases 1–4's writes were never actually made against production** —
  the ingestion script (Phase 1) and every "real disposable-fixture"
  verification the original scope called for were built and verified
  offline instead, because the write destination itself was
  unreachable. `routes/adminIngestSrdOrigins.js` is the real path to
  closing that gap (same pattern R5 already established for its own
  ingestion).
- **`verifySrd5eFullIngest.js`'s broken imports + possible Spells/Classes
  source drift** (Phase 4) — confirmed pre-existing, flagged for a
  dedicated follow-up, not fixed here (out of this session's stated
  scope).
- **`world_forge_scope.md` is stale, but not in the way this session was
  scoped to expect.** The scoping prompt described a header "dated
  2026-07-21, describing a single-user tool" — that specific text does
  not actually exist in the file (checked directly: no date stamp
  anywhere in it, no single-user framing; `git log` shows its last real
  commit was 2026-08-13, the same day as R5). The genuine staleness
  found instead: the file's own "R5 — SRD ingestion unblocked,
  Import/Generate split" section is headed **"(planned, not yet
  built)"**, but R5 has since fully shipped (six phases + two
  follow-ups, see `session_addendum_r5_srd_ingestion_and_import_fixes.md`)
  and this R6 session has now shipped on top of it. The Phase-status
  table above it (Phases 1–14) also predates both R5 and R6 entirely.
  Flagged per this session's own instruction not to fix it — a full
  rewrite is a separate task, and should fold in the real state of both
  R5 and R6, not just correct the one stale header.
- **A real browser click-through against the live deployed app** — still
  not done, same standing item every addendum in this project's history
  has carried forward.

## What Austin still needs to do by hand

- **Run `migrations/022_remove_pf2e.sql`, `023_race_system.sql`, and
  `024_spells_category_check.sql`** in the Supabase SQL editor if they
  haven't already run — this session could not confirm any of the
  three.
- **Run the real ingestion**: trigger `GET /api/admin/ingest-srd-origins-5e`
  (Phase 1) while signed in as the admin account, from the deployed app
  — this session could write the script but never reach production to
  run it.
- **Consider whether this environment's egress policy should allow the
  Supabase project host** for future sessions that need real
  database-backed verification — otherwise every future session
  inherits this same offline-only constraint.
- No new migration is needed for Phases 1–4's `srd_library` categories
  or the new `srdSourceCategory` entry field (JSON, no schema change).

## Suggested next session

- A real R7: once a session has actual Supabase network access, re-run
  Phases 1–4's verification for real against production — ingest for
  real, create a disposable test world/user, confirm Species/
  Background/Magic-Item wiring against live data, clean up.
- Investigate and fix `verifySrd5eFullIngest.js`'s broken imports and
  the apparent Spells/Classes source-format drift flagged in Phase 4.
- A full rewrite of `world_forge_scope.md`'s stale header/description.
- The standing "real browser click-through against the live deployed
  app" item, still open since R3.
