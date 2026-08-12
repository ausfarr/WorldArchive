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

## Phase 2/9 addendum — PF2e revisited (post-Phase-3 checkpoint)

Austin asked to look harder at two specific sources before accepting
"blocked" for PF2e: `legacy.aonprd.com/indices/bestiary.html` and a
Paizo-hosted "Monster and Hazard Creation" preview PDF
(`PZOCUP024E_...pdf`). Both domains (`legacy.aonprd.com`,
`downloads.paizo.com`) are blocked by this build's network egress
policy, so neither could be fetched directly — same restriction that
already blocked `paizo.com`. Confirmed via search instead:
`legacy.aonprd.com` is the **OGL 1.0a**-licensed Pathfinder Reference
Document (pre-Remaster PF1e/PF2e-beta era) — wrong license (OGL not
ORC) AND wrong ruleset generation, so it's a dead end even setting aside
that scraping Archives of Nethys directly was already ruled out. The
`PZOCUP` product-code prefix is Paizo's own **Community Use Policy**
naming convention (confirmed via search results describing Paizo's CUP
program) — same licensing problem as `pf2ools-data`, not ORC.

**However — found a real, usable path forward.** PF2e's actual monster-
design MATH (the GM Core's "Building Creatures" budget tables: AC/HP/
Perception/Saves/Strike-bonus/Strike-damage/Skills/Spellcasting by level
and tier) is, like 5e's DMG CR table, a set of game-balance NUMBERS, not
literary rules text — the same non-copyrightable-mechanics reasoning
already used for the 5e CR table. Found `miki4920/pf2e-monster-maker`
(MIT-licensed Foundry VTT module) with these tables fully encoded in
`src/Values.ts`, extracted PROGRAMMATICALLY (not hand-transcribed, to
avoid the kind of transcription error already caught once in the 5e
table) into `lib/rulesets/pf2e/statFormulas.js`. This unblocks real,
tested **Homebrew-tier** PF2e Bestiary generation — PF2e's own design
method (pick a level + tier, read the table) is actually MORE
deterministic than 5e's CR-estimation, since there's no "estimate and
hope it's close" step.

**This does NOT unblock Import/Reflavor** — those need actual monster
CONTENT (names, stat blocks) under a verified ORC license, which is a
completely separate question from the MATH being safe to use, and
remains unresolved (see the Phase 2 entry above — still needs a direct
answer from Paizo). `prompts/rulesets/pf2e/enemyContentPrompt.js` and
`routes/generateEnemy.js`'s pf2e branch enforce this explicitly: a
request for `mode !== 'homebrew'` gets a clear 501, not a silent
fallback.

**Verification caveat, stated honestly**: unlike the 5e CR table, a
second independent PF2e source could not be reached to cross-check every
value (paizo.com, aonprd.com, d20pfsrd.com, pf2calc.com, and even
en.wikipedia.org and web.archive.org are all blocked by this sandbox's
network egress policy — it appears to allow raw.githubusercontent.com/
github.com for code hosting and not much else in the TTRPG space).
Confidence rests on the table's internal consistency (a monotonicity
sweep across all 26 levels × 4 tiers found zero anomalies — see
`scripts/testPf2eStatFormulas.js`), the source project's specific claim
to implement the real core-rules tables, and spot-checks against general
PF2e knowledge. **Austin should verify a handful of rows against his own
GM Core before trusting this for anything real** — flagged prominently
in the module's own header comment, not just here.

Starfinder or another alternative was NOT pursued, per the "if you find
a real PF2e path, use it" instruction — a real, if partial (Homebrew-tier
only), PF2e path was found.

## Phase 4 — Spells (5e, Homebrew tier)

New category end-to-end — Spells has no Echoes equivalent at all (Echoes
is a non-magical sci-fi/post-apocalyptic setting). This surfaced a real
bug in `middleware/requireCategoryAvailable.js`: it special-cased
`ruleset === 'echoes'` to always pass, which was safe for the Phase 3
guards (Classes/Items/Survivors all have real Echoes registry entries)
but wrong the moment a category with NO Echoes entry at all needed
gating — an Echoes world hitting `/generate-spell` would have bypassed
the guard and crashed deep in a route with nothing to dispatch to,
instead of a clean 501 at the gate. Fixed by removing the bypass
entirely and relying purely on `hasCategory()`, which is correct for
both cases (confirmed via direct test: `hasCategory('echoes','classes')`
stays `true`, `hasCategory('echoes','spells')` is `false`).

