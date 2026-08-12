# Session Addendum: Multi-Ruleset Genericization (Phases 1–3 shipped)

Full architectural detail for the multi-ruleset genericization project.
Linked from `CHANGELOG.md`'s Unreleased section. Folds in the running
`SESSION_LOG.md` kept during the build (that file remains in the repo as
the literal decision trail; this addendum is the polished, complete
record).

## One-paragraph summary

Added a `ruleset` dimension to worlds (`world_config.ruleset`, permanent
once wizard setup completes) so a world can be built on real D&D 5th
Edition instead of only Austin's bespoke "Echoes of the Neon" system,
which stays fully intact and admin-only. Built the shared foundation
(schema, a `lib/rulesets/index.js` registry every generation route
dispatches through, a canonical SRD content library, license
infrastructure) and proved the whole pattern end-to-end on one category —
the Bestiary — with real, verified 5e Challenge Rating math and a
three-tier generation model (Import / Reflavor / Homebrew). Pathfinder
2e, every other content category, the Generic ruleset, ruleset-aware edit
forms, and differential billing are scoped and explicitly deferred, not
built — see "What's deferred" below.

## What shipped

### Phase 1 — Ruleset Foundation

- `migrations/020_ruleset_foundation.sql`: `world_config.ruleset` (default
  `'echoes'`, CHECK-constrained to `echoes | 5e | pf2e | generic`),
  `srd_library` (shared canonical content, RLS with an authenticated-read
  policy), `world_srd_imports` (tenant-scoped join table tracking which
  world imported which library row, and under which entry id).
- `lib/rulesets/index.js`: the registry every generation route will
  dispatch through — `ruleset -> { category -> { formulas, template,
  prompt } }`. Echoes' entry points at the exact files every route
  already imported before this project; nothing about Echoes changed.
  Explicit `require()` per filled-in entry (not directory
  auto-discovery), so a missing module fails loudly at server boot.
- Wizard Step 1 got a Ruleset picker (`archive/wizard.html`,
  `routes/wizard.js`'s new `/wizard/ruleset-options` and
  `/wizard/set-ruleset`), server-filtered to hide Echoes from non-admins
  (`lib/adminAccess.js`'s existing `isAdminEmail()` — no second admin
  check introduced). **Lock-timing decision**: the spec says "permanent";
  the wizard's established pattern is a live, editable draft until Review
  & Confirm. Resolved as: editable like any other Step 1 field until
  `setup_completed_at` is set, at which point `worldConfigRepo.setRuleset()`
  refuses unconditionally and no route calls it again. This matches how
  every other wizard field behaves pre-completion while still satisfying
  "no route ever changes an existing, in-use world's ruleset."

### Phase 2 — SRD Data Ingestion

- `scripts/ingestSrd5e.js` ingests 201 real 5e monsters from
  `Tabyltop/CC-SRD` (verified CC-BY-4.0 — see "Licensing research"
  below), upserting into `srd_library` on `(ruleset, category, srd_id)`.
  Classes/Spells/Items are explicitly **not** ingested — no verified
  CC-BY-4.0 *structured* dataset exists for them (see deferred list).
- `scripts/ingestSrdPf2e.js` is written but intentionally inert — see
  "Open question for Austin" below.
- `archive/licenses.html` carries the real, verbatim-required SRD
  5.1 CC-BY-4.0 attribution plus an honest PF2e status note. Every
  `archive/*.html` page's footer links to it.

### Phase 3 — Bestiary (5e proof of concept for the whole pattern)

