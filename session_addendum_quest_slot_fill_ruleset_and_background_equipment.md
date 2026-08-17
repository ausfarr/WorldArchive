# Session Addendum: Quest/Campaign Slot-Fill Ruleset Bug + Background Equipment Auto-Resolve (shipped)

Built on branch `claude/campaign-slot-fill-ruleset-p5fdyc`, one commit
per phase, same discipline prior sessions in this project established.
Both root causes were pre-diagnosed against a fresh clone in a prior chat
session; this session re-verified line numbers/exact code against the
real repo before implementing (the repo hadn't moved since the diagnosis
was written, so the pre-diagnosis held).

## Phase 1 — Quest/Campaign "Generate one" slot-fill ignored ruleset for Enemies/Items

**Root cause, confirmed:** `routes/generateEnemy.js` and
`routes/generateItem.js` (the standalone "Generate New Entry" buttons)
correctly dispatch on `getRuleset(worldId)` into three separate paths —
Echoes, 5e (with `import`/`reflavor`/`homebrew` sub-modes), and Generic.
`lib/campaignEntryGenerators.js`'s `createNewEnemy()`/`createNewItem()` —
called both by those same routes' Echoes branch AND by
`routes/campaignModule.js`'s `POST /campaign-modules/generate-slot-entry`
(the "Generate one" button on an unmatched Quest/Campaign Module slot) —
were never wired into that dispatch. They unconditionally called the
Echoes-only prompt and saved via the Echoes writer regardless of the
world's actual ruleset. On a 5e or Generic world, any enemy/item created
via Quest slot-fill was shaped like an Echoes entry (BODY/REFLEX/tier)
sitting in an otherwise-5e/Generic bestiary/item list.

`createNewNpc`/`createNewLocation`/`createNewLog` do NOT have this bug —
confirmed those three categories are genuinely ruleset-agnostic by
design (`session_addendum_ruleset_genericization.md`). Scope was Enemies
+ Items only, as diagnosed.

**Decision locked with Austin before implementation:** don't just add the
minimal fix (Homebrew-tier dispatch only) — also expose Import/Reflavor
from the slot-fill flow, matching the full capability the standalone
"Generate New Entry" buttons already have on a 5e world. This was
treated as the real scope of the session, not a stretch goal.

### 1a — Backend: reusable ruleset-dispatching generators

- `lib/rulesets/5e/homebrewEnemyGenerator.js` already had
  `generateHomebrew5eEnemy()` (built in an earlier session for the NPC
  "Combatant" upgrade) — reused as-is. Added `import5eEnemy()` and
  `reflavor5eEnemy()` as sibling functions, extracted out of
  `routes/generateEnemy.js`'s inline Import/Reflavor branches. Both take
  an **already-fetched** `srd_library` row rather than an id — the
  missing-row 404 stays the caller's job, since both
  `routes/generateEnemy.js` and `lib/campaignEntryGenerators.js` already
  need the row themselves for dedup checks / `recordImport()` / the
  "Imported from..." message, so resolving it twice would just be
  wasted work.
- `lib/rulesets/5e/homebrewItemGenerator.js` (new) — same three functions
  (`generateHomebrew5eItem`, `import5eItem`, `reflavor5eItem`) for Items,
  extracted out of `routes/generateItem.js`'s three inline branches; also
  carries `resolveItemStats()` (the weapon/armor lookup-table resolution
  that used to live inline in the route).
- `lib/rulesets/generic/homebrewItemGenerator.js` (new) —
  `generateHomebrewGenericItem()`, mirroring the existing
  `lib/rulesets/generic/homebrewEnemyGenerator.js`. Generic has no
  Import/Reflavor tier anywhere else in this codebase, so this file only
  has the one function.
- `routes/generateEnemy.js` and `routes/generateItem.js` were rewritten
  to call through these extracted functions instead of duplicating the
  branch logic a second time — the actual behavior for the standalone
  "Generate New Entry" buttons is unchanged (verified via the existing
  `scripts/testEnemyPipeline.js` / `scripts/testPipeline.js`, which still
  pass), but the logic itself now lives in one place.
