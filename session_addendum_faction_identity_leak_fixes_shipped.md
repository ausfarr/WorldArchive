# Session addendum: two faction-identity bugs fixed

Daily autonomous-dev session. Two related, previously-unfixed correctness
bugs found by reading `lib/roster.js`, `lib/worldFlavor.js`, `routes/map.js`,
and `lib/factionDeepLore.js` in full and cross-checking every faction-key
computation against the pattern the codebase already established elsewhere.
Both are in the same general area (a faction's identity -- how it's looked
up, offered, and matched) but are otherwise independent; bundled into one
PR since each is small and low-risk on its own.

## Bug 1: ghost-placeholder factions leaking into generation prompts

### The bug

Every other `readXManifest()` in `lib/roster.js` (NPCs, enemies, items,
classes, survivors, logs, locations) takes an `opts` param and every
`buildXRosterContext()` built on top of it passes `{ locked: false }` to
exclude locked ghost-placeholder stubs. `readFactionManifest()` was the one
exception -- it took no `opts` param at all:

```js
async function readFactionManifest(worldId) {
  return listEntries(worldId, "factions");
}
```

`lib/worldFlavor.js#getFactionOptions(worldId)` calls this to build the
`{ id, name }` list every content-generation prompt in the app uses for its
"pick one of these faction ids" schema enum -- NPCs, enemies, items,
locations, classes, survivors, logs, spells (both 5e and generic rulesets),
Session Chronicles, Campaign Arc/Module entry generation, and procedural
generation's `pickFaction()`. Its own header comment states the contract
plainly: *"a generation call should only ever offer factions a reader could
actually click through to."*

A locked ghost-placeholder faction violates that contract by construction --
`lib/entryLinker.js#ensureGhostPlaceholder()` auto-creates one (real `name`,
`bodyHtml: null`, `faction: null`) the moment ANY other generated entry
name-references a faction that doesn't exist in the archive yet. This is a
routine, common occurrence (the same mechanism that creates ghost NPCs,
ghost Locations, etc.), not an edge case. Without the filter, that ghost's
name/id was offered right alongside real factions on every subsequent
generation call, and the model could pick it -- assigning a brand-new NPC,
Location, or Item to a faction whose dossier is an empty stub.

This is the same bug *class* already fixed twice in this codebase (PDF
export leaking locked ghosts onto exported pages, `2cea50a`) -- factions
were simply the one category `readXManifest()` never got the `locked`
option added to, so the fix never reached it.

`routes/map.js`'s `buildFactionSummaryText()` and
`getFactionsForAnchorDetection()` had the identical gap, grounding the
world-map backdrop/vision-anchor prompts on a ghost faction with no
`.territory` to describe -- lower-severity (no crash, just a wasted/empty
line in the grounding context) but the same root cause, fixed the same way.

### The fix

- `lib/roster.js#readFactionManifest(worldId, opts)` now accepts and
  forwards `opts` to `listEntries()`, same shape as every sibling
  `readXManifest()`. Default (no `opts`) stays unfiltered -- several
  callers legitimately need ghosts visible: `lib/factionDeepLore.js`'s
  `generateFactionDeepLore()` (finding the exact ghost it's about to
  fill), `createNewFaction()` (duplicate-name context for a *new* faction,
  where you want to avoid re-using an already-referenced-but-unfilled
  name too), and `lib/proceduralGenerators.js#uniqueId()`'s id-dedup
  (colliding with a ghost's slug is the intended "fill" behavior per
  `ensureGhostPlaceholder()`'s own header comment).
- `lib/worldFlavor.js#getFactionOptions()` now passes `{ locked: false }`.
  This is the high-impact fix -- it's the single shared function behind
  the faction enum in nearly every generation route in the app.
- `routes/map.js`'s two builders now pass `{ locked: false }` too.

### Not touched, on purpose

- `lib/factionDeepLore.js#generateFactionDeepLore()`,
  `createNewFaction()`, `syncReciprocalRelationships()`, and
  `lib/proceduralGenerators.js#uniqueId()`/`generateFactionProcedurally()`'s
  id-dedup call `readFactionManifest(worldId)` with no `opts` --
  unaffected, still see ghosts, which is correct for those call sites (see
  above).
- `lib/dateContext.js#buildKnownDatesContext()`'s factions scan also stays
  unfiltered -- harmless either way, since a ghost's `raw` is always `null`
  so it never contributes a dated field to scan.

### Verification

`scripts/testFactionOptionsLockedFilter.js` -- fakeSupabase-backed, no real
credentials needed. Seeds one real faction and one locked ghost faction,
asserts `getFactionOptions()` excludes the ghost while
`readFactionManifest(worldId)` (no opts) still includes it and
`readFactionManifest(worldId, { locked: false })` excludes it. Confirmed
failing against the pre-fix code (2 of 3 checks fail) and passing
post-fix.

## Bug 2: reciprocal-relationship sync corrupts the target faction's matching key

### The bug

`lib/factionDeepLore.js#syncReciprocalRelationships(worldId, faction)` runs
automatically after any faction save that has `relationships` -- it finds
each named faction in the live archive and splices a matching reciprocal
relationship back onto it. Building the updated object, it wrote:

```js
const updatedFaction = {
  ...targetRaw,
  id: target.id,
  factionKey: target.id,   // <-- bug: bare id, not the matching key
  relationships: [...]
};
```

`factionKey` is what `lib/fileWriter.js#saveFactionEntry()` writes straight
onto the entry's `faction` column -- the value every OTHER entry's own
`faction` field must equal to be counted in that faction's Roundup (see
`lib/factionRoundup.js#buildFactionRoundup()`'s `m.faction === factionKey`
filters) and to be offered/matched by `getFactionOptions()` above.