- `lib/rulesets/5e/statFormulas.js`: the DMG's real Challenge Rating
  algorithm (defensive CR from HP/AC, offensive CR from damage-per-round/
  attack-bonus/save-DC, averaged with the DMG's own round-up-on-.5 rule).
  Table cross-checked against an independent reference implementation; a
  transcription bug in that reference (CR-25's save DC) was caught and
  fixed here. See "Bugs caught and fixed" and "Important finding" below —
  this formula, applied literally, does **not** reliably reproduce a real
  monster's officially printed CR, which is expected/documented 5e
  behavior, not an implementation defect.
- `lib/rulesets/5e/enemyTemplate.js`: a genuinely different HTML
  stat-block layout from Echoes' attribute table (AC/HP/Speed, six
  ability scores + modifiers, saving throws, skills, resistances/
  immunities, senses/languages, CR with an "(estimated — review before
  play)" badge on Homebrew entries, traits, actions, legendary actions).
- `prompts/rulesets/5e/enemyContentPrompt.js`: Reflavor and Homebrew
  prompt builders (Import needs no prompt — direct DB copy).
- `routes/generateEnemy.js`: dispatches on `world.ruleset` at the top of
  the handler. The entire pre-existing Echoes code path was moved
  verbatim into its own function (`handleEchoesEnemyGenerate`) — diffed
  against the original file to confirm every statement is unchanged, not
  just moved. A `pf2e`/`generic` world gets an explicit `501` (with its
  generation-cap spend refunded), never a silent fallback to Echoes'
  code.
- `routes/confirmEntry.js`'s shared regenerate-confirm write path now
  branches per-ruleset for the `enemies` category only — Echoes' writer
  (`saveEnemyEntry`) is untouched; a new `lib/rulesets/5e/enemyRepo.js`
  handles the 5e write path.
- `scripts/test5eStatFormulas.js`: hard-asserted unit tests (ability
  modifiers, dice-average parsing, 3 hand-traced real-monster CR
  component checks, the DMG's own worked averaging example, proficiency
  bonus lookup) plus an informational sweep across all 201 ingested
  monsters.

## Licensing research (the part with real legal exposure)

**5e — resolved.** This project's own scope doc suggested
5e-bits/5e-database as a starting point. Checked its actual `LICENSE.md`/
`README.md` directly: the data is licensed under **OGL 1.0a**, not
CC-BY-4.0 — a materially different, more restrictive license with real
ongoing ambiguity after Wizards' disputed 2023 "deauthorization" attempt.
Rejected it, along with every other community 5e-SRD-JSON project found
by search (`BTMorton/dnd-5e-srd`, `soryy708/dnd5-srd`, `vorpalhex/srd_spells`
— all OGL 1.0a). Found and verified `Tabyltop/CC-SRD` instead: its
`README.md` states plainly it's a direct conversion of the official SRD
5.1 under CC-BY-4.0, with WotC's exact mandated attribution text
included. Spot-checked its Goblin and Ancient Red Dragon entries against
real SRD stat blocks (AC/HP/attacks/CR) — exact matches. 201 monsters
total ("hundreds," satisfying the Phase 2 checkpoint).

**Gap**: Tabyltop's repo only ships *structured* per-item JSON for
monsters — Classes/Spells/Items exist only as one large full-text SRD
dump, not per-record data. Turning that into structured rows needs a real
text parser, genuine future engineering, not ingested here.

**PF2e — blocked, deliberately not ingested.** This project requires
ORC-licensed content specifically, not Paizo's Community Use Policy
(CUP) — a separate, more restrictive fan-content license typically
incompatible with a paid commercial product. The most complete structured
PF2e dataset found (`Pf2ools/pf2ools-data`) explicitly reproduces Paizo's
rules text under CUP, not ORC (its own README says so). `paizo.com` was
unreachable from this build's sandboxed network egress policy, so
Paizo's own `/licenses` page — the authoritative source for what's
actually released under ORC — could not be checked directly.

## PF2e update — Homebrew tier unblocked, Import/Reflavor still blocked

Revisited after the initial pass, at Austin's request, checking two
specific sources (`legacy.aonprd.com`, a Paizo `PZOCUP...` PDF). Both
confirmed dead ends (OGL 1.0a + wrong ruleset era; Community Use Policy,
same problem as before) — but the research surfaced a real path: PF2e's
own monster-design MATH (GM Core's "Building Creatures" level/tier budget
tables) is game-balance numbers, not literary text, the same legal
category as the 5e DMG's CR table this project already uses. Found and
programmatically extracted (not hand-transcribed) a verified MIT-licensed
encoding of these tables (`miki4920/pf2e-monster-maker`), built
`lib/rulesets/pf2e/statFormulas.js`, `lib/rulesets/pf2e/enemyTemplate.js`
(a real, level-centric, trait-tagged PF2e stat block — genuinely
different layout from both Echoes' and 5e's), and
`prompts/rulesets/pf2e/enemyContentPrompt.js` + a `routes/generateEnemy.js`
pf2e branch — **Homebrew tier only**. `scripts/testPf2eStatFormulas.js`
hard-asserts known table values, a full monotonicity sweep (catches the
kind of transcription bug already found once in the 5e table), and
`buildCreatureBudget()` assembly across every role template.

This does not change the Import/Reflavor answer — those need actual
monster CONTENT under a verified ORC license, a separate question from
the math being safe. Requesting `mode !== 'homebrew'` on a pf2e world
gets an explicit 501, not a silent fallback.

**Verification is weaker here than the 5e table**: no second independent
PF2e source could be reached to cross-check every value (this sandbox's
network egress policy blocks essentially every TTRPG-adjacent domain
tried, including Wikipedia and the Wayback Machine, leaving only GitHub's
raw content host reachable). Confidence rests on internal consistency
(monotonicity across all 26 levels × 4 tiers, zero anomalies) and general
domain knowledge spot-checks, not independent cross-referencing. **Flagged
prominently in the module's own header comment — Austin should verify a
few rows against his own GM Core before trusting this for anything real.**

## Phase 4/5 update — Spells and Classes (5e, Homebrew tier)

Continued past the original Phases 1-3 stopping point at Austin's
request ("go ahead and start building out the rest... just as detailed,
not rushed"). Two more categories shipped with the same rigor:

**Spells** (`lib/rulesets/5e/spellFormulas.js`/`spellTemplate.js`,
`prompts/rulesets/5e/spellContentPrompt.js`, `routes/generateSpell.js`):
a brand-new category with no Echoes equivalent at all. This surfaced and
fixed a real bug in `middleware/requireCategoryAvailable.js` — its
`ruleset === 'echoes'` bypass was only ever safe because every
previously-gated category had a real Echoes registry entry; it broke for
a category Echoes has never had. Fixed by relying purely on
`hasCategory()`. The one genuinely formulaic piece of 5e spell design —
cantrip damage scaling at character levels 5/11/17 — is implemented and
verified against two real SRD cantrips (Fire Bolt, Chill Touch); no
"spell power budget" formula was invented, because the source material
doesn't have one. Frontend nav/index page deliberately not built (same
reasoning as Bestiary — `CATEGORY_LABELS` drives homepage behavior for
every world regardless of ruleset, and touching it without a real page
behind it risked breaking existing worlds).

**Classes** (`lib/rulesets/5e/classFormulas.js`/`classTemplate.js`/
`classRepo.js`, `prompts/rulesets/5e/classContentPrompt.js`,
`routes/generateClass.js`): real 1-20 leveling — proficiency bonus by
level, Ability Score Improvement levels, the correct subclass-unlock
level per class (Cleric/Sorcerer/Warlock 1st, Druid/Wizard 2nd, the rest
3rd — verified), and full spell slot tables for every caster type
including Warlock's structurally different Pact Magic. All cross-checked
against an independent source (5e-bits/5e-database's per-level JSON,
used only to verify NUMBERS — that project's actual content stays
excluded on the same OGL-1.0a grounds established in Phase 2). One
documented simplification: the base Ability-Score-Improvement pattern
(4/8/12/16/19) is implemented; Fighter's and Rogue's extra ASIs (6/14
and 10 respectively) are not modeled, flagged explicitly rather than
silently dropped.

Both categories: Homebrew tier only (no canonical CC-BY-4.0 data
available for either), PF2e and Generic-ruleset variants explicitly
deferred (not attempted), frontend UI deferred to Phase 11 alongside
Bestiary's.

## Phase 6 update — Items (5e, Homebrew tier)

`lib/rulesets/5e/itemFormulas.js`: real SRD weapon and armor lookup
tables (all 14 Simple + 21 Martial weapons, all 12 armors + shield) plus
the DMG's magic item rarity value-range table, cross-referenced against
5e-bits/5e-database's equipment JSON for numbers only (not a content
source). Unlike Bestiary/Classes, Items really is "mostly a lookup
table, not a derived formula" as the scope doc anticipated — the
verification bar here is correct transcription, not formula correctness,
which `scripts/test5eItemFormulas.js` hard-asserts against known SRD
stats. Homebrew generation resolves a magic weapon/armor's real damage
dice/AC from these tables plus the model's proposed base item + magic
bonus; a loose rarity-vs-price sanity check warns (never blocks) when a
proposed value looks off for its stated rarity. Same pattern as every
other category so far: Homebrew tier only, PF2e/Generic and frontend UI
deferred.