**Formula scope, stated honestly**: unlike Bestiary CR math, 5e spell
design has no official per-level power-budget formula in the source
material — inventing one would be fabricating a rule that doesn't exist.
The one genuinely formulaic piece is cantrip damage scaling (fixed
breakpoints at character levels 5/11/17, verified against two real SRD
cantrips, Fire Bolt and Chill Touch) — implemented in
`lib/rulesets/5e/spellFormulas.js` and hard-tested in
`scripts/test5eSpellFormulas.js`. Everything else about a Homebrew
spell's balance is GM judgment, same as it is for a real human
homebrewing a spell.

**Data**: no verified CC-BY-4.0 *structured* spell dataset exists
(same gap noted in Phase 2 — Tabyltop only ships monsters as structured
JSON). Homebrew tier only, same pattern as PF2e Bestiary.

**Frontend deliberately NOT built.** Added "spells" to
`routes/entries.js`/`routes/export.js`'s category validation (needed for
the read/export API to recognize the category at all), but did NOT add
it to `archive/js/render.js`'s `CATEGORY_LABELS` — that map drives the
homepage's per-category count-fetch loop and `nav-{category}` lookups
for EVERY world regardless of ruleset, and adding an entry there without
a real index page/nav link behind it risked subtle breakage across every
existing world (including Echoes) for a page that doesn't exist yet.
Caught this before committing it, not after. A spell entry's dossier
page still works via the generic `/api/entries/:category/:id` route; it
just shows the raw "spells" string as its crumb label until Phase 11
builds real ruleset-aware nav. This mirrors the same "backend proven,
frontend deferred to Phase 11" scoping already established for the 5e
Bestiary in Phase 3.

## Phase 3 — Bestiary / Monsters (5e proof of concept)