A faction's archive `.id` (dossier-URL slug) and its `.faction` matching
key can legitimately differ -- documented in `worldFlavor.js`'s own header
comment as a real, live case for Austin's migrated Echoes world
(`ferro_kings` matching key vs. `the-ferro-kings` slug). Every other
faction-key computation in this exact file already accounts for that --
`generateFactionDeepLore()`, a few dozen lines above, correctly computes
`const factionKey = existingEntry.faction || existingEntry.id;` -- but
`syncReciprocalRelationships()` never did.

**Concrete failure:** Faction A gets regenerated/confirmed with a
relationship naming Faction B (matching key `ferro_kings`, slug
`the-ferro-kings`, with real NPCs/enemies/locations tagged
`faction: "ferro_kings"`). The sync fires (it's called from both
`routes/confirmEntry.js`'s factions branch and
`lib/entryLinker.js`'s `SHARED_REPOS.factions` backfill path), finds
Faction B as `target`, and saves it with `factionKey: "the-ferro-kings"` --
silently overwriting `"ferro_kings"` on the `faction` column. The save
itself succeeds with no error. From that point on, every one of Faction
B's own NPCs/enemies/locations -- still tagged `faction: "ferro_kings"`,
untouched -- drops out of `buildFactionRoundup()`'s match and out of
`getFactionOptions()`'s resolution, with nothing in the UI or logs
pointing at why. It gets worse every time any OTHER faction's relationships
happen to name this one.

### The fix

```js
const targetFactionKey = target.faction || target.id;
const updatedFaction = { ...targetRaw, id: target.id, factionKey: targetFactionKey, relationships: [...] };
const targetRoundupRows = await buildFactionRoundup(worldId, targetFactionKey);
```

Matches `generateFactionDeepLore()`'s existing pattern exactly. Also fixed
the `buildFactionRoundup()` call on the same line, which had the identical
bare-`target.id` bug -- it would have built the Roundup for the *slug*
instead of the real matching key even before this save corrupted it
further.

### Verification

`scripts/testSyncReciprocalRelationshipsFactionKey.js` -- fakeSupabase-
backed. Seeds a Faction A/Faction B pair with a real Deep Lore body,
Faction B's matching key deliberately diverging from its slug (mirroring
the Echoes-world case), plus two NPCs tagged with Faction B's real matching
key. Calls `syncReciprocalRelationships()` and asserts: Faction B's saved
`.faction` column still equals its real matching key (not the slug), both
NPCs are still counted under that key, and the reciprocal relationship was
actually spliced in (a secondary check that also caught a test-authoring
mistake along the way -- `raw_json` needed to nest the Deep Lore content
under `.raw`, matching `lib/fileWriter.js#saveFactionEntry()`'s real
`entryMeta` shape, or the "has Deep Lore" guard silently short-circuits the
whole sync). Confirmed failing against the pre-fix code (`.faction` comes
back as the slug) and passing post-fix.

## Testing summary

- Both new test scripts verified to fail against pre-fix code (via
  `git stash` on just the fixed files) and pass post-fix.
- Full existing offline `scripts/test*.js` suite (everything except
  `testTenantIsolation.js`, which needs a live Supabase project) re-run
  after `npm install` -- all pass unchanged, including
  `testProceduralRulesetGenerators.js` (exercises `pickFaction()`, which
  now benefits from the same `getFactionOptions()` fix) and
  `testCampaignStructureRaces.js`/`testEntryLinker.js` (exercise adjacent
  ghost-placeholder and faction-matching code paths).
- `npm start` boots clean (real `SUPABASE_*`/`GEMINI_API_KEY` env vars
  present in this environment; `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`
  are not set at all here -- a pre-existing environment gap unrelated to
  this change, worked around locally with dummy values only to confirm
  boot, same as noted in PR #84's testing notes).
- No migration, no UI change -- nothing to screenshot; this is pure
  backend correctness.

## Risk

No billing/migrations/auth touched. Both fixes are narrowly scoped to
faction-identity plumbing already covered by the new tests.