## Phase 7 update — NPCs (5e default combat profile + Combatant upgrade)

Smaller in scope than 4-6 since NPCs have no mechanical fields at all in
any ruleset today (verified by checking the NPC prompt schema). Every
5e-world NPC now gets a lightweight default combat profile at creation
(`lib/rulesets/5e/npcCombatDefaults.js` -- a Commoner-equivalent
baseline matching the real SRD Commoner exactly, cross-checked against
an independent source), wired into all three NPC-creation code paths
including the fill/regenerate branch, which required explicitly
preserving an already-upgraded Combatant's stats across a regenerate
(the model's response never includes `combatProfile`, so without this a
regenerate would have silently deleted a GM's earlier upgrade).

The "Combatant" upgrade (`routes/npcCombatant.js`) reuses the exact
Phase 3 Homebrew pipeline verbatim — `routes/generateEnemy.js`'s inline
Homebrew logic was extracted into `lib/rulesets/5e/homebrewEnemyGenerator.js`
and both routes now call the same function, matching the project's own
"reuse it, don't fork it" instruction. A real bug was caught while
wiring this: an early draft built the updated NPC object by spreading
the flattened entry wrapper `getEntry()` returns instead of its nested
`.raw` (the actual NPC content) — would have silently corrupted every
upgraded NPC's narrative content. Fixed before shipping.

`lib/entryTemplate.js` (the NPC template shared by every ruleset) got an
additive-only Combat Profile section, gated on `npc.combatProfile` being
present — undefined for every Echoes NPC and every pre-Phase-7 5e NPC,
so existing output is byte-for-byte unchanged for them.
`scripts/testNpcCombatProfile.js` hard-asserts that regression guarantee
explicitly, not just by inspection.

## Phase 8 update — Player Characters (5e Homebrew tier, Survivors rework)

**Scoping decision**: the category's DB/route slug stays `survivors` --
a full rename across every route, the entries table, and every frontend
reference would be a large, purely cosmetic, real-risk sweep for a
proof-of-concept phase, so it was deferred. What shipped is the concept
shift the scope doc actually asked for: a 5e "survivor" is now a real
Class instance, not a separate mechanical model.

`lib/rulesets/5e/survivorFormulas.js` computes HP via the PHB's official
fixed/no-rolling method (verified via search) and re-exports
`proficiencyBonusForLevel`/`spellSlotsForLevel` directly from Phase 5's
`classFormulas.js` — literally reusing the Class system's leveling data
rather than reimplementing it, per the scope doc's own instruction.
Homebrew generation requires the model to pick a `classId` from this
world's own real generated Classes (clear 400 if none exist yet); HP/
spell slots are computed from that class's actual hitDie/casterType, the
model only writes narrative and picks ability scores.

## Phase 10 update — Generic/Homebrew ruleset (Bestiary proof of concept)

Skipped ahead of finishing Phase 9's full PF2e expansion since Generic
has no external licensing/data blocker — genuinely buildable now.
`migrations/021_generic_ruleset_system.sql` adds a world-defined
attribute list + `useFormula` toggle to `world_config`, matching the
existing Skills wizard step's editable-pool pattern rather than
inventing something new. `lib/rulesets/generic/statFormulas.js` is
deliberately NOT a hardcoded table like every other ruleset's formula
file — there's no official system to encode — it's a small linear
formula evaluator that computes whatever a world configured and does
nothing when a world chose flavor-text-only stats (verified explicitly:
`scripts/testGenericStatFormulas.js` asserts the no-formula path returns
`{}`, not just that the formula path computes correctly). The Bestiary
template adapts its rendered table to whatever attributes/derived stats
the world actually defined. No wizard UI exists yet to configure
`generic_system_json` (must be set by hand today) — folded into Phase
11, not silently dropped.

## Phase 11 update — Ruleset-Aware Edit Forms (5e Bestiary UI)

Every earlier phase deferred frontend work to keep the verification bar
consistent across phases; this phase actually finishes one category end
to end — the 5e Bestiary, since its backend contract already existed and
was already tested. `routes/srdLibrary.js` exposes the existing
`listSrdEntries()` read path over HTTP for the frontend's Import/
Reflavor picker. `archive/enemies/index.html`'s generate form now
branches on the world's ruleset (reusing the existing, side-effect-free
`/api/wizard/ruleset-options` endpoint) — a 5e world gets a real Mode
selector with a live SRD dropdown and Target CR field; every other
ruleset (or a lookup failure) keeps the original Echoes form, fail-open
to the long-established default. Verified in a real headless browser,
including a screenshot of the working 5e form with the SRD dropdown
populated and the mode-visibility toggle switching correctly.

