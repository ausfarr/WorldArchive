# World Forge Scope: Multi-Ruleset Genericization

This is the source-of-truth architecture doc for Chronicled's multi-
ruleset system — created as part of this project since no prior version
of this file existed in the repo. Update it as future phases ship;
`session_addendum_ruleset_genericization.md` has the full narrative/
decision history for what's described here, `SESSION_LOG.md` has the raw
build-time trail.

## Why this exists

Chronicled originally hardcoded one mechanical system: Austin's own
"Echoes of the Neon" (6-attribute formulas, 1–99 class leveling, a fixed
weapon-skill list). This doc describes the **ruleset** dimension added on
top of that so a world can instead run on real D&D 5th Edition, real
Pathfinder 2nd Edition, or a fully custom Generic/homebrew system —
importing real official content at zero AI cost, "reflavoring" official
mechanics with new narrative, or generating original homebrew content
grounded in real examples and validated by correct per-ruleset formulas —
while Echoes keeps working exactly as it always has, visible only to the
admin account.

## Hard invariants (do not violate these in future work)

1. **Echoes never breaks.** Every ruleset-specific file lives in its own
   new location (`lib/rulesets/<id>/`, `prompts/rulesets/<id>/`) —
   nothing ruleset-specific ever edits `lib/statFormulas.js`,
   `lib/itemFormulas.js`, `lib/classTemplate.js`, `lib/survivorTemplate.js`,
   or any existing `prompts/*ContentPrompt.js`. Those are the permanent
   Echoes implementation, referenced through the registry, not repurposed.
2. **`ruleset` is permanent.** Set once at wizard Step 1, locked the
   moment `world_config.setup_completed_at` is set
   (`worldConfigRepo.setRuleset()` enforces this — see that function).
   No route may ever change an already-live world's ruleset.
3. **Echoes is admin-gated everywhere it could appear** — but only in
   pickers/menus. `lib/rulesets/index.js`'s `listRulesets(userEmail)` is
   the single place that filter lives (`lib/adminAccess.js`'s
   `isAdminEmail()`, no second admin check). An existing Echoes world
   keeps working for its owner regardless of admin status — the gate is
   only on offering Echoes to *new* worlds.
4. **Copyright discipline.** Never ingest content into `srd_library`
   without verifying its actual license file yourself (not the reputation
   of the source, not what a README claims about "compatibility" —
   the LICENSE.md/README.md text itself). 5e: CC-BY-4.0 SRD only. PF2e:
   ORC-licensed content only, explicitly NOT Paizo's Community Use
   Policy (a separate, more restrictive fan-content license — see the
   open question in the session addendum). Never scrape 5etools,
   Archives of Nethys, or any aggregator mirror. Never use a physical/
   digital book Austin owns as a source — owning a book grants no
   redistribution rights.
5. **"Model writes narrative, code writes math."** Every ruleset-specific
   formula (CR, rarity, spell slots, proficiency) lives in a
   `lib/rulesets/<id>/*.js` file and is deterministic, tested code — the
   model never invents final mechanical numbers unsupervised. Homebrew
   tier: model proposes numbers as a starting point, code computes/
   validates the authoritative result and labels it as an estimate where
   the underlying formula is inherently approximate (see the CR-estimate
   finding below).

## Data model

```
world_config.ruleset          text, NOT NULL DEFAULT 'echoes'
                               CHECK IN ('echoes','5e','pf2e','generic')

srd_library                   shared, NOT tenant-scoped
  id, ruleset, category, srd_id, name, data_json,
  source_edition, license_note, cr, level, class_name, rarity, created_at
  RLS: any authenticated user may SELECT; only the service-role client
  (scripts/ingestSrd*.js) may write.

world_srd_imports             tenant-scoped join table
  world_id, srd_library_id, entry_id, imported_at
  Records "this world imported this srd_library row into this entry_id" --
  used for import-already-done checks and (once Phase 12 ships) entry-cap
  exclusion for imported content.
```

`entries` (the existing generic content table) is unchanged — ruleset-
specific entries store their ruleset-shaped data in `raw_json` exactly
like Echoes entries always have, just with a different internal shape.
A 5e enemies entry adds `sourceMode: 'import'|'reflavor'|'homebrew'` and,
for import/reflavor, `srdSourceId`/`srdLicenseNote` fields so its dossier
page can show provenance.

## The registry: `lib/rulesets/index.js`

```
ruleset -> {
  category -> { formulas, template, prompt, levelConfig }
}
```

Every generation route dispatches through this. Filled-in shape so far:

```
echoes: { factions, npcs, enemies, classes, items, logs, survivors, locations }
        -- every category, pointing at the pre-existing files, unchanged.
5e:     { enemies: { formulas, template } }
        -- prompt is NOT in the registry for 5e enemies: it has THREE
        -- prompt-shaped tiers (reflavor/homebrew; import needs none),
        -- which doesn't fit the registry's one-slot-per-category shape.
        -- routes/generateEnemy.js requires
        -- prompts/rulesets/5e/enemyContentPrompt.js directly instead.
pf2e:   {}   -- no categories built yet
generic:{}   -- no categories built yet
```

Explicit `require()` per entry, not directory auto-discovery — a
missing/typo'd module fails loudly at server boot, not silently at
request time.

