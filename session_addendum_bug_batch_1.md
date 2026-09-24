# Session addendum — Bug batch 1

Four bugs found by Austin while testing, fixed across five phases, one
commit per phase. This file records the decisions and each phase's
architectural detail; `CHANGELOG.md`'s `## Unreleased` bullets link here.
Sections are appended phase by phase.

## Decisions (made by Austin, not re-litigated)

1. **Canceled subscribers fall back to the free tier** (monthly free
   generations + free image allowance). Purchased credits still work.
2. **Calendar becomes a new required wizard step** after Lore, before
   Factions, with AI-generate and manual entry. The calendar editor is
   removed from Settings; already-completed worlds reach it through the
   calendar step's edit mode (Phase 3).
3. **The calendar step ships non-AI presets** (Earth, High Fantasy tenday,
   Sci-Fi Standard Cycle, Wild West 1878, Post-Collapse, Sword & Sorcery),
   available with AI on or off.
4. **Timeline gets structured date events from every save path, plus a
   backfill.** AI extraction of dates from lore/history prose is in scope,
   implemented fully (Phase 4).

Phase 0 follow-up answers:

- **Free accounts can't spend purchased credits** (the free branch of
  `middleware/enforceGenerationCap.js` never touches `credit_ledger`; only
  the subscription RPC does). Deferred — would need a small credits-only
  spend RPC + migration. Listed in the Phase 5 audit.
- `BILLING_ENABLED=true` in production.
- Timeline `entry_date` dedupe key is enforced for every caller, including
  `/confirm-entry` (Phase 4).
- Wizard Start Over / Delete World clear `calendar_config` (Phase 3), now
  that the calendar is a wizard step.

## Phase 0 corrections to the original bug trace

- Procedural generation does **not** bypass `/confirm-entry` —
  `routes/generateProcedural.js` only returns an entry; the frontend saves
  it through `/confirm-entry`.
- `scripts/bump-cache-version.js` no longer needs `glob` (plain `fs` scan);
  it just doesn't cover every script (`calendarPage.js`, `timeline.js` are
  bumped by hand).
- There were ten near-identical local "after save" linking helpers, not
  four (`routes/generate*.js`, `lib/campaignEntryGenerators.js`,
  `routes/confirmEntry.js`).

## Phase 1 — relationship graph on wizard-generated factions

**Bug:** `POST /api/wizard/upgrade-factions` (`routes/wizardReview.js`)
ran every faction's Deep Lore generation in parallel and saved each one
straight through `saveFactionEntry()`. It never ran
`resolveReferencesForEntry` (so `relationships[].toId` stayed empty),
`syncReciprocalRelationships`, `backfillReferencesFromNewEntry`, or
`ensureGhostPlaceholder`. `lib/relationshipGraph.js#buildEntryGraph` only
draws edges for resolved ids, so wizard factions showed no relationship
graph until the DM edited and re-saved each one through `/confirm-entry`,
which does run all four.

**Fix:**

- New `lib/afterEntrySave.js`:
  - `linkAfterSave(worldId, category, saved, unresolvedGhosts)` — the
    backfill + ghost-placeholder steps, extracted verbatim from
    `routes/confirmEntry.js`'s `afterSave()`, which now calls it (same
    order, identical behavior). Phase 4 moves the other generate routes
    onto the same helper when it adds timeline events there.
  - `linkWizardFactionsSequentially(worldId, factionIds)` — the wizard
    post-pass. For each upgraded faction, **one at a time**: re-read the
    row fresh, resolve references, save (persisting the resolved ids),
    sync reciprocal relationships, then `linkAfterSave`.
- `routes/wizardReview.js` runs that post-pass after `Promise.allSettled`
  settles, over the factions that upgraded. The response gains
  `linkFailed: [...ids]`; the frontend ignores it (the factions themselves
  are saved either way).

**Why sequential, and why re-read:** the generations stay parallel because
each only writes its own row. `syncReciprocalRelationships` writes into
*other* factions' rows (that's why it was originally left out of the
wizard path — see its header comment in `lib/factionDeepLore.js`), so the
post-pass runs one faction at a time. Each iteration re-reads its row
rather than reusing the object the generation returned, because an earlier
iteration's reciprocal sync or backfill may already have written to it;
saving the stale copy would drop that write.

**Ordering matters:** `syncReciprocalRelationships` appends
`{ faction, stance, why }` *without* a `toId`; the `backfillReferencesFromNewEntry`
that runs after it is what resolves that appended item's id. Same order
`/confirm-entry` has always used.

**Failure handling:** per-faction try/catch; failures are logged and
returned in `linkFailed`, never thrown — the review step and the other
factions' linking always complete.

**Test:** `scripts/testWizardFactionGraph.js` drives the real
`POST /wizard/save-factions` → `POST /wizard/upgrade-factions` routes with
only the Anthropic call stubbed (three factions: one names both others,
one names it back, one names nobody). Asserts every `relationships[]` item
has a `toId`, the missing reciprocal is added once, existing reciprocals
aren't duplicated, and `buildEntryGraph` returns the edges immediately.
Fails 7 of 13 checks against the pre-fix `routes/wizardReview.js`; passes
all 13 with the fix. Runs against `fakeSupabase` by default; `--live` runs
the same flow against real Supabase with a disposable user/world deleted
in a `finally` block (same pattern as `scripts/testTenantIsolation.js`).