PF2e/Generic Bestiary UI and any UI at all for Spells/Classes/Items/
Player Characters/NPC Combatant upgrades remain deferred — real, tested
backends with zero frontend, same as noted per-category above.

## Phase 12 update — Differential Billing

Scoped per the original prompt: Import = free, Reflavor = cheaper than a
full generation (the model still does real work rewriting narrative,
just not inventing mechanics), Homebrew = full price. `BILLING_ENABLED`
is off by default in production, so this has zero live effect until
Austin flips it — built and tested against the only currently-reachable
path (legacy flat cap), with the subscription/credit path verified safe
by reading `lib/billingRepo.js`'s refund functions (both already accept
an arbitrary partial amount) rather than by a live test, since no real
Supabase project was reachable here.

`middleware/enforceGenerationCap.js`'s `makeRefundOnce` now accepts an
optional partial amount (`req.refundGeneration(4)` refunds 4 of the 5
points a request spent, instead of only ever refunding "everything" or
"nothing") while every existing no-arg call site keeps working exactly
as before — new test, `scripts/testRefundLogic.js`, covers the full/
partial/idempotent/clamped/failed-and-restored cases with a fake
`doRefund` callback (no DB needed). Wired into
`routes/generateEnemy.js`'s 5e Reflavor branch only: right after a
reflavored entry is successfully built, it refunds
`POINTS_PER_GENERATION - POINTS_PER_FIELD_ASSIST` (4 of the 5 points
already spent), netting Reflavor down to field-assist-tier cost. Placed
after the model call succeeds, not before — if the Claude call itself
throws, the route's existing top-level catch still does a full no-arg
refund, since the partial refund never got a chance to run.

