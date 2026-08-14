# World Forge Scope: Multi-Ruleset Genericization

This is the source-of-truth architecture doc for Chronicled's multi-
ruleset system — created as part of this project since no prior version
of this file existed in the repo. Update it as future phases ship;
`session_addendum_ruleset_genericization.md` has the full narrative/
decision history for what's described here, `SESSION_LOG.md` has the raw
build-time trail.

**Status update (see `session_addendum_ruleset_recovery_plan.md`):** real
testing surfaced that several load-bearing pieces below were never
actually applied/run in production (migrations `020`/`021`, the SRD
ingestion script), and that two systems predating this project
(procedural generation, manual entry) were never made ruleset-aware at
all despite the phase table below reading as if the ruleset system is
broadly finished. **Pathfinder 2e is being removed** (Homebrew-only
everywhere, no path to real content without an unresolved licensing
question, zero real users on it) — every `pf2e` row/reference below is
historical record of what was built, not a live target anymore. Treat
the recovery addendum as the current source of truth for what's actually
working and what's next; this file's phase table stays as an accurate
record of what shipped in the original project.

**Update (v0.95, 08/14/2026):** the recovery plan referenced above is now
fully shipped — R1 (pf2e removed) through R6 (real SRD Backgrounds/
Species/Feats/Magic Items backfill) are all done. 5e is a real, complete
second ruleset (Bestiary/Classes/Items/Spells/full PC sheet, all backed
by real licensed SRD content), Generic is a real narrative-first third
option, and procedural/manual entry work correctly on both. See
`CHANGELOG.md`'s v0.95 entry and `session_addendum_r4_5e_completeness_shipped.md`
/ `session_addendum_r5_srd_ingestion_and_import_fixes.md` /
`session_addendum_r6_srd_content_backfill.md` for the full detail. Still
flagged, not yet fixed: `scripts/verifySrd5eFullIngest.js` has a
pre-existing broken import and possible Spells/Classes source drift —
worth a real look before leaning on it for a production-data audit.

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
5e:     { enemies, classes, items, spells, survivors: { formulas, template } }
        -- prompt is NOT in the registry for any of these -- 5e enemies
        -- has THREE prompt-shaped tiers (import/reflavor/homebrew) and
        -- every other 5e category is Homebrew-only but still keeps its
        -- prompt required directly in its route rather than added to
        -- the registry's one-slot-per-category shape, for consistency.
