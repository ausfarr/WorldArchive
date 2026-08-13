# Session Addendum: Ruleset Recovery Phase R4 — 5e Character-Sheet Completeness (shipped)

Closes out `session_addendum_ruleset_recovery_r4_5e_completeness_scope.md`.
Re-confirmed R3 (procedural + manual entry ruleset revamp) was already
shipped and merged to `main` before starting (`session_addendum_r3_procedural_manual_revamp_shipped.md`
exists, ruleset-dispatch patterns present in `lib/proceduralGenerators/5e.js`
and `archive/js/rulesetManualForms.js`) — building on a half-finished R3
was explicitly the failure mode this recovery effort exists to avoid.
Built on branch `claude/5e-character-sheet-r4-baywgz`, checkpointed with
one commit per phase rather than a single batch, per this project's own
established discipline.

Followed the 7-phase build order from the scope doc's own session
prompt. Did not self-extend past it — no phase below picked up unscoped
work; anything found along the way that looked like it deserved more is
flagged as a deviation or a follow-up note instead of just being built.

## Phase 1 — Items: 5e type picker

Contained, shipped as scoped. `archive/items/index.html`'s
`wire5eItemForm()` gained a TYPE dropdown (weapon/armor/wondrous/potion/
scroll/ring/rod/staff/wand/other, "Let it choose" default), threaded
through `POST /api/generate-item` → `handle5eItemGenerate` →
`buildHomebrewItemSystemPrompt`'s dynamic context. When set, the prompt
states "Target type: X (required)"; blank preserves the original
"choose one that fills a gap in the roster" behavior. Verified via a
direct prompt-string test (both branches present in the rendered system
prompt) and a server boot test.

## Phase 2 — PC/NPC derived-field completeness

Added to the 5e Player Character schema, all code-computed except skill
choice itself (genuinely a player choice in real 5e, so trusted from the
model after validation against the real 18-skill key list):

- **Skill proficiencies** — `lib/rulesets/5e/classFormulas.js`'s new
  `SKILLS` table (all 18, each with its governing ability).