`middleware/enforceEntryCap.js` got the explicit import bypass the spec
asked for by name: `if (req.body && req.body.mode === "import") return
next();`, sitting right next to the existing `fillExistingId` bypass —
not buried inside `checkEntryCap()`, which has no concept of "mode" and
shouldn't need one.

**Deferred within Phase 12**: the subscription/credit path
(`BILLING_ENABLED=true`) hasn't been exercised end-to-end against a real
project — only verified safe by code reading. PF2e/Generic have no
Import/Reflavor tiers yet (Bestiary is Homebrew-only for both), so there's
nothing differential to bill there until those tiers exist.

## Continuation session — "build everything else still missing"

A follow-up session picked this project back up after the Phase 12
commit and worked through essentially the entire remaining backlog in
one continuous pass, at explicit user request for the same rigor as
every earlier phase. Full narrative detail lives in `SESSION_LOG.md`'s
matching section; summarized here:

- **Generic ruleset wizard UI** shipped — `archive/wizard-stats.html`
  now branches by ruleset (this was also a real latent bug fix: 5e/pf2e
  worlds were being walked through Echoes' irrelevant stat-relabeling
  step, since nobody had revisited that page since rulesets were added).
- **PF2e Homebrew tier shipped for Classes, Items, Spells, NPCs, and
  Player Characters** — closing out essentially all of Phase 9's
  remaining scope. Each category's real formulas were independently
  verified (see `SESSION_LOG.md` for the exact worked examples cross-
  checked), tested with hard assertions, and wired into the same
  ruleset-dispatch pattern every other category uses.