- `lib/campaignEntryGenerators.js`'s `createNewEnemy()`/`createNewItem()`
  now accept optional `mode` (`"import" | "reflavor" | "homebrew"`,
  default `"homebrew"`) and `srdLibraryId`, and dispatch on
  `getRuleset(worldId)`:
  - `echoes` → unchanged, calls the original inline logic (now named
    `createNewEnemyEchoes`/`createNewItemEchoes`).
  - `5e` → `createNewEnemy5e`/`createNewItem5e`, which call
    `import5eEnemy`/`reflavor5eEnemy`/`generateHomebrew5eEnemy` (or the
    Item equivalents) based on `mode`, including the Import dedup check
    (`isAlreadyImported`/`recordImport`) the standalone route already
    does.
  - `generic` → `createNewEnemyGeneric`/`createNewItemGeneric`, Homebrew
    only (throws a clear error if the world hasn't configured its
    attribute system yet, same as the standalone route).
  Each branch calls `resolveReferencesForEntry` + `afterSave` and saves
  through the correct ruleset-specific writer (`save5eEnemyEntry` /
  `saveGenericEnemyEntry` / `saveEnemyEntry`, and the Item equivalents) —
  not the Echoes writer unconditionally.
- Return shape was diffed against what `archive/js/campaignModule.js`'s
  `cmGenerateSlot()` actually reads (`entryId`/`name`/`subtitle` at
  minimum, `subtitle` was already always `null` before this session since
  none of these functions ever set it — unchanged, not a regression) —
  this exact class of bug (a frontend-depended field dropped during
  extraction) has bitten this file twice before per
  `session_addendum_campaign_structure_shipped.md` and
  `session_addendum_campaign_encounters_battlemap_export.md`.

### 1b — Backend: `routes/campaignModule.js`

`POST /campaign-modules/generate-slot-entry` now accepts `{ mode,
srdLibraryId }` in the body alongside the existing `{ category, concept
}`, passed straight through to the `SLOT_GENERATORS[category]` call.
`npcs`/`locations`/`logs` generators simply ignore the extra properties,
unchanged.

**Deliberately deferred:** differential billing parity (Import refunds
the full spend, Reflavor refunds the gap to a field-assist rate on the
standalone routes) was NOT added to the slot-fill path this session — the
task scope only asked for the request shape to pass through. Slot-fill
Import/Reflavor currently costs a full generation's points same as
Homebrew, unlike the standalone buttons. Worth a follow-up if Austin
wants exact billing parity with the standalone forms.

### 1c — Frontend: mode/SRD picker on an unmatched slot

`archive/js/campaignModule.js`:
- `cmLoadRulesetOnce()` fetches the world's ruleset once on page load
  (`initCampaignBuilder`) — also consolidated `cmInitEncounterDifficulty`'s
  own separate ruleset fetch into reusing this same cached value instead
  of a second round trip.
- On a 5e-ruleset world, an unmatched `enemies`/`items` slot now renders
  Homebrew/Import/Reflavor mode buttons (reusing the `.mode-btn`/
  `.mode-btn-active` CSS pattern already shared by
  `archive/enemies/index.html`/`archive/items/index.html`'s own
  standalone forms) above "Generate one". Import/Reflavor reveal an
  inline SRD `<select>` (monsters for `enemies`, mundane-equipment +
  magic-items optgroups for `items`, same lists/grouping the standalone
  forms use) that must resolve to a real `srdLibraryId` before "Generate
  one" is enabled. Every other case (Echoes, Generic, or a non-enemy/item
  category on any ruleset) renders exactly as before, defaulting to
  Homebrew server-side.
- SRD monster/item lists are fetched lazily, once per page load, only
  when a preview actually contains an eligible unmatched slot — an
  Echoes/Generic world, or a preview with no such slot, never pays that
  round trip.
- Per-slot mode/SRD state is tracked in `cmSlotModeState` (keyed by
  preview-entry index) so it survives the re-renders `cmRenderPreviewEntries`
  does on every interaction; `cmLeaveSlotEmpty()` reindexes this state
  when it splices the entries array, so removing an earlier slot doesn't
  leave a later slot's picker choice misapplied after the shift.
- `cmGenerateSlot(index)` now sends `mode`/`srdLibraryId` in its POST
  body when the slot showed a picker; a client-side guard blocks the call
  (with a clear status message) if Import/Reflavor was selected but no
  SRD entry was picked yet, rather than letting an incomplete request
  reach the server.

### 1d — Verification