**CR table provenance**: `lib/rulesets/5e/statFormulas.js`'s
`CHALLENGE_THRESHOLDS` table (the DMG's "Monster Statistics by Challenge
Rating") was cross-checked row-by-row against the independently-written,
MIT-licensed `github.com/AsmodeusXI/dnd-5e-cr-calculator` (these are
mechanical/balance numbers, not literary SRD text, so this isn't a
licensing concern the way the monster data itself was). Found and fixed
a real transcription bug in that reference project's own CR-25 row
(`sdc: 11`, breaking an otherwise-monotonic 20/20/20/**21**/21/21/22/22/22/23
sequence across neighboring rows) — used 21 here. Also verified the
averaging/rounding rule (round UP on an exact .5, not down) against a
worked DMG example quoted by a secondary source (offensive CR 9 +
defensive CR 6 → published result is CR 8, not 7) — this is a real,
easy-to-get-backwards rule and is now a dedicated hard-asserted test
(`testAveragingRoundsUp` in `scripts/test5eStatFormulas.js`).

**Real bug caught before shipping**: `averageDamageFromDice()` can return
a fractional average (e.g. "1d6+2" → 5.5), but the DPR lookup table's
bands are contiguous whole numbers -- an un-rounded 5.5 doesn't match ANY
band and would have silently fallen through to the wrong index. Fixed by
rounding before the lookup (`lib/rulesets/5e/statFormulas.js`'s
`computeChallengeRating`); caught by testing against real monster data
before writing the "final" test assertions, not by inspection.

**Important finding, worth restating here since it changes how this tool
should be presented to users**: applying this formula literally to real
SRD monsters' real stats does NOT reliably reproduce their officially
printed CR -- confirmed by hand-tracing the real Goblin (AC 15, HP 7,
+4/1d6+2) through the algorithm: computes to CR 1/2, not the printed CR
1/4. This is NOT an implementation bug (verified independently against
the AsmodeusXI reference implementation, which produces the identical
result off the same inputs) -- it's a documented property of 5e's CR
system: the DMG explicitly frames this method as a starting ESTIMATE for
homebrew, and WotC's own low-CR monsters are known to be hand-tuned via
playtesting rather than purely formula-derived (the low end of the CR
scale has especially coarse HP/DPR bands). A full sweep across all 201
ingested SRD monsters (informational only, not a hard test gate --
`scripts/test5eStatFormulas.js`) using a simplified single-best-action
DPR extraction gets an exact match on only 15% and "within one CR step"
on 42% -- expected, given both the extraction's simplification
(ignores Multiattack, spellcasting, legendary actions, resistances) AND
the formula's own inherent looseness stack on top of each other.
**Consequence**: `lib/rulesets/5e/enemyTemplate.js` labels
code-computed CR as "(estimated — review before play)" for Homebrew
entries; Import/Reflavor entries carry the real officially-printed CR
unchanged (`estimated: false`) since their mechanics are untouched from
the SRD source.

**Three-tier pattern implemented**: Import (zero AI cost — direct copy
from `srd_library` via `lib/rulesets/5e/srdMonsterMapper.js`, refunds the
generation-cap spend immediately since full differential billing is
Phase 12 scope but a free import shouldn't wait for that), Reflavor
(`prompts/rulesets/5e/enemyContentPrompt.js`'s `buildReflavorEnemySystemPrompt`
— model rewrites name/flavor/trait-and-action WORDING only, mechanics
copied through unchanged from the mapper), Homebrew
(`buildHomebrewEnemySystemPrompt` — model proposes full stats grounded
against 1-2 real same-CR SRD monsters as labeled reference, code computes
the real CR via `computeChallengeRating()`).

**`routes/generateEnemy.js` restructure**: the entire pre-existing Echoes
code path was moved verbatim into `handleEchoesEnemyGenerate()` (diffed
against the original file to confirm every statement is unchanged, just
relocated + wrapped in a ruleset branch — two explanatory comments that
got dropped in the first pass were restored for full fidelity). A
`generic`/`pf2e` world hitting this route gets an explicit 501 with a
generation-cap refund, not a silent fallback to Echoes' code path.

**Verification performed** (no real Supabase/Claude credentials in this
sandbox, so verification is direct function-level testing, not a live
end-to-end request):
- `scripts/test5eStatFormulas.js`: all hard assertions pass (ability
  modifiers, dice-average parsing, 3 hand-traced real-monster CR
  component checks, the DMG averaging rule, proficiency bonus lookup).
- `mapSrdMonsterMechanics()` output spot-checked against the real Ghost
  and Lich SRD entries (resistances/immunities/saving throws/skills all
  render correctly through `buildEnemyBodyHtml`).
- Full Homebrew pipeline (prompt build → simulated model output →
  `extractOffenseForCr` → `computeChallengeRating` → template render)
  run end-to-end with a synthetic monster, confirmed correct estimated-CR
  badge renders.
- Server boots cleanly with every new route/module wired in; `POST
  /api/generate-enemy` returns 401 pre-auth same as every other `/api/*`
  route (no crash from the new dispatch logic).

**Deferred within Phase 3 itself** (small, noted so it isn't confused
with "done"): no frontend UI was built for the 5e three-tier picker
(mode selection, SRD browse/import picker) — `archive/js/render.js`'s
enemy generation UI is still Echoes-shaped. The backend API contract
(`mode`, `srdLibraryId`, `targetCr` on `POST /api/generate-enemy`) is
real and tested at the function level; wiring a ruleset-aware frontend is
folded into Phase 11's scope (Ruleset-Aware Edit Forms / UI), not
silently dropped.

(Note on ordering: the "Phase 2/9 addendum" and "Phase 4" sections above
this one were written after this Phase 3 section but got inserted before
it in the file -- this log is the raw chronological trail, kept as-is
rather than reordered; the polished, correctly-ordered account is
`session_addendum_ruleset_genericization.md`.)

## Phase 5 — Classes (5e, Homebrew tier) — "biggest single rework"

Real 1-20 leveling math, cross-referenced against an independent source
(5e-bits/5e-database's per-level class JSON -- used ONLY to verify
mechanical numbers, not as a content/licensing source; that project's
own content is OGL 1.0a per Phase 2's research, so nothing from it is
shipped, only cross-checked): proficiency bonus by level, Ability Score
Improvement levels (4/8/12/16/19 base pattern -- Fighter/Rogue's known
extra ASIs at 6/14 and 10 respectively are NOT modeled, flagged
explicitly in `classFormulas.js`'s header rather than silently wrong),
per-class subclass-unlock level (verified: Cleric/Sorcerer/Warlock at
1st, Druid/Wizard at 2nd, the other 7 core classes at 3rd), and full
spell slot progressions for every caster type -- Full (Bard/Cleric/
Druid/Sorcerer/Wizard), Half (Paladin/Ranger, starts level 2), Third
(computed via the real floor(level/3) multiclassing rule into the
full-caster table, not a separately hardcoded table), and Warlock's
structurally different Pact Magic (few slots, always highest level,
short-rest recharge). `scripts/test5eClassFormulas.js` hard-asserts
every one of these against the cross-referenced values.

**Design choice**: the model proposes feature names/descriptions at
~6-10 meaningful milestone levels (matching how real published classes
work -- not every level has a unique feature), not a mechanically
exhaustive level-by-level writeup. Code inserts ASI levels and the
subclass-unlock level automatically; the model never controls either.
Subclass-unlock level is resolved by checking whether the proposed
class's name matches one of the 12 core class names (e.g. a homebrew
class called "Void Warlock" gets level 1, matching real Warlock);
anything that doesn't match falls back to level 3, the shared default
across 7 of the 12 core classes.

**Scope explicitly NOT covered in this phase**: PF2e Classes (a large
body of work of its own, and has no canonical class data available
regardless, per the still-open ORC/CUP licensing question) and the
Generic ruleset's world-configurable leveling system (depends on wizard
UI work not undertaken here). Both are real, separate follow-up phases,
not folded into this one. Frontend: same as Bestiary/Spells, the
Classes generation UI stays Echoes-shaped (1-99 tree) -- Phase 11 scope.

## Phase 6 — Items (5e, Homebrew tier)

`lib/rulesets/5e/itemFormulas.js`: real SRD weapon (all 14 Simple, all
21 Martial) and armor (all 12 armors + shield) lookup tables plus the
DMG's magic item rarity value-range table (Common 50-100gp through
Legendary 50,000gp+, Artifact priceless) -- cross-referenced against
5e-bits/5e-database's equipment JSON (numbers only, not a content
source, same reasoning as every other cross-check in this project).
This category really is "mostly a lookup table, not a derived formula"
per the scope doc -- unlike Bestiary/Classes there's no complex math to
verify, just correct transcription, which `scripts/test5eItemFormulas.js`
hard-asserts against real known stats (Longsword 1d8 slashing Versatile,
Chain Mail AC 16 no-dex Str-13-required, etc.).

