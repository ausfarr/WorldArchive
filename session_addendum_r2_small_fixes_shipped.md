# Session Addendum: Ruleset Recovery Phase R2 — Small/Contained Fixes

Five independent fixes from `session_addendum_ruleset_recovery_plan.md`'s
Phase R2 scope (findings #2, #5/#6, #7, #8), each shipped as its own
commit on `claude/ruleset-recovery-fixes-b9wvu3`. R1 (PF2e removal) was
confirmed already shipped and merged to `main` before this session started
— no pf2e code found anywhere in a fresh clone, only the historical
removal record (`migrations/022_remove_pf2e.sql`,
`session_addendum_pf2e_removal_shipped.md`).

## Fix 1 — Spells wizard toggle (finding #2)

Added `spells` to `prompts/wizardCategoryConfigPrompt.js`'s
`CANONICAL_CATEGORIES` (with a description matching the existing entries'
style) and to `archive/wizard-categories.html`'s toggle list. Confirmed
`routes/wizardCategoryConfig.js` needed no changes — `CATEGORY_KEYS` is
derived from `CANONICAL_CATEGORIES`, so it picked up the new key
automatically.

Per the task's own callout: Echoes has no spell system, so the toggle is
conditional on ruleset, not unconditional. `wizard-categories.html` now
fetches `/api/wizard/ruleset-options` on load (same fail-closed pattern
`archive/js/render.js`'s `applySpellsNavVisibility()` already uses for
the Spells nav link) and only renders the Spells card for a `5e` world.
One wrinkle this surfaced: `save-category-config` requires every
canonical key present, but a hidden card never reaches the DOM for
`syncFromDOM()` to read — fixed by having `syncFromDOM()` default any
category with no rendered card to a blank, disabled entry, so saving
still works cleanly for Echoes/Generic worlds.

Verified via headless browser (Playwright, against the real running app):
a 5e world renders the Spells card; an Echoes world doesn't (and still
renders its original 8 cards); saving an Echoes world's config sends a
default `{label:"", blurb:"", enabled:false}` Spells entry rather than
omitting the key (which would 400).

## Fix 2 — Promote Import to its own button (finding #6)

Two layers needed fixing, the second only surfaced during browser
verification:

1. Replaced the `<select id="gen-mode">` dropdown on
   `archive/enemies/index.html` with a visible 3-button SOURCE row
   (Import / Reflavor / Homebrew AI), defaulted to Import, with Import
   visually distinguished (cyan accent, "free · official SRD content"
   tag) from the two AI tiers.