- `node --check` on every new/changed `.js` file (backend and frontend).
- `scripts/testQuestSlotFillRuleset.js` (new) — real end-to-end coverage
  of `createNewEnemy()`/`createNewItem()` (the exact function
  `routes/campaignModule.js`'s slot-fill route calls) through the real
  save path, using the same in-memory Supabase fake pattern as
  `scripts/testEnemyPipeline.js`/`testPipeline.js`
  (`scripts/lib/fakeSupabase.js`, which gained `.not()` support for this
  session — needed by the real `findNearestCrMonsters()` call the 5e
  Homebrew tier already makes, previously unexercised by any test using
  that shared fake). 18 assertions, all passing:
  - Echoes world: enemy/item still save with the Echoes shape (`tier`
    present, no `challengeRating`/`srdSourceId`) — zero behavior change.
  - 5e world: Homebrew saves with `challengeRating` (no `tier`); Import
    saves with `sourceMode: "import"` and the real SRD name, and a
    duplicate Import of the same SRD row is rejected; Reflavor saves with
    `sourceMode: "reflavor"`; a missing `srdLibraryId` on Import is
    rejected with a clear error instead of silently falling through to
    Homebrew.
  - Generic world: saves with `sourceMode: "homebrew"`, no
    `tier`/`challengeRating`; a world with no attribute system configured
    yet is rejected with a clear error.
- Re-ran every pre-existing offline test script touching this code path
  (`testPipeline.js`, `testEnemyPipeline.js`,
  `testProceduralRulesetGenerators.js`, `testEntryCapRefund.js`,
  `testRefundLogic.js`) — all still pass.
- Manual code-level trace (not a live browser session — no real
  Supabase/Anthropic credentials in this sandbox) confirmed the frontend
  request/response contract end-to-end for all three 5e tiers on both
  Enemies and Items, and that Generic/Echoes worlds render the slot
  exactly as before.

## Phase 2 — 5e Background equipment/tool-proficiency showed raw SRD choice text

**Root cause, confirmed against the real live-fetched SRD source**
(`character-origins.md`): all 4 real 5e Backgrounds (Acolyte, Criminal,
Sage, Soldier) embed an unresolved player CHOICE directly in their
Equipment field text — `_Choose A or B:_ (A) <gear list>; or (B) <gold>`.
Soldier additionally embeds a second choice in Tool Proficiency —
`_Choose one kind of_ Gaming Set (see "Equipment")` — referenced back
from Equipment's Option A as `(same as above)`.
`scripts/ingestSrdOrigins5e.js`'s `parseBackgrounds()` captures both
fields as raw single-line strings; `lib/rulesets/5e/srdBackgroundMapper.js`'s
`mapSrdBackgroundToEntry()` passed both straight through unresolved, so
`lib/rulesets/5e/survivorTemplate.js` rendered the raw chargen
instruction text onto a generated PC's character sheet as if it were the
PC's actual gear.

**Fix — deterministic resolution, no AI call** (matches this project's
standing preference for deterministic resolution over a model call
wherever the input space is small and closed, same reasoning as the
entry-linking system's normalized-name matching):

- `TOOL_CATEGORY_DEFAULTS` lookup (`{ "gaming set": "Dice Set" }`) —
  extensible for a future non-core background introducing another
  "choose one kind of X" category, but not over-built since Gaming Set is
  the only one that exists in the current 4-background set.
- `resolveToolProficiency()` — matches `/Choose one kind of_?\s+(.+?)\s*\(see/i`
  (note: no whitespace between "of" and the source's own italics-closing
  `_`, hence the optional `_?`), resolves the captured category against
  the lookup, falls back to the raw text untouched if unresolved.
- `resolveEquipment()` — matches `/Choose A or B:_?\s*\(A\)\s*(.+?)\s*[;,]?\s*or\s*\(B\)\s*(.+)$/i`,
  resolves to Option A's gear list, swaps any `(same as above)` for the
  concrete resolved tool name (only if resolution actually succeeded —
  an unresolved category, still reading "Choose...", is never baked into
  the swap), keeps Option B on a new `equipmentGoldAlternative` field
  rather than discarding it. Falls back to the raw text (and a null
  alternative) if the pattern doesn't match.
- Verified directly against all 4 backgrounds' real live-fetched source
  text — every one resolves cleanly with no residual "Choose" text;
  Soldier's Equipment reads "...Gaming Set (Dice Set)..." not "...Gaming
  Set (same as above)...".
- `lib/rulesets/5e/survivorTemplate.js`'s Background section (the
  Equipment `<tr>`) now shows the resolved value plus a small "(or 50 GP
  instead)" aside for `equipmentGoldAlternative` when present — cosmetic
  placement judgment call, kept minimal rather than a separate table row.