- **Frontend (Phase 11) extended to every category with a non-Echoes
  ruleset implementation** — Classes/Items/Survivors gained 5e+pf2e
  forms, Spells got a real index page for the first time (previously
  backend-only since Phase 4), Bestiary gained pf2e/generic forms, and
  the NPC "Combatant" upgrade got a real dossier-page UI.
- **Re-investigated (not just re-asserted) the 5e Import/Reflavor data
  gap** — found a concrete, citable answer (Tabyltop's own README states
  structured spell/item JSON is a planned future release, not yet
  shipped) rather than repeating the earlier session's inference.

See `world_forge_scope.md`'s phase table for the fully updated per-phase
status and the registry's now much larger filled-in shape.

## Continuation session #2 — "make all last changes possible"

A final follow-up request after the previous continuation's last commit,
to finish anything still genuinely actionable in this sandbox before
wrapping up. Full narrative detail in `SESSION_LOG.md`'s matching
section; summarized here:

- **Generic ruleset extended to NPCs, Classes, Player Characters, and
  Items** (previously Bestiary-only). Classes/Items are deliberately
  narrative-first with no numeric system at all — a Generic world has no
  leveling or rarity/pricing concept defined anywhere, so inventing
  either would fabricate a mechanic no world configured. Player
  Characters and NPCs both reuse the real `computeDerivedStats` formula
  engine directly rather than duplicating it.
- One real architectural deviation worth knowing about: NPC combat
  profiles for Generic worlds denormalize their attribute/derived-stat
  LABELS onto the profile object itself, instead of looking them up from
  `generic_system_json` at render time the way Bestiary entries do —
  necessary because the shared NPC template renders synchronously from
  several existing call sites with no async DB access. Fully explained
  in `lib/rulesets/generic/npcCombatDefaults.js`'s header.
- Frontend forms for all three new categories, reusing the pf2e-shaped
  Classes/Items forms (identical body contract) and a small dedicated
  Generic form for Survivors (no LEVEL field, since Generic has none).
- `scripts/testNpcCombatProfile.js` grew from 20 to 26 assertions.

What's still genuinely missing after this round: a Generic Spells
category (real, un-attempted design work, not just wiring — see the
updated bullet in "What's deferred" below) and everything else already
listed there (Import/Reflavor licensing gaps, the untested subscription
billing path, the Survivors rename).

## Open question for Austin

