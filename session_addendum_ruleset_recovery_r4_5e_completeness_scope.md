# Session Addendum: Multi-Ruleset Recovery Plan — Phase R4 (5e Character-Sheet Completeness)

Planning-only — **no code shipped.** Written up per this project's own
"scope doc first, then build" convention (the same rule
`session_addendum_ruleset_recovery_plan.md` re-established after the
original ruleset project self-extended twice without review). No build
session should start from this doc until Austin says he's ready and a
quick check-in confirms the phase order below still holds.

## Where this fits in the recovery plan

- **R0 (DB unblock) — done.** Migrations applied, `entries_category_check`
  updated for `spells`, `scripts/ingestSrd5e.js` run for real,
  `srd_library` populated. Treat as resolved; ignore earlier notes
  assuming otherwise.
- **R1 (PF2e removal) — done**, shipped as
  `session_addendum_pf2e_removal_shipped.md`.
- **R2 (small fixes) — in progress**, being handled separately.
- **R3 (procedural + manual entry ruleset revamp) — next up**, not this
  doc.
- **R4 (this doc) — new phase.** Surfaced from a live gap-audit against
  real 5e rules (not a bug report): the working parts of the 5e ruleset
  (CR math, leveling, SRD monster import) are genuinely solid, but a
  Player Character sheet is missing pieces a player would notice
  immediately at a real table. Also folds in one contained UX gap
  (Items' missing type picker) and a new-data-source investigation that
  unblocks future Import/Reflavor work.

## Decisions locked this session

### 1. Race/Species — Skills-pattern, not a new category

Austin's call: keep it consistent with how Skills already solves the
same shape of problem (a small, fixed-ish, editable/importable reference
pool other generators draw from) rather than standing up a 9th full
category with its own nav link, index page, AI/procedural/manual/
portrait/confirm dispatch, and wizard toggle — real building for content
that doesn't behave like NPCs/Items/etc. (a handful of races per world,
not hundreds of unique generated instances).

**Shape**, mirroring `migrations/005_skill_system.sql` /
`skill_system_json`:
- New `race_system_json` on `world_config` (or folded into an existing
  ruleset-config column — decide at real scoping time): a list of
  `{ key, name, abilityScoreIncrease, size, speed, traits: [{name,
  description}], flavor }` entries.
- Populated either by importing the SRD race list (once the data-source
  question below is resolved) or hand-authored/edited per world, same
  "generate for me" + manual-edit pattern the Skills wizard step already
  has.