**This only affects newly-generated PCs going forward.** The mapper runs
at READ time (`getRealBackgroundsAndFeats()` → `mapSrdBackgroundRows()` →
`mapSrdBackgroundToEntry()` on every call, not just at ingestion), so no
re-ingestion of `srd_library` rows is needed. **However, any PC already
generated and saved before this fix has the raw unresolved text baked
into its own saved `backgroundDetail.equipment`/`.toolProficiency`**
(`routes/generateSurvivor.js` copies `backgroundDetail` from the resolved
background onto the PC at generation time and saves it — it is not
re-resolved on every read afterward). **Existing saved PCs will NOT
retroactively show the fix.** No backfill/migration script was written
for this, per the task's own instruction not to build one unless asked —
regenerating or manually editing the handful of PCs that may exist (the
product is still in beta) is almost certainly less work than a one-off
backfill script.

### Verification

- `node --check` on every changed file.
- Extended the existing `scripts/test5eBackgroundFeatMapper.js` (rather
  than creating a new one-off script, per the task's own note to check
  whether it was the right place first) with 4 new assertions against the
  real live-fetched SRD source: Soldier's `toolProficiency === "Dice
  Set"`; no background's resolved `equipment` contains a residual
  "Choose" substring; Soldier's `equipment` contains "Dice Set" and not
  "same as above"; every background's `equipmentGoldAlternative` is
  populated. All pass, alongside every pre-existing check in that file.
- Direct render test: built a `buildSurvivorBodyHtml()` call with a
  resolved `backgroundDetail` (Soldier) and confirmed the rendered
  Background table shows "Dice Set" and the full concrete gear list, with
  the gold alternative as a small aside — no visible instructional text.
- **Not run:** a full live browser session generating a real PC
  end-to-end through the deployed app — this sandbox has no live
  Supabase/Anthropic credentials (see prior sessions' Phase 0 findings on
  this same environment). The direct-render smoke test above plus the
  mapper's real-source-backed unit coverage is the closest equivalent
  achievable here; worth a quick manual click-through once this ships to
  a real environment.

## What shipped

**Phase 1 (backend):**
- `lib/rulesets/5e/homebrewEnemyGenerator.js` (extended: `import5eEnemy`,
  `reflavor5eEnemy`)
- `lib/rulesets/5e/homebrewItemGenerator.js` (new)
- `lib/rulesets/generic/homebrewItemGenerator.js` (new)
- `lib/campaignEntryGenerators.js` (rewritten `createNewEnemy`/
  `createNewItem` dispatch)
- `routes/generateEnemy.js`, `routes/generateItem.js` (now call through
  the extracted generators instead of duplicating logic)
- `routes/campaignModule.js` (`mode`/`srdLibraryId` pass-through)
- `scripts/lib/fakeSupabase.js` (`.not()` support)
- `scripts/testQuestSlotFillRuleset.js` (new)

**Phase 1 (frontend):**
- `archive/js/campaignModule.js` (ruleset caching, mode/SRD picker,
  `cmGenerateSlot` request shape)

**Phase 2:**
- `lib/rulesets/5e/srdBackgroundMapper.js` (deterministic resolution)
- `lib/rulesets/5e/survivorTemplate.js` (render the resolved fields)
- `scripts/test5eBackgroundFeatMapper.js` (extended coverage)

## Deferred / cut from this session's scope

- **Differential billing parity for slot-fill Import/Reflavor** (Phase
  1b) — the standalone routes refund points for a free Import or a
  cheaper Reflavor; slot-fill currently charges a full generation for all
  three tiers. Not asked for in this session's scope; flagged as a
  reasonable follow-up.
- **Backfill script for existing PCs' raw Background text** (Phase 2) —
  explicitly deferred per the task's own instruction; regenerating/
  hand-editing the small number of existing beta PCs is simpler than a
  one-off script.
- **A real live browser click-through of both features** — this sandbox
  has no live Supabase/Anthropic credentials; verification here is
  offline (fake-Supabase end-to-end tests, real-source-backed unit tests,
  direct template renders, `node --check`) rather than a real deployed
  session.