2. Headless-browser testing caught that this row is itself nested inside
   a pre-existing 3-stage accordion shared by all 8 category pages
   (`js/render.js`'s `wireCreateEntryCollapse()`): "+ Create Entry" →
   Stage 1 (`Generate with AI` / `Enter Manually` / `Roll Randomly`) →
   Stage 2 (reveals the fields, including the SOURCE row). That left
   Import discoverable only by clicking a button literally labeled
   "Generate with AI" first — not actually "a visible, separate action
   from Generate with AI" per the finding. Added a page-local "Import
   (free)" button at the same Stage-1 level, wired without touching the
   shared `wireCreateEntryCollapse()` (kept the fixes independent, and
   that function is shared by 7 other pages this task didn't ask to
   touch) — it mirrors that function's own Stage-1→Stage-2 reveal
   (4 lines) and then synthesizes a click on the real
   `mode-btn[data-mode="import"]` button to reuse its actual selection
   logic rather than duplicating it. "Generate with AI" now defaults into
   Homebrew instead of Import, since Import has its own entry point next
   to it now.

Underlying `/api/generate-enemy` request shape (`mode`/`srdLibraryId`/
`targetCr`) is unchanged — frontend-only, as scoped.

Verified via headless browser: Stage-1 button order (Import before
Generate with AI), clicking Import reveals the fields panel with
`mode=import` set and the SRD picker visible, clicking Generate with AI
lands on `mode=homebrew`, and an Echoes world's Stage 1 has no stray
Import button.

## Fix 3 — Gate NPC Combatant upgrade behind the AI toggle (finding #7)

`renderNpcCombatantAction()` fired a real AI call
(`/api/npc-combatant-upgrade`, already gated server-side by
`requireAiEnabled`) for every 5e NPC regardless of the account's AI
Features setting. Added the `ai-action` class to the whole action row
(target-CR input + button + status, not just the button) so
`css/style.css`'s existing `body.ai-disabled .ai-action` rule hides it —
same convention as every other AI-spend control in the app (portrait
Generate, campaign-arcs "Plan with AI"). Applying it to the whole row
rather than just the button avoids leaving an orphaned input behind a
hidden button.

Verified via headless browser: an AI-enabled account sees the row
(visible, `ai-action` class present); an AI-disabled account gets
`body.ai-disabled` and the row computes to `display: none`.

## Fix 4 — NPC Combatant button persistence (finding #7)

**Reproduced, but not the hypothesized cause, and not gated behind a
regenerate at all.** The addendum's hypothesis was that
`routes/generate.js`'s NPC regenerate path might drop `isDefaultProfile`
while otherwise preserving `combatProfile`. Wrote a standalone repro
exercising the real `lib/fileWriter.js`/`lib/entriesRepo.js` save/read
round-trip (in-memory fake Supabase client, no live DB) through: create →
upgrade → regenerate. Two findings:

- `routes/generate.js`'s regenerate-preserve logic (`mode === "regenerate"
  && priorRaw && priorRaw.combatProfile` → carry the whole object
  forward) is correct and does **not** drop `isDefaultProfile`. No bug
  here — didn't touch this file.
- The actual bug is upstream of any regenerate: `lib/fileWriter.js`'s
  `saveNpcEntry()` nests the npc content object under `entryMeta.raw`
  (`raw: npc`) rather than mirroring `combatProfile` onto `entryMeta`'s
  own top level the way `roleArchetype`/`age`/`contradiction` are.
  `entriesRepo.js`'s `rowToFullEntry()` spread therefore only ever
  surfaces it at `entry.raw.combatProfile` — `entry.combatProfile`
  (what `archive/js/render.js`'s `renderNpcCombatantAction()` actually
  read) is **always** `undefined`. This means the button showed "Upgrade
  to Combatant" even immediately after a real, successful upgrade —
  before any narrative regenerate — which is a more fundamental version
  of the symptom Austin reported, not a regenerate-specific regression.

Fixed the read site to fall back to `entry.raw.combatProfile`. Re-ran the
repro script against the fixed logic: both the post-upgrade and
post-regenerate states now correctly resolve `hasBespokeProfile: true`.

## Fix 5 — Portrait generation ruleset dispatch (finding #8)

`routes/generateEntryImage.js` hardcoded `lib/fileWriter.js`'s Echoes-only
`save*Entry` functions in `CATEGORY_SAVE_FN` for every category
regardless of the world's ruleset. Added `resolveSaveFn()`, mirroring
`routes/confirmEntry.js`'s existing per-category-then-per-ruleset
dispatch exactly (same `save5eEnemyEntry`/`save5eClassEntry`/
`save5eItemEntry`/`save5eSurvivorEntry` and
`saveGenericEnemyEntry`/`saveGenericClassEntry`/`saveGenericItemEntry`/
`saveGenericSurvivorEntry` functions confirmEntry.js already imports),
normalized to a uniform `(worldId, subject, imageUrl)` call shape so the
generic writers' extra `genericSystem` argument stays an implementation
detail both `/generate-image` and `/upload-image` share one resolver for.

Traced all 6 portrait categories' templates individually rather than
assuming uniformly broken, per the task's instruction:

| Category | Per-ruleset writer exists? | Echoes template crash risk |
|---|---|---|
| enemies | Yes (5e/generic) | **Confirmed hard crash** — `lib/enemyTemplate.js` unconditionally accesses `enemy.attributes.body` (etc.); undefined for a 5e enemy's differently-shaped stat block. This is the originally-reported crash. |
| classes | Yes (5e/generic) | **Confirmed hard crash** — `lib/classTemplate.js`'s `cls.whyItWorks.map(...)` throws when `whyItWorks` is absent (a 5e class also lacks `baseName`/`evolvedName`, per the addendum). Same disease as enemies, previously unverified. |
| items | Yes (5e/generic) | No hard crash (defensive `item.category === "..."` string checks, no destructuring) — would render a blank stats section for a non-Echoes item instead, still wrong output. |
| survivors | Yes (5e/generic) | No hard crash (`survivor.attributes \|\| {}` already defensive) — same "wrong template, degraded output" risk, not a throw. |
| npcs | No — one writer for every ruleset | Never mismatched — NPCs are ruleset-agnostic narrative content by design (confirmed in `world_forge_scope.md`), so `saveNpcEntry`/`lib/entryTemplate.js` never receied a shape they weren't built for. |
| locations | No — one writer for every ruleset | Never mismatched — same as NPCs; `lib/locationTemplate.js` has no per-ruleset field requirements (matches `confirmEntry.js`'s own dispatch, which never branches locations either). |

`resolveSaveFn()` therefore only branches enemies/classes/items/survivors
by ruleset; npcs/locations keep their single unconditional writer,
matching `confirmEntry.js`'s `WRITERS` map exactly.

Verified two ways:
- A functional test exercising the real route handler (mocked
  dependencies — `getEntry`, `getRuleset`, `getGenericSystem`, every
  `save*Entry` — no live DB) across all 6 categories × 3 rulesets (18
  combinations): confirmed the correct save function fires every time,
  and that the generic writers receive `(worldId, subject, genericSystem,
  imageUrl)` in the right order.
- Full server boot with real (non-mocked) imports, catching any
  require-path typos the mocked test wouldn't surface.

## Verification bar

- `node -c` on every touched `.js` file, and on every inline `<script>`
  block extracted from touched `.html` files.
- Full server boot test (dummy env vars for Supabase/Anthropic/Gemini/
  Stripe) after every fix, confirming clean startup and a 200 from a
  static route.
- Headless-browser checks (Playwright against the real running app, with
  `archive/js/auth.js` and the handful of `/api/*` calls each page needs
  stubbed/mocked since no live Supabase project is available in this
  session) for Fixes 1–3, plus the functional dispatch test for Fix 5.

## Found along the way — out of scope for this session

- **`routes/npcCombatant.js` already supports `ruleset === "generic"`**
  (denormalizes into the `{key, label, value}` combat profile shape via
  `lib/rulesets/generic/npcCombatDefaults.js`), but
  `renderNpcCombatantAction()` in `archive/js/render.js` still hard-gates
  on `if (ruleset !== "5e") return;` — a Generic world can never see the
  Combatant upgrade button even though the backend pipeline for it
  exists. Left alone since Fix 3/4's scope was strictly the AI-toggle
  gate and the label-persistence bug, not extending Combatant to a new
  ruleset's UI.
- The `entry.combatProfile`-vs-`entry.raw.combatProfile` nesting mismatch
  fixed in Fix 4 is specific to the one read site touched
  (`renderNpcCombatantAction()`). No other code was found reading
  `entry.combatProfile` at the top level, but this is the kind of gap
  worth keeping in mind if a future feature ever wants to surface
  `combatProfile` in a new place — it lives at `entry.raw.combatProfile`,
  not `entry.combatProfile`, on every entry object `GET
  /api/entries/:category/:id` returns.