**Has Paizo released actual Player Core / GM Core / Monster Core rules
TEXT under the ORC license itself** — as opposed to the ORC license just
being a legal template Paizo published for *other* publishers' own
original content? Those are different things, and the answer determines
whether Pathfinder 2e (Phase 9) can ever get a canonical import library
or ships Homebrew-only indefinitely. Check `paizo.com/licenses` directly,
or ask Paizo. If the answer is "no such release exists," the PF2e path
mirrors 5e's Homebrew tier only — never ingest CUP-licensed content into
`srd_library` regardless of how complete a dataset looks.

## Important finding (changes how CR should be presented to users)

Feeding real SRD monsters' real stats through the DMG's own CR formula
does not reliably reproduce their officially printed CR — verified by
hand-tracing the real Goblin (AC 15, HP 7, +4/1d6+2 attack) through the
algorithm: computes to CR 1/2, not its printed CR 1/4. Confirmed this
isn't an implementation bug by tracing the identical inputs through an
independent reference implementation (same result). This is a documented
property of 5e itself — the DMG frames the method as a starting estimate
for homebrewers, and WotC's own low-CR monsters are known to be hand-
tuned via playtesting, not purely formula-derived (the low end of the CR
scale has especially coarse bands). **Consequence, already implemented**:
Homebrew-generated monsters show their computed CR with an "(estimated —
review before play)" badge; Import/Reflavor entries show the real,
unmodified printed CR with no such badge.

## Bugs caught and fixed (during this build, before shipping)

1. `averageDamageFromDice()` can return a fractional average (e.g.
   "1d6+2" → 5.5), but the DPR lookup table's bands are contiguous whole
   numbers — an unrounded 5.5 wouldn't match any band. Fixed by rounding
   before the lookup. Caught by testing against real monster data, not
   code inspection.
2. A transcription bug in the independent reference CR table used to
   cross-check `CHALLENGE_THRESHOLDS` (CR-25's save DC listed as 11,
   breaking an otherwise-monotonic sequence across neighboring rows) —
   used the correct value (21) in this codebase's own table.
3. An early draft of the Reflavor route branch conflated `srdLibraryId`
   (the `srd_library` row's UUID primary key) with `srdSourceId` (the
   human-readable slug stored on a saved entry for display) — caught and
   fixed before it shipped; the route now requires `srdLibraryId`
   explicitly on every reflavor call, including regenerate.
4. **Real product-correctness gap, caught and fixed while writing this
   addendum**: only `routes/generateEnemy.js` was made ruleset-aware.
   Every other mechanically-Echoes-specific generation route (Classes,
   Items, Survivors — all three assume Echoes' BODY/REFLEX attribute
   system, 1–99 leveling, or the fixed weapon-skill list) was untouched,
   which meant a real user picking the 5e ruleset today could still
   generate an NPC/Class/Item/Survivor and silently get Echoes-flavored
   mechanics with no warning. Added `middleware/requireCategoryAvailable.js`
   and wired it into `generateClass.js`/`generateItem.js`/`generateSurvivor.js`
   — a non-Echoes world now gets an explicit 501 from those routes
   instead of silently wrong output. NPCs/Factions/Locations/Logs were
   deliberately left ungated — they have no mechanical stats in any
   ruleset today (verified by checking their prompt schemas for
   attribute fields) and are meant to stay shared/ruleset-agnostic per
   `world_forge_scope.md`'s registry design.

## What's deferred (explicitly, not silently)