- **Saving throw proficiencies** — the real 2-per-class list for all 12
  core classes (`SAVING_THROW_PROFICIENCIES`), resolved via
  `matchCoreClassName()` + `savingThrowProficienciesForClass()` — a
  homebrew class whose name matches a core class (e.g. "Frost Warden
  Ranger") gets that class's real saves; a genuinely original homebrew
  concept keeps whatever the model/table proposed, since there's no
  rules-book answer to look up for it. **This fix was applied at the
  root**, not just the PC layer: `routes/generateClass.js` itself now
  code-determines a new Class's saves the same way, replacing what used
  to be a pure model proposal.
- **Passive Perception** — `10 + WIS mod + (proficiency bonus if
  proficient in Perception)`.
- **Initiative bonus** — DEX mod, with a `featBonus` parameter reserved
  from the start for Phase 5 (so that phase didn't have to touch this
  formula again).

Applied identically across AI Homebrew (`routes/generateSurvivor.js`),
procedural (`lib/proceduralGenerators/5e.js`), and manual entry
(`archive/js/rulesetManualForms.js`, which duplicates the formulas
client-side per this project's no-build-step constraint — same
established pattern R3 used). NPC Combatant profiles were checked, not
assumed: `prompts/rulesets/5e/enemyContentPrompt.js` already carries
`savingThrows`/`skills`/`senses` (with passive Perception embedded) on
every Bestiary-shaped stat block, which NPCs inherit via the shared
"Combatant" upgrade pipeline — confirmed already correct, not touched.

New test coverage: `scripts/test5eClassFormulas.js` (real saving-throw
pairs for all 12 core classes, name-matching, fallback behavior, skills
list integrity) and `scripts/test5eSurvivorFormulas.js` (passive
Perception and initiative across several ability-score/proficiency
combos).

## Phase 3 — Race/Species reference system (Skills-pattern)

Shipped exactly to the scope doc's decision #1: a small, editable/
addable/removable reference pool, **not** a full content category (no
generation route, no procedural table entry, no portrait tie-in, no
wizard category-config toggle).

- `migrations/023_race_system.sql` — new `race_system_json` on
  `world_config`.
- `lib/rulesets/5e/starterRaces.js` — hand-authored starter list of the
  9 core PHB/SRD races (Human, Elf, Dwarf, Halfling, Dragonborn, Gnome,
  Half-Elf, Half-Orc, Tiefling). Ability score increases/sizes/speeds
  are well-established mechanical facts (hand cross-checked); trait
  descriptions are written in this project's own words describing the
  general mechanical concept, not copied SRD text — the same
  conservative treatment given to every other hand-authored table in
  this codebase, and deliberately cautious pending Phase 4's
  verification outcome (below).
- `routes/wizardRaceSystem.js` — GET (returns the world's own saved
  list, or the starter list as a live, not-yet-persisted default),
  POST `/wizard/generate-race` (AI generates ONE new race at a time,
  used for both "+ Generate a New Race" and a per-race "Regenerate"
  button — enforces the real SRD ability-score-increase budget of 3
  points via prompt instruction), POST `/wizard/save-race-system`.
- UI: a new "Races & Species" section on the Stats & Skills wizard step
  (`archive/wizard-stats.html`, inside the existing 5e-only
  `fixed-ruleset-container`), a live-pulled read-only World Info section
  (`archive/world-info.html`), and an optional Race dropdown on the 5e
  Player Character generation form and its manual-entry counterpart.
- A chosen race's ability score increase is applied server-side
  (`lib/rulesets/5e/survivorFormulas.js`'s `applyAbilityScoreIncrease()`)
  to the model-proposed base ability scores before HP/passive
  Perception/initiative are computed, so it always shows up in the final
  sheet. Manual entry records the race for reference/display only — a
  hand-typed ability score is already whatever final number the author
  wants, so auto-adding the bonus there would double-count it.

**Deviation, flagged:** the NPC generation form does **not** get a Race
dropdown, despite the scope doc listing "PC/NPC generation forms" for
this. NPCs stay Echoes-shaped narrative content with no ability-score
schema regardless of ruleset (confirmed unchanged in the R3 addendum) —
there's no numeric field for a race's ability bonus to apply to, so a
Race field there would be flavor-only and duplicate what NPCs' existing
free-text fields already cover. Judgment call, not an oversight.

## Phase 4 — 5e-database license verification

**Verification did not clear 5e-bits/5e-database as an ingestion
source.** Full method:

1. Cloned `5e-bits/5e-database` fresh (`git clone --depth 1`).
2. Located the official CC-BY-4.0 SRD 5.2 source: WotC published it via
   D&D Beyond (`https://www.dndbeyond.com/srd`, direct PDF at
   `media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf`).
   Both `dndbeyond.com` and `media.dndbeyond.com` are blocked by this
   session's network egress proxy — `EGRESS_BLOCKED` on every attempt
   (direct `curl` and `WebFetch` both), so the primary source PDF itself
   could not be fetched directly in this sandbox.
3. Found and used a reachable alternative: `your5e/5e-srd-markdown` (a
   GitHub mirror), which explicitly and correctly states "released under
   Creative Commons Attribution 4.0 International License (CC-BY-4.0)"
   with the full WotC-required attribution text baked into its own
   README, and includes the actual SRD 5.2.1 text converted to Markdown
   with "no changes... to the text, tables, or details." Cloned it
   fresh alongside the target repo.
4. Real side-by-side comparison, 9 verifiable data points across
   Equipment and Classes (Spells could not be sampled from `src/2024/` —
   see finding below):
   - **Equipment (5):** Longsword (1d8 slashing, Versatile→1d10, Sap
     mastery, 3 lb., 15 gp), Dagger (1d4 piercing, 2 gp, 1 lb.),
     Shortbow (1d6 piercing, 25 gp, 2 lb.), Chain Mail (AC 16, 75 gp,
     55 lb.), Studded Leather (AC 12+Dex, 45 gp, 13 lb.) — **all 5
     matched exactly** between `5e-bits/5e-database`'s
     `src/2024/en/5e-SRD-Equipment.json` and the verified CC-BY-4.0
     mirror's `Equipment/Weapons.md`/`Armor.md` tables.
   - **Classes (4):** Fighter hit die (d10) and primary ability
     (Str/Dex), Wizard hit die (d6) and primary ability (Int) — **all 4
     matched exactly** against the mirror's `Classes/Fighter/Fighter.md`
     and `Classes/Wizard/Wizard.md`.
5. **Two real findings, independent of the numbers matching:**
   - **Licensing labeling gap.** `5e-bits/5e-database`'s own `README.md`
     License section states: *"This project is licensed under the terms
     of the MIT license. The underlying material is released using the
     Open Gaming License Version 1.0a"* — a single blanket statement
     covering the ENTIRE repo, with **no mention of CC-BY-4.0 anywhere**
     (checked `README.md`, `LICENSE.md`, `CHANGELOG.md`, and searched
     for any per-directory `NOTICE`/`LICENSE` file specific to
     `src/2024/` — none exists). This directly contradicts the scope
     doc's own default-for-planning-purposes assumption that
     `src/2024/` is the CC-BY-4.0-safe copy. The underlying game NUMBERS
     genuinely do reflect the real CC-BY-4.0 SRD 5.2 content (confirmed
     above) — but the repository that would be the ingestion source
     never actually asserts that license for what it's shipping, which
     is exactly the kind of provenance gap this diligence pass exists to
     catch, the same bar already applied when the monster data currently
     in production was verified.
   - **Missing Spells data.** `src/2024/en/` has no `5e-SRD-Spells.json`
     at all — only `src/2014/en/` has one, and that directory is the one
     the repo's README explicitly and unambiguously labels OGL 1.0a
     (not in dispute). So even under the most charitable reading of the
     licensing question, Spells specifically could never have been
     sourced from "the CC-BY-4.0-safe `src/2024/` directory" the scope
     doc anticipated — that data simply isn't there yet, independent of
     the license question above.
6. **Verdict: inconclusive/fails, per the phase's own explicit
   fallback rule.** No ingestion script was built, nothing was written
   to `srd_library`, no production Supabase call was made (this sandbox
   has no reachable Supabase project regardless — same standing
   limitation every prior session in this project's history has hit).
7. **A real lead for a future phase:** `your5e/5e-srd-markdown` (used
   above for verification) is itself a properly, explicitly CC-BY-4.0-
   labeled mirror of the real SRD 5.2.1 text with correct attribution
   already written into its own README — a promising real source for a
   future R5 ingestion phase, unlike `5e-bits/5e-database`.

## Phase 5 — Mechanical Backgrounds + Feats (hand-authored fallback)

Per Phase 4's outcome, used the explicit fallback path: hand-authored
instead of ingested, flagged as temporary.

- `lib/rulesets/5e/backgroundsAndFeats.js` — the 13 core SRD backgrounds
  (Acolyte through Urchin — real skill-proficiency pairs and tool-
  proficiency assignments, well-established facts; equipment lists and
  feature descriptions written in this project's own original words,
  not copied text) and 10 well-known general feats (Alert, Athlete,
  Durable, Dual Wielder, Great Weapon Master, Lucky, Mobile, Resilient,
  Sentinel, Tough — same treatment).
- PC schema gains `backgroundKey` (validated against the real list,
  model-proposed since the concept fit is genuinely creative) and
  `featKey` (only meaningful once total character level reaches the
  first real ASI level — `ABILITY_SCORE_IMPROVEMENT_LEVELS[0]` from
  `classFormulas.js`, not a hardcoded `4` — defaults to `null`, "took
  the ASI instead," the real-play default).
- The existing narrative `background` field (1-2 sentences, "life
  before becoming an adventurer") was **kept, not replaced** — the
  mechanical `backgroundKey` is additive. The scope doc's "replace"
  wording was read as replacing the field's ROLE as the only background
  concept on the sheet, not as deleting existing narrative flavor text
  that already had its own purpose alongside the separate `backstory`
  field.
- `routes/reference5e.js` (new) — a lightweight, non-authenticated-
  beyond-normal-app-auth `GET /api/reference/5e/backgrounds-and-feats`
  so the manual-entry frontend can populate its dropdowns without
  duplicating ~150 lines of hand-authored text client-side (the one
  exception to `rulesetManualForms.js`'s usual small-table-only
  duplication rule — these lists are static/not per-world, unlike
  `race_system_json`).
- Applied across AI Homebrew, procedural (random background always;
  random feat ~50% of the time once level-eligible, mirroring the "took
  the ASI instead" real-play default), and manual entry.
- `survivorTemplate.js` renders a real Background section (skill
  proficiencies/tool proficiency/languages/equipment/named feature) and
  a Feat line when one was actually chosen.

## Phase 6 — Multiclassing

The biggest formula lift, saved for last as planned. Schema:
`classId`/`classLevel` (single class) → `classes: [{classId,
classLevel}]`, capped at 2 entries (the AI prompt's own instruction:
"almost always one class... only use a second entry for a genuinely
multiclassed character... never more than two").

- **HP** — `survivorFormulas.js`'s new `computeMulticlassHitPoints()`:
  only the character's very first level ever (`classes[0]`'s level 1)
  takes the max hit die; every level after that, in ANY class, takes
  that class's own fixed per-level average. `computeHitPoints()` now
  delegates to this as a 1-entry-array special case — verified
  identical output to the pre-Phase-6 single-class formula (a dedicated
  regression test asserts this).
- **Spell slots** — `classFormulas.js`'s new `multiclassSpellSlots()`:
  each class contributes independently to ONE shared pool (full casters
  count full level, half casters `floor(level/2)`, third casters
  `floor(level/3)`), summed and looked up in `FULL_CASTER_SPELL_SLOTS`
  — **the real Multiclass Spellcaster table is identical to the
  single-class full-caster table**, just keyed by combined level (a
  verified fact, not derived by approximation, cross-checked the same
  way every other table in `classFormulas.js` already is). Warlock's
  Pact Magic stays completely separate and additive (`pc.pactMagic`),
  never contributing to or drawing from the shared pool — a real,
  distinct 5e rule, implemented correctly rather than merged in.
- **Proficiency bonus** — confirmed keyed off TOTAL level (sum across
  all classes), not any single class's level, after the schema change.
- **Saving throw proficiencies** — come ONLY from `classes[0]` (the
  starting class); multiclassing into a second class does not add its
  saves, implemented correctly rather than unioning both classes' lists.
- Applied across AI Homebrew, procedural (stays intentionally
  single-class — a "roll for me" random generator has no player concept
  to decide WHY a character would multiclass, but every call is exactly
  one entry into the same shared multiclass-shaped formulas, not a
  parallel single-class code path, so it can never drift out of sync),
  and manual entry (two fixed class slots rather than a dynamic add/
  remove list — simpler and predictable for a rarely-used feature,
  still fully functional multiclassing).

New mandatory test coverage in `scripts/test5eSurvivorFormulas.js`,
every number hand-computed against the real published tables before
writing the assertion:
- **Fighter 3 (starting, d10, non-caster) / Wizard 2 (d6, full
  caster)**, CON 14 → HP 40, shared slots `[3,0,0,...]`, no Pact Magic.
- **Paladin 2 (starting, d10, half caster) / Warlock 3 (d8, Pact
  Magic)**, CON 14 → HP 41, shared slots `[2,0,0,...]`, Pact Magic
  `{slots:2, slotLevel:2}`.
- **Wizard 6 (starting, d6, full caster) / a third-caster class at
  level 3 (d10)**, CON 14 → HP 62, shared slots `[4,3,3,1,0,...]`.

`scripts/testProceduralRulesetGenerators.js`'s one PC-related assertion
was updated for the new `classes[]` shape and re-run 5x clean.

## Phase 7 — Encounter Difficulty / XP Budget calculator

Fully independent, pure math, no generation call.

- `lib/rulesets/5e/encounterDifficulty.js` — the real DMG per-character
  XP thresholds by level (1-20, Easy/Medium/Hard/Deadly, summed across
  the party for its total budget), the monster-count XP multiplier
  table (1 monster ×1 through 15+ monsters ×4), and the real party-size
  adjustment (small party <3 bumps the multiplier row up, 6+ drops it
  down). Reuses `statFormulas.js`'s existing `XP_BY_CR` table for the
  per-monster CR→XP conversion rather than duplicating it.
- `routes/reference5e.js` gains `POST /api/reference/5e/encounter-
  difficulty` (client supplies party levels + monster CRs — the Quest
  builder already has both hydrated client-side).
- Surfaced on the Quest builder (`archive/campaigns/builder.html`,
  `archive/js/campaignModule.js`) as a new panel, hidden entirely for
  non-5e worlds (checked against `/api/wizard/ruleset-options` —
  Echoes' Tier system and Generic have no CR/XP concept to compute
  against): manual party size + average level inputs, a "Use PCs From
  Archive" button that pulls real `totalLevel` values from this world's
  own Player Characters, and a difficulty readout checked against the
  Quest's own referenced Bestiary entries' real CR-derived XP.

New test coverage: `scripts/test5eEncounterDifficulty.js`, 24
assertions — party thresholds at single and mixed levels, the full
multiplier table, the party-size adjustment rule, CR→XP lookups
(including a fail-safe for an unrecognized CR string, which contributes
0 rather than throwing), and three full end-to-end scenarios (a Hard
4-vs-4 fight, a Trivial mismatch, and a Deadly solo-party encounter with
the small-party multiplier bump), every expected value hand-computed
against the real DMG tables before being written into the assertion.

## Verification

- **`node -c` syntax check** on every modified/new `.js` file, every
  session. Inline `<script>` blocks inside touched `.html` pages were
  extracted and syntax-checked the same way (no build step in this repo
  means HTML pages can't be checked directly).
- **Server boot test** with dummy env vars after each phase — clean
  start every time, unauthenticated hits against every new/touched
  route confirmed 401 (middleware runs) rather than 404/500.
- **Full regression suite** re-run after every phase:
  `scripts/test5eStatFormulas.js`, `test5eClassFormulas.js`,
  `test5eItemFormulas.js`, `test5eSpellFormulas.js`,
  `test5eSurvivorFormulas.js`, `test5eEncounterDifficulty.js` (new), and
  `scripts/testProceduralRulesetGenerators.js` (the real end-to-end
  procedural + write-path suite against an in-memory Supabase fake, R3's
  own test harness) — re-run 5x clean after Phase 6's schema change to
  catch randomized-pick edge cases, same discipline R3 established.
- **No real Supabase project reachable in this sandbox** (`SUPABASE_URL`
  unset, same standing limitation every prior session in this project's
  history has hit — see R3's own addendum) — every claim above about
  route wiring, formula correctness, and write-path behavior is verified
  via the test scripts' in-memory fake and direct hand-computation, not
  a live database. **No production Supabase writes were made or
  attempted** — `migrations/023_race_system.sql` needs to be run by hand
  against the real Supabase project before Race/Species will work in
  production, per this project's standing "migrations are additive and
  manual" convention.
- **Headless-browser pass** (real Chromium via `playwright-core`,
  temporarily installed with `--no-save` and removed afterward — not a
  project dependency — against the real running Express app with dummy
  env vars, same established sandbox pattern R3's own headless-browser
  verification used: `/config.js`, the Supabase CDN script, and the
  handful of `/api/*` calls each page needs stubbed via route
  interception, not committed to the repo). **10/10 assertions passed**:
  - 5e Items: the new TYPE dropdown renders with all 10 real types
    (weapon/armor/wondrous/potion/scroll/ring/rod/staff/wand/other) plus
    "Let it choose."
  - Wizard Stats: all 9 starter races render as real editable cards with
    their real names, and "+ Add Race" adds a genuinely new blank card
    (confirmed the DOM count increments).
  - Survivors (PC) generation form: the RACE dropdown is populated with
    all 9 starter races plus "Not specified."
  - Quest builder: the Encounter Difficulty panel is visible for a
    5e-ruleset world and confirmed **hidden** for an Echoes-ruleset world
    (the ruleset-gating actually works, not just present in the markup).
  - World Info: a real "Races & Species" section renders with real
    starter-race content (ability score increases, traits, flavor text
    all present and readable).
  
  **Not covered by this pass** (would need a real Supabase-backed world,
  which this sandbox doesn't have): submitting the AI-generation forms
  and confirming a real Claude response round-trips correctly into a
  saved PC with race/background/feat/multiclass applied; the manual
  entry form's full save flow; the Encounter Difficulty panel's actual
  compute-and-render step (needs real Bestiary/Survivor entries to
  react against). Formula correctness for all of that is independently
  confirmed by direct hand-computation (above) — what's not confirmed is
  the live network round-trip through a real Claude call and a real
  database write, the same standing gap every prior addendum in this
  project's history has carried forward, since no session so far has had
  a reachable production-equivalent Supabase project to test against.

## The "done" matrix — final state

| Phase | Item | Status |
|---|---|---|
| 1 | Items 5e type picker | **Shipped**, verified via prompt-string test |
| 2 | Skill/save proficiencies, passive Perception, initiative | **Shipped**, code-determined, tested |
| 3 | Race/Species reference system | **Shipped**, Skills-pattern, NOT a category |
| 4 | 5e-bits/5e-database license verification | **Verification complete — source NOT cleared**, documented above |
| 4 | Real SRD ingestion (Spells/Items/Classes/Feats/Backgrounds) | **Not built** — correctly gated on Phase 4, which didn't pass |
| 5 | Backgrounds + Feats | **Shipped**, hand-authored fallback, flagged for upgrade |
| 6 | Multiclassing | **Shipped**, real HP/slot/saves rules, tested against 3 hand-verified pairs |
| 7 | Encounter Difficulty calculator | **Shipped**, real DMG math, 24 tests |

## Explicitly flagged, not fixed / not built

- **NPC Race dropdown** — deliberately not built (Phase 3 section
  above has the full reasoning).
- **Real SRD-sourced Backgrounds/Feats** — blocked on a real ingestion
  phase from a properly-licensed source; `your5e/5e-srd-markdown` is a
  concrete lead for that future work.
- **Real end-to-end browser verification against a live app with a real
  database and real Claude calls** — this session's headless-browser
  pass confirmed every new UI element renders and behaves correctly
  (see Verification above), but not the full round-trip through a real
  AI generation call and a real Supabase write, which no session in this
  project's history has had a reachable environment to test.
- **Manual multiclass entry is 2 fixed slots, not a dynamic list** — a
  deliberate scope trim matching the AI-generation path's own 2-class
  cap, not a limitation anyone hit and had to work around.

## Suggested next session

- A real R5: pick up the `your5e/5e-srd-markdown` lead from Phase 4,
  verify it as a source the same rigorous way, and if it clears, ingest
  real Spells/Equipment/Classes/Feats/Backgrounds into `srd_library` —
  this would let Phase 5's hand-authored Backgrounds/Feats (and Items'
  Homebrew-only tier) upgrade to real Import/Reflavor.
- Run `migrations/023_race_system.sql` against production Supabase
  before Race/Species is usable by real worlds.
- A real browser click-through pass against the deployed app (or the
  closest available sandbox with a real browser + real Supabase) —
  the standing recommendation from every addendum in this project's
  history, still not closed.