- **Consumed by:** a new World Info reference section (same "live-pulled
  on every load" pattern as the existing Attributes/Skills sections), and
  an optional dropdown on the PC/NPC generation forms for 5e worlds —
  NOT required, since not every NPC needs a stated race.
- **Not built:** no dedicated generation route, no procedural table entry,
  no portrait tie-in, no wizard category-config toggle. This is
  deliberately cheaper than a category.

World Lore's existing "Peoples" section (Step 3) stays the narrative home
for culture/lineage storytelling; this system is the mechanical
complement, same split as Stat System (mechanics) vs. World Lore
(narrative) already established.

### 2. New 5e content source: `5e-bits/5e-database`, pending a real license check

Solves the exact blocker flagged in `session_addendum_ruleset_recovery_plan.md`'s
open items and re-confirmed in `SESSION_LOG.md`'s "Re-investigating the
5e Import/Reflavor gap" section: Tabyltop/CC-SRD only ever shipped
structured JSON for monsters (201 entries) — everything else was a raw
PDF-text dump. `5e-bits/5e-database` (backs `dnd5eapi.co`) ships clean,
separately-typed JSON for Spells (319), Equipment (237), Classes (12),
Subclasses, Feats, Backgrounds, Magic Items, and Races/Species — plus a
second full copy under `src/2024/` for the SRD 5.2 revision.

**Action item, blocking before any ingestion script is written:** the
repo's own README labels its content "Open Gaming License Version
1.0a," not CC-BY-4.0 — different from the license already verified for
the monster data currently in use. Do the same diligence that went into
confirming the monster CC-BY-4.0 status: a real side-by-side text
comparison of a sample of `src/2024/en/` entries against WotC's official
CC-BY-4.0 SRD 5.2 release before treating this as a safe source. Default
assumption for planning purposes is that `src/2024/` (2024 revision) is
the CC-BY-4.0-safe copy and `src/2014/` is not — confirm, don't assume,
before ingesting either.

**Unblocks (once verified):** real Import/Reflavor for Spells, Items,
Classes/Subclasses, Feats, Backgrounds — likely its own phase (R5) once
this lands, not built as part of R4 itself.

### 3. Items — add the missing 5e type picker

Root cause (confirmed by reading the code, not a regression): 5e's item
form was built assuming `itemType` is model-chosen ("fills a gap in the
roster"), unlike Echoes' form where category is a direct user input.
`routes/generateItem.js`'s `handle5eItemGenerate` only ever reads
`name, faction, fillExistingId, rarity` today.

**Fix:** add an optional `itemType` param — Name/Rarity/Faction/Type,
matching Echoes' existing UX — threaded through
`archive/items/index.html`'s `wire5eItemForm()` → the route →
`prompts/rulesets/5e/itemContentPrompt.js`'s dynamic context ("Target
type: weapon (required)" replacing "choose one that fills a gap" when a
type is specified, falling back to current behavior when left blank).
Small, contained, no dependencies on anything else in this phase.

### 4. PC/NPC sheet completeness

Checked directly against `prompts/rulesets/5e/survivorContentPrompt.js`
— none of the below exist on the schema today, despite HP/proficiency
bonus/spell slots already being correctly code-computed:

- **Skill proficiencies** — a real list drawn from the 18 5e skills.
- **Saving throw proficiencies** — the real 2-per-class list
  (class-determined, not model-invented — same "code decides, model
  doesn't trust itself with rules numbers" pattern already used for
  proficiency bonus/spell slots).
- **Passive Perception** — code-computed (10 + Perception bonus), not
  model-stated.
- **Initiative bonus** — code-computed (Dex modifier), not model-stated.
- **Mechanical Backgrounds** — currently a 1-2 sentence narrative-only
  field. Replace with a real Background pick (skill proficiencies + tool
  proficiency + starting equipment + a named feature). Depends on
  decision #2's data source landing for a real SRD background list —
  ship a small hand-authored fallback list (the ~13 core SRD
  backgrounds) if that's still pending when this phase is actually
  built, so this item isn't blocked on the licensing check.
- **Feats** — a real optional feat slot at the ASI levels (4/8/12/16/19),
  not just narrative ASI-vs-feat text in `classTemplate.js`. Same
  fallback-list logic as Backgrounds if the data source isn't ready yet.
- **Real ability-score generation method** — replace the current
  freehand "standard array feel, roughly 8-15" prompt language with an
  actual assigned Standard Array (15/14/13/12/10/8, model assigns to
  abilities in priority order for the chosen class) computed/validated
  server-side rather than trusted from the model's own arithmetic.
  Simplest correct method to implement; point buy/rolling can be a later
  option if wanted.

### 5. Multiclassing for PCs

Schema change: `classId`/`classLevel` (single class) → a list of
`{classId, level}` entries. `computeHitPoints`, `spellSlotsForLevel`,
and proficiency-bonus-by-total-level all need to aggregate across
multiple class entries per the real multiclass rules.
`lib/rulesets/5e/classFormulas.js` already computes the "third-caster"
progression used for Eldritch Knight/Arcane Trickster-style subclasses,
but nothing today aggregates two real, separately-leveled classes
together for spell slots. **Flagged as the single largest formula change
in this phase** — needs its own dedicated test coverage
(`scripts/test5eSurvivorFormulas.js`-style additions) before shipping,
same regression bar as every other formula file in this codebase.

### 6. Encounter Difficulty / XP Budget calculator

New, small, tied to Quests: given a target party (real PC entries, or a
manually entered size/level), compute the real DMG easy/medium/hard/
deadly XP thresholds and check a Quest's referenced Bestiary entries
against them. Pure math against CR data that already exists —
no generation call needed, no new API cost.

## Explicitly out of scope for R4

- Import/Reflavor for Spells/Classes/Items — gated on decision #2's
  license verification; will likely become its own phase (R5) once the
  data source is confirmed safe and actually ingested.
- Race/Species as a full category — decided against, see decision #1.
- A Generic-ruleset Spells category — still a real design question
  (what does a narrative-first "spell" even mean), untouched by this
  phase.
- Subscription/credit billing — untouched, unaffected by this plan.

## Suggested build order (dependency-informed, not a commitment)

1. **Items type picker** — contained, zero dependencies, quick win.
2. **PC/NPC derived fields** (skills/saves/passive/initiative) —
   contained to the existing schema, no data-source dependency.
3. **Race/Species reference system** (Skills-pattern) — shape is locked
   above; can ship with a hand-authored starter race list even before
   decision #2 resolves, same fallback logic as Backgrounds/Feats.
4. **5e-database license verification + real ingestion** — data-source
   work, can run in parallel with 1-3. Gates items 5's "real" version.
5. **Mechanical Backgrounds + Feats** — hand-authored fallback now,
   upgrade to real SRD-sourced lists once #4 lands.
6. **Multiclassing** — biggest formula lift, most self-contained, do
   last so it doesn't block anything else in this phase.
7. **Encounter Difficulty calculator** — fully independent, can slot in
   anywhere convenient.

## Notes for whoever scopes the real session prompt from this doc

- This project's own rule, re-established after the original ruleset
  build self-extended twice without review: **no build session without
  a short check-in first**, even a quick one.
- Every new/changed formula needs matching `scripts/test5e*.js`
  additions — this codebase's only regression net for math-heavy code.
- Version bump (`scripts/bump-cache-version.js`) + `CHANGELOG.md` entry +
  a `session_addendum_*_shipped.md` on completion, per established
  convention.
- Confirm with Austin before starting whether R4 lands before or after
  R3 (procedural + manual entry revamp) — this doc doesn't lock that
  ordering, only that R4 exists and is scoped.