This section has been rewritten twice now as the session kept continuing
past its own checkpoints, each time at explicit user request ("go ahead
and start building out the rest," then later "build everything else
still missing"). As of the actual end of this build: PF2e now has
Homebrew-tier support across every category (Bestiary, Classes, Items,
Spells, NPCs, Player Characters); every category with a non-Echoes
ruleset implementation has a real ruleset-aware frontend form; the
Generic ruleset has a real wizard UI. What genuinely remains:

- **Import/Reflavor for every non-5e-Bestiary category, in both
  rulesets** — 5e Spells/Classes/Items and every PF2e category
  (including Bestiary) are Homebrew-only. For 5e, this was actively
  re-investigated this round (not just re-asserted) — see the
  "Re-investigated" note under Phase 9 in `world_forge_scope.md` for the
  concrete finding (Tabyltop's own README confirms structured spell/
  item JSON is a planned-but-unshipped future release, not something
  this project failed to find). For PF2e, the open ORC-vs-CUP question
  below still blocks it for every category equally, not just Bestiary.
- **Generic Spells** — Classes/Items/NPCs/Player Characters all shipped
  for Generic in the final continuation round (see that section below);
  Spells is the one category that didn't, because "what does a
  world-configurable spell even mean" doesn't have an obvious
  narrative-first answer the way Classes ("a themed feature list") and
  Items ("flavor + an optional attribute bonus") did — a spell implies
  some kind of trigger/targeting/effect system, which is real design
  work this project would be inventing from scratch, not just more
  wiring against an existing pattern.
- **Differential billing for the subscription/credit path** —
  `BILLING_ENABLED=true` behavior verified safe by code reading only (see
  the Phase 12 update above), not exercised against a real Supabase
  project.
- **Survivors → "Player Characters" rename** — category DB/route slug
  stays `survivors` by deliberate scoping decision (Phase 8); a full
  rename sweep (routes, entries table category value, frontend nav/
  labels, existing worlds' stored data) is cosmetic but genuinely
  risky, and was out of scope for this build.
- **Full DB-backed regression** — done incrementally after every commit
  (server boot smoke tests, route dispatch checks, `node -c` syntax
  checks on every touched file, headless-browser dispatch verification
  for every frontend change, and a growing `scripts/test*.js` suite — 13
  scripts as of the end of this build, all passing) rather than as one
  dedicated final pass. A real Echoes generation cycle end-to-end and
  `scripts/testTenantIsolation.js` against the actual Supabase project
  could not be run in this sandboxed environment — no real Supabase/
  Anthropic/Gemini credentials were available, and Playwright's headless
  Chromium here has no route to a real Supabase-backed session either
  (every frontend verification in this build had to stub `authFetch`).
  **Austin should run the real Phase 1 checkpoint and
  `scripts/testTenantIsolation.js` against the actual Supabase project,
  and click through a real PF2e/Generic world in a real browser, before
  trusting this further.**

## Recommended next session's starting point

1. Apply every migration in `migrations/020_ruleset_foundation.sql`
   through `migrations/021_generic_ruleset_system.sql` by hand against
   Supabase (per this repo's usual migration process — no runner), then
   run `node scripts/ingestSrd5e.js` for real.
2. Verify the real Phase 1 checkpoint (non-admin ruleset picker options,
   admin sees all 4, pre-migration worlds read `ruleset='echoes'`) and
   `scripts/testTenantIsolation.js` against production data.
3. Click through a real 5e world AND a real pf2e world end-to-end in an
   actual browser against the real deployed app — generate one entry in
   every category for each, confirm the frontend forms actually work
   against a live backend (everything in this build was verified with a
   stubbed `authFetch` in a sandboxed headless browser, never a real
   session).
4. Flip `BILLING_ENABLED=true` in a staging environment (if one exists)
   and exercise the subscription/credit refund path for real before
   trusting Phase 12's differential billing beyond the legacy flat-cap
   path it was actually tested against.
5. Resolve the PF2e ORC-vs-CUP licensing question directly with Paizo
   before writing `scripts/ingestSrdPf2e.js` for real, or before
   attempting Import/Reflavor for any PF2e category.
6. If a real structured 5e spell/class/item dataset ever ships from
   Tabyltop (their README says it's planned), revisit 5e Import/Reflavor
   for those three categories — the pattern from Bestiary's
   `srdMonsterMapper.js` is the template to follow.
7. If a Generic Spells category is ever wanted, it needs real design
   work first (not just more wiring) — decide what a "spell" even means
   for an arbitrary homebrew system (a trigger condition? a targeting
   shape? just flavor text with no mechanical trigger at all, like
   Classes' features?) before writing any code.