pf2e:   { enemies, classes, items, spells, survivors: { formulas, template } }
        -- same shape as 5e, Homebrew-only across the board (no
        -- Import/Reflavor tier exists for pf2e in any category yet --
        -- see the "Re-investigated" note below Phase 9's table row).
generic:{ enemies, classes, items, survivors: { formulas?, template } }
        -- no Spells category (see Phase 10's table row for why). classes
        -- and items have no `formulas` slot at all -- both are
        -- deliberately narrative-first with nothing to compute (no
        -- leveling concept, no rarity/pricing system). NPCs' combat
        -- profile isn't a registry category of its own (NPCs stay
        -- ruleset-agnostic per the registry's own design -- see below);
        -- its default/Combatant-upgrade logic lives in
        -- lib/rulesets/generic/npcCombatDefaults.js instead.
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
| 4 | Spells | **Shipped** for 5e + pf2e — both Homebrew tier: 5e's cantrip-scaling formula, pf2e's verified rank=ceil(level/2) + Heightened(+N) formula, both tested. Real frontend index page (`archive/spells/`). No canonical import data for either ruleset (see the "Re-investigated" note below for 5e; pf2e blocked on the same ORC question as everything else pf2e). |
| 5 | Classes (biggest single rework) | **Shipped** for 5e + pf2e — 5e: real 1-20 leveling, proficiency bonus, ASI levels, per-class subclass-unlock level, full/half/third/warlock spell slot tables. pf2e: verified proficiency-bonus formula, Class DC formula, HP formula, ability-boost/skill-increase levels; a homebrew class designs its own Class DC rank-up schedule and picks 2 of 3 "good" saves (a genuine per-class PF2e design choice), Perception/saves otherwise follow one fixed project-documented default curve. Both tested, both have real ruleset-aware frontend forms. Generic ruleset's configurable leveling still not built (no Classes category in the Generic registry at all). |
| 6 | Items | **Shipped** for 5e + pf2e — 5e: real SRD weapon/armor lookup tables + DMG rarity value-range sanity check. pf2e: verified fundamental rune tiers (potency/striking/resilient) and Bulk system; price-by-level is an explicitly-labeled ESTIMATE (see itemFormulas.js's header — no official price table could be independently verified, only two anchor points). Both tested, both have real frontend forms. Generic ruleset has no Items category. |
| 7 | NPCs | **Shipped** for 5e + pf2e — every NPC in a 5e or pf2e world gets a lightweight default combat profile at creation (5e: cross-checked against the real SRD Commoner; pf2e: computed via the verified Building Creatures math at level 0/low-tier, since no ORC-licensed reference exists to check against). The "Combatant" upgrade (`POST /api/npc-combatant-upgrade`) reuses each ruleset's own Homebrew Bestiary pipeline and now has a real dossier-page UI (button + ruleset-specific fields). Shared NPC template dispatches its embedded renderer by a `ruleset` field on combatProfile, defaulting to 5e for every profile that predates the field. |
| 8 | Player Characters (Survivors rework) | **Shipped** for 5e + pf2e — a PC is a real Class instance (`classId` referencing a Classes entry from Phase 5/9), with HP/proficiency (5e) or HP/Class DC/Perception/saves (pf2e) computed from that class's actual data. Real ruleset-aware frontend form (identical body shape for both rulesets, one shared form). Category slug stays `survivors` (rename deferred as cosmetic/risky). |
| 9 | Pathfinder 2e | **Shipped for Homebrew tier across every category** (Bestiary, Classes, Items, Spells, NPCs, Player Characters) — see Phases 3-8 rows above, each now has a pf2e column alongside 5e's. Import/Reflavor still blocked on the open ORC-vs-CUP licensing question for ALL categories (no verified ORC-licensed dataset exists for monsters, classes, items, or spells) — this is the one genuinely remaining PF2e gap, not a phase-by-phase one. |
| 10 | Generic/Homebrew ruleset | **Shipped across every category except Spells** — Bestiary (proof of concept) plus a real wizard UI (`archive/wizard-stats.html` branches by ruleset: Generic worlds get a live attribute + optional derived-stat-formula builder, AI "generate for me" assist), Classes (deliberately narrative-first, no leveling table — a Generic world has no leveling concept), Items (narrative-first, optional single attribute-tied bonus), NPCs (default combat profile + Combatant upgrade — profiles denormalize attribute/derived-stat labels onto themselves rather than looking them up from world config at render time, see `lib/rulesets/generic/npcCombatDefaults.js`'s header), and Player Characters (a real Class instance, attributes validated against the world's own keys, derived stats reused directly from `statFormulas.js`). No Spells category — narrative-first classes/items generalize naturally but a "spell" implies a mechanical trigger/effect system this project didn't invent a generic version of. |
| 11 | Ruleset-aware edit forms (frontend) | **Shipped for every category with a non-Echoes ruleset implementation, across all four rulesets** — Bestiary (5e Mode picker + SRD browse, pf2e level/role form, Generic name/faction form), Classes/Items/Survivors (5e + pf2e forms, plus Generic forms — Classes/Items share the pf2e-shaped form since both take an identical name+faction body, Survivors gets its own Generic form without a LEVEL field since Generic has no leveling concept), Spells (real new index page, 5e + pf2e forms, hidden nav link shown only for supporting rulesets — no Generic form since Generic has no Spells category), NPC Combatant upgrade (dossier-page button, all three implemented rulesets). All verified via headless Chromium with a stubbed ruleset lookup (real Supabase unreachable in this sandbox, same caveat as the original Phase 11 slice). |
| 12 | Differential billing | **Shipped** (legacy flat-cap path) — Import fully refunds (Phase 3), Reflavor now refunds down to field-assist-tier cost via `makeRefundOnce`'s new partial-amount support (tested, `scripts/testRefundLogic.js`), Homebrew still pays full price. `enforceEntryCap.js` has an explicit `mode === "import"` bypass so imports don't burn the entry cap. Subscription/credit path (`BILLING_ENABLED=true`) verified safe by code reading only — not exercised against a real project. |
| 13 | Regression pass | Done incrementally per-phase (13 `scripts/test*.js` scripts, repo-wide syntax sweep, server boot test, headless-browser dispatch checks after every phase); full DB-backed pass needs real credentials, not run here |
| 14 | Documentation | This file + session addendum + `SESSION_LOG.md` |

**Re-investigated (per Austin's explicit request to keep looking before accepting a blocker): does a structured CC-BY-4.0 dataset exist for 5e Spells/Classes/Items the way Tabyltop's monster JSON exists for Bestiary?** Re-cloned and inspected `Tabyltop/CC-SRD` directly — it ships a second JSON file (`SRD5.1-CCBY4.0License-TT.json`, 13,353 entries) that looks structured at a glance but is actually a raw PDF-text-extraction dump (`type: "paragraph"|"h1"..."h4"|"table"`, each with page/x/y coordinates, no field distinguishing a spell name from a class feature name or a monster trait name — all headers are flatly typed `"h4"`). The repo's own README settles it directly: *"The team at Tabyltop plans to release additional machine-readable extractions from the SRD in the near future including JSON lists of monsters, spells, and items"* — as of this snapshot, only the monsters extraction had actually been done; spells/items/classes structured JSON is explicitly a planned-but-not-yet-shipped release. Parsing the raw text dump into reliable structured spell/item records is theoretically possible (spell stat blocks follow a fairly consistent "Casting Time:/Range:/Components:/Duration:" text pattern) but would be a real data-engineering project with real accuracy risk — mis-attributing a paragraph to the wrong header at a page break, mis-parsing a range/duration string — and no independently-reachable source to verify the ~319 parsed spells against (aonprd/dndbeyond/wikidot all network-blocked here). Consistent with this project's own rule ("if unsure, flag rather than guess"), staying Homebrew-only for these three categories remains the right call rather than shipping unverified parsed content that LOOKS as authoritative as the real monster Import tier.

See `session_addendum_ruleset_genericization.md` for full detail, the
licensing research trail, bugs caught and fixed, and a recommended
starting point for whoever picks this up next.

## R5 — SRD ingestion unblocked, Import/Generate split (planned, not yet built)

Supersedes this doc's own "no ready-made CC-BY-4.0 STRUCTURED dataset"
conclusion above, and `scripts/ingestSrd5e.js`'s header note that
Classes/Spells/Items aren't ingested. **A real source was found:
`downfallx/dnd-5e-srd-markdown`** — genuine CC-BY-4.0 SRD 5.2.1,
verified directly (README states the license plainly, ships the
WotC-mandated attribution text, distinct from the already-rejected
`5e-bits/5e-database`). It has real content for Spells, Equipment,
Classes, Feats, and Magic Items — the exact gap the R4 addendum's Phase
4 hit. Ingestion is real markdown/table parsing (not structured JSON
like the monster source), so it needs its own careful parser with
spot-check verification per category, same rigor bar as every other
ingestion in this project.

Also planned in the same session: real Import/Reflavor/Homebrew tiers
for Items and Classes (currently zero import capability in either), and
a fix for Enemies' Import vs Generate-with-AI both currently revealing
the same picker screen (confirmed UX bug, see finding #6 in the ruleset
recovery plan addendum) — carried to Items/Classes as they're built.

Also bundled: the `entries_category_check` constraint still doesn't
allow `'spells'` (confirmed — no migration through `023` touches it),
World Info's Attributes/Skills sections still show on non-Echoes worlds
(confirmed — `/wizard/review` never returns `ruleset`), and NPC/
Survivors' Import button still sits outside the "+ Create Entry"
staged-reveal flow that Enemies already uses.

Full phased build plan: `session_prompt_r5_srd_ingestion_and_import_fixes.md`.