Homebrew generation resolves a magic weapon/armor's actual damage dice/
AC from these tables plus the model's proposed base-item name and magic
bonus -- the model never states final numbers directly. A loose
rarity-vs-value sanity check (warn, don't block, same spirit as Echoes'
`attributeBudgetWarning`) flags a proposed price that's out of the DMG's
typical range for its stated rarity.

No canonical magic item dataset ingested (same gap as Spells/Classes) --
Homebrew tier only. PF2e Items and the Generic ruleset deferred, same as
every other category so far.

## Phase 7 — NPCs (5e default combat profile + Combatant upgrade)

Smaller in scope than 4-6 since NPCs are otherwise ruleset-agnostic
(confirmed by checking `prompts/npcContentPrompt.js`'s schema: no
mechanical stat fields at all, pure narrative). Two pieces:

1. **Default combat profile**: every NPC created in a 5e-ruleset world
   now gets `combatProfile` attached automatically -- a Commoner-
   equivalent baseline (AC 10, HP 4, all abilities +0, one weak Club
   attack, CR 0) matching the real SRD Commoner exactly (cross-checked
   against 5e-bits/5e-database's monster JSON), coded directly in
   `lib/rulesets/5e/npcCombatDefaults.js` as a plain default rather than
   ingested content -- same non-licensing-source treatment as every
   other cross-referenced table in this project. Wired into THREE
   separate NPC-creation code paths (`lib/campaignEntryGenerators.js`'s
   `createNewNpc` -- the shared "plain new NPC" helper also used by
   Quest auto-fill; `routes/generate.js`'s import-from-text branch,
   which bypasses that helper; and the fill/regenerate branch, which
   also had to explicitly PRESERVE an already-upgraded Combatant's real
   stat block across a regenerate -- the model's own response never
   includes combatProfile at all, so without this, confirming a
   regenerate would have silently deleted a GM's earlier Combatant
   upgrade).

2. **"Combatant" upgrade** (`routes/npcCombatant.js`,
   `POST /api/npc-combatant-upgrade`): reuses the *exact* Phase 3
   Homebrew monster pipeline -- extracted `routes/generateEnemy.js`'s
   inline Homebrew logic into a new shared function,
   `lib/rulesets/5e/homebrewEnemyGenerator.js`'s `generateHomebrew5eEnemy()`,
   used by BOTH the Bestiary route (now calling the extracted function
   instead of duplicating the logic inline -- confirmed unchanged
   behavior via the same synthetic-monster pipeline test as Phase 3) and
   this new NPC route. Matches the project's own instruction verbatim:
   "reuse it, don't fork it."

**Real bug caught and fixed while wiring the upgrade route**: an early
draft built `updatedNpc` by spreading `existing` (the FLATTENED entry
object `getEntry()` returns -- id/name/subtitle/faction/tags/bodyHtml/
etc.) instead of `existing.raw` (the actual NPC content object with
physicalDescription/speech/relationships/etc.). Saving that broken
object would have silently corrupted the NPC's own narrative content the
first time anyone used the Combatant upgrade. Caught before shipping,
not after.

**Template change, kept safe deliberately**: `lib/entryTemplate.js`
(the one NPC template shared by every ruleset, since NPCs were never
previously ruleset-specific) got an additive-only "Combat Profile"
section that only renders when `npc.combatProfile` is present --
undefined for every Echoes NPC and every 5e NPC that predates this
phase, so `buildBodyHtml()`'s output is byte-for-byte unchanged for
them. `scripts/testNpcCombatProfile.js` hard-asserts this regression
guarantee explicitly, plus correct rendering for both the default and an
upgraded profile (including the "(default -- not yet a bespoke
Combatant)" label disappearing once a real Combatant stat block replaces
it).