**Every category route for a mechanically ruleset-specific category MUST
gate on ruleset availability.** `middleware/requireCategoryAvailable.js`
does this — mount it after `enforceGenerationCap` in any generation route
whose category isn't purely narrative. Without it, a non-Echoes world
would silently fall through to Echoes' own generation logic (this
actually happened during this build for Classes/Items/Survivors until
caught while writing this doc — see the session addendum's "Bugs caught
and fixed" #4). Factions/Locations/NPCs/Logs are the confirmed-narrative
exceptions (no mechanical stats in any ruleset) and should stay ungated
so they keep working identically across every ruleset.

**The gate is `hasCategory()`, never a `ruleset === 'echoes'` bypass.**
An earlier version of this middleware special-cased Echoes to always
pass, which happened to be safe only because every category gated at the
time had a real Echoes registry entry. It broke for Spells (Echoes has
no spell system at all) — caught and fixed in Phase 4. `hasCategory()`
alone is correct for both an existing-Echoes-category and a
no-Echoes-equivalent-category, so there's no reason to ever reintroduce
the bypass.

**Adding a brand-new category (no Echoes equivalent) needs extra care
frontend-side.** `archive/js/render.js`'s `CATEGORY_LABELS` map drives
the homepage's per-category count-fetch loop and `nav-{category}`
lookups for EVERY world, regardless of ruleset — adding a category there
without a real index page/nav link behind it risks breaking the homepage
for worlds that will never have that category (an Echoes world has no
use for "Spells"). Phase 4 added Spells' full backend but deliberately
left `CATEGORY_LABELS` alone, deferring real nav wiring to Phase 11.

## The three-tier generation pattern (proven on 5e Bestiary, repeat for every other category)

1. **Import** — zero AI cost. Copy a `srd_library` row's `data_json`
   straight into a new `entries` row via a ruleset-specific mapper (see
   `lib/rulesets/5e/srdMonsterMapper.js` for the pattern). Record the
   import in `world_srd_imports`. Refund the generation-cap spend
   immediately (`req.refundGeneration()`) rather than waiting for full
   differential billing (Phase 12) — a free action shouldn't cost points
   even before that phase lands.
2. **Reflavor** — the model rewrites ONLY name/flavor/trait-and-action
   WORDING; every mechanically-relevant number is carried through
   unchanged from the `srd_library` source (`estimated: false` on the
   resulting CR/rarity/whatever — it's the real official value, untouched).
3. **Homebrew** — the model proposes a full new entry, grounded against
   1–2 real same-tier `srd_library` rows shown as labeled structural
   reference ("do not copy"). Code then computes the authoritative
   mechanical result (CR, rarity, whatever the category needs) from the
   model's proposed raw numbers and marks it `estimated: true` if the
   underlying formula is inherently approximate (see below).

## Important: 5e Challenge Rating is an *estimate*, not an oracle — and the UI must say so

The DMG's own CR algorithm, applied literally to real monster stats,
does not reliably reproduce a monster's officially printed CR (verified
by hand-tracing the real Goblin through the formula — see the session
addendum's "Important finding" for the full trace and independent
cross-check). This is a documented property of 5e itself, not a bug: the
DMG frames the method as a starting estimate for homebrewers, and WotC's
own low-CR monsters are known to be hand-tuned via playtesting. Any
future ruleset-specific "compute the official-sounding number" formula
(PF2e level math, item rarity, spell-slot budgets) should be checked
against the same question before assuming it's exact: **does the source
game's own design process treat this as a strict formula, or a
guideline?** If it's a guideline, the UI must say "estimated," the way
`lib/rulesets/5e/enemyTemplate.js` does today.

## Phase status

| Phase | What | Status |
|---|---|---|
| 1 | Ruleset foundation (schema, registry, wizard picker) | **Shipped** |
| 2 | SRD data ingestion (5e monsters; PF2e blocked) | **Shipped** (5e monsters only) |
| 3 | Bestiary / Monsters (5e proof of concept) | **Shipped** |
| 4 | Spells | **Partially shipped** — 5e Homebrew tier (backend + cantrip-scaling formula, tested). No canonical import data found (same CC-BY-4.0 structured-data gap as Classes/Items). Frontend nav/index page deferred to Phase 11. |
| 5 | Classes (biggest single rework) | **Partially shipped** — 5e Homebrew tier: real 1-20 leveling, proficiency bonus, ASI levels, per-class subclass-unlock level, full/half/third/warlock spell slot tables, all cross-referenced and tested. PF2e Classes and the Generic ruleset's configurable leveling deferred. |
| 6 | Items | Deferred — see addendum |
| 7 | NPCs | Deferred — depends on Phase 5 |
| 8 | Player Characters (Survivors rework) | Deferred — depends on Phase 5 |
| 9 | Pathfinder 2e | **Partially shipped** — Bestiary Homebrew tier only (real Building Creatures level/tier math, verified MIT-licensed table source). Import/Reflavor still blocked on the ORC licensing question. |
| 10 | Generic/Homebrew ruleset | Deferred — depends on Phase 5 |
| 11 | Ruleset-aware edit forms (frontend) | Deferred — most actionable next slice, backend contract already exists for 5e enemies |
| 12 | Differential billing | Partially shipped (Import refund) — reduced Reflavor cost + entry-cap bypass deferred |
| 13 | Regression pass | Done incrementally per-phase; full DB-backed pass needs real credentials, not run here |
| 14 | Documentation | This file + session addendum |

See `session_addendum_ruleset_genericization.md` for full detail, the
licensing research trail, bugs caught and fixed, and a recommended
starting point for whoever picks this up next.
