# Chronicled — Changelog

Internal devlog. Reverse-chronological. **Versioning:** beta releases are
`v0.1`, `v0.2`, `v0.3`... — one bump per meaningful shipped update, small
fixes bundled into whichever version they rode with. Public launch becomes
`v1.0.0`; after that, standard semver (major.minor.patch). Pure
internal-only infra work doesn't burn its own number — it's noted here but
folded into the next real version rather than given one of its own, so the
public-facing changelog's numbers never have to skip anything real.

Full detail for any entry lives in its linked addendum file — this is the
scannable index, not the full record.

**Note on backfilled entries below:** the source addenda don't carry
timestamps, so dates are marked `[DATE]` — fill in from memory if you want
them precise, or leave blank. Version numbers and ordering are corrected
and should be trusted; only the exact calendar dates are missing. Every
entry from here forward gets both a real date and a version at write time.

---

## Unreleased

- **Audit fixes: billing (items 1, 2, 3, 8, 9, 10).** Subscribing again is
  refused while Stripe still has a live subscription. The guard asks
  Stripe directly, which also self-heals a missed cancellation. Webhook
  update/delete handlers re-read the subscription from Stripe, so
  out-of-order events can't reactivate a canceled plan. An "active" row
  whose period ended over 5 days ago is treated as lapsed (a missed
  cancellation used to mean free access forever). Only renewal invoices
  reset usage. Settings prices, quotas, and pack sizes now come from the
  plan and Stripe (`lib/billingOffer.js`). Settings refreshes itself after
  checkout, and leftover credit points show as field assists. Details in
  `session_addendum_bug_batch_1.md`.

- **Bug batch 1, Phase 5 — audit (no code changes).** A prioritized list of
  surrounding issues (double-subscribe guard, webhook ordering, mid-cycle
  usage resets, the ghost-fill entry-cap bypass, faction rename/delete
  consistency, and more) in `session_addendum_bug_batch_1.md`.

- **Timeline redesign.** The Timeline page is now a vertical stream:
  large year markers, "N years later" gaps, color-coded nodes and card
  edges per source (entry date, session chronicle, log, world lore,
  regenerate), hollow dashed nodes for approximate lore dates, a pulsing
  "Today in your world" marker at the calendar's current date, source
  filter chips with counts, and linked entries shown as named pills
  instead of raw ids. Themed via the world's style variables and
  mobile-friendly. v1.10. Details in `session_addendum_bug_batch_1.md`.

- **Bug batch 1, Phase 4 — Timeline fills itself in.** Founding, birth,
  and other entry dates now reach the Timeline from every save path (the
  generate routes, Campaign modules, wizard factions, and `/confirm-entry`)
  through one shared `lib/afterEntrySave.js#afterEntrySave`, replacing ten
  local copies that had no Timeline step. Duplicates are prevented inside
  `createEntryDateEvents` for every caller. A new additive, idempotent
  backfill runs after each calendar save and from a "Sync timeline"
  button. New **"Find dates in lore"** on the Timeline page (1 generation):
  the AI proposes dated events from your lore (approximate dates shown as
  "c. Year 512"), quotes are verified against the lore, possible
  duplicates are flagged, and you tick which to add (**migration 039**).
  Found live: production was missing migration 036, so `/confirm-entry`
  returned a 500 when saving any newly dated entry; Timeline writes now
  fail safe. Removed the Settings calendar pointer. v1.9. Details in
  `session_addendum_bug_batch_1.md`.

- **Bug batch 1, Phase 3 — the calendar is a required wizard step.** New
  Step 4 of 9 (`archive/wizard-calendar.html`) between Lore and Factions:
  six non-AI templates (`lib/calendarPresets.js`), AI generate (hidden
  when AI is off), or manual entry; Continue stays disabled until the
  calendar is valid and saves it. Finished worlds use the same page in edit
  mode, linked from Calendar, Timeline, and World Info; the Settings
  editor is gone (shared `archive/js/calendarEditor.js`). Saving a change
  that would invalidate stored dates warns with counts first (nothing is
  changed). Entry date fields use a month-name dropdown instead of "Month
  #". Fixed the "wrong week names" (a wrong-length AI weekday list was
  nulled → "D1..D7"; now repaired) and the stale Calendar page
  (unsaved generated calendars, back/forward cache). Start Over now clears
  the calendar. v1.8. Details in `session_addendum_bug_batch_1.md`.

- **Bug batch 1, Phase 2 follow-up — `past_due` joins the free tier; free
  accounts can spend purchased credits.** A failed renewal is now treated
  like a cancel (free allowance + credits; a successful Stripe retry
  restores the plan). Credits bought by a free account were displayed but
  never spendable; new `check_and_spend_credits` RPC (**migration 038, run
  by hand**; until then the app behaves as before). Details in
  `session_addendum_bug_batch_1.md`.

- **Bug batch 1, Phase 2 — canceled subscribers fall back to the free
  tier.** Any `subscriptions` row, even a canceled one, used to route to the
  subscription quota (zeroed for non-active rows), so lapsed accounts got no
  free allowance and Settings showed "44 of 50 remaining… Renews <past
  date>". `canceled`/`unpaid`/`incomplete_expired` now spend the monthly
  free allowance, then purchased credits (images: free allowance only);
  `past_due` unchanged. New `lib/billingTier.js` (tier selection + status
  payloads). Settings shows a lapsed state with "Your subscription ended
  on…" + Resubscribe, and "Cancels on…" for portal cancellations. Webhook
  now syncs period + `cancel_at_period_end` on `subscription.updated`
  (**migration 037, run by hand**; the app works without it). Also fixed:
  subscribers' image counter never reset on renewal/resubscribe; free-tier
  "Resets <date>" could be days late at month ends. New
  `scripts/testBillingTier.js`, `scripts/testFreeTierAllowance.js` (live).
  v1.7. Details in `session_addendum_bug_batch_1.md`.

- **Bug batch 1, Phase 1 — wizard factions now have a correct relationship
  graph immediately.** "Expand Factions" at the end of the wizard saved Deep
  Lore without resolving relationship ids, syncing reciprocals, or
  backfilling, so the graph stayed empty until each faction was edited and
  re-saved. A sequential linking pass now runs after the parallel
  generations (`lib/afterEntrySave.js`), sharing the same linking helper
  `/confirm-entry` uses. New `scripts/testWizardFactionGraph.js`. Details in
  `session_addendum_bug_batch_1.md`.

- **Cloudflare Web Analytics on every served page.** The beacon was only on
  the marketing homepage (`marketing/index.html`); the identical snippet, same
  existing token (no new site token created), is now inserted just before
  `</body>` on the other 6 marketing pages and all 33 `archive/` app pages
  served on app.chronicled.world. HTML built in `lib/pdfExport.js` and
  `lib/dungeonMapCompositor.js` is intentionally left alone -- it's rendered
  in headless Chromium for PDF/PNG output, never served to a browser. No
  version bump (no user-visible UI change). App URLs do carry user content
  in query strings (dossier `?id=` is the slugified entry name; the Quest
  builder's `?prefillConcept=` is free text), but Web Analytics records only
  host + path (its GraphQL dataset has no query-string field), so none of it
  reaches Cloudflare. One token covers both hosts; the dashboard filters by
  host.

- **v1.6 — Feature: "Keep likeness" portrait regenerate, plus a way to regenerate a portrait that already exists at all.** Previously, once an entry had a portrait, the only UI path to a NEW one was deleting the Storage object out from under it so the resulting 404 fell through to the pending-slot Generate/Upload flow -- there was no "regenerate this portrait" affordance anywhere once a portrait existed. Added a hover-revealed "⟳ Regenerate" control directly on any rendered portrait (`archive/js/portraitActions.js`'s `initExistingPortraitControls`), with a "Keep likeness" checkbox (checked by default) that feeds the entry's *current* portrait back into the Gemini call as a reference image (`lib/imagegen.js`'s new `referenceImage` option on `generateImage()`) so a stat/lore edit or a "different pose" regenerate doesn't lose the character's established face. Answers a real competitive gap flagged in `claude_marketing/ACTION_ITEMS.md`'s 2026-08-31 entry (CharGen's "Character Reference Workflow"). Full detail in `session_addendum_portrait_keep_likeness_shipped.md`. Built 2026-09-06 on `claude/hopeful-rubin-eok7k7` (PR #82), merged 2026-09-23 with three changes: the server-side reference fetch is restricted to this project's own Supabase Storage origin with a size cap (it fetches whatever portrait URL it finds in stored `bodyHtml`), the "Make VTT Token" button now anchors below the new `.portrait-wrap` so the two portrait controls don't collide, and a regenerated portrait refreshes the token source. v1.6 via `scripts/bump-cache-version.js` (UI-affecting). New `scripts/testKeepLikenessPortrait.js` -- verifies the real route sends the existing portrait as a Gemini reference when `keepLikeness:true` and a portrait exists, and sends text-only otherwise (including when no portrait has ever been generated yet); `testPipeline.js`, `testEnemyPipeline.js`, and the check-then-act race suites still pass unchanged.

- **VTT Token Maker: one combined tool replaces the one-click "Download as
  VTT Token" button.** The dossier's "Make VTT Token" button opens a modal with
  four shapes (circle, rounded square, hex, shield), interactive pan and zoom
  to frame the face, and a border ring (on/off, defaulting to the entry's
  faction accent, with a color picker). The PNG is exported at 512px, entirely
  client-side with no AI spend. Built from three independent builds of the
  same feature (`main`'s original button,
  `claude/hopeful-rubin-fv5rv4`, `claude/hopeful-rubin-w83u0u`); neither
  branch was merged verbatim. See `session_addendum_vtt_token_maker_shipped.md`
  for what came from each. `v1.5` cache-version bump; `tokenMaker` added to
  `scripts/bump-cache-version.js`.

- **New: "Relationships" panel on every dossier page -- a one-hop visual
  graph of an entry's cross-links (who it references, and who references
  it back), not just prose.** Closes a repeatedly-flagged marketing gap
  (`claude_marketing/COMPETITOR_WATCH.md`'s 2026-08-27/2026-08-30 entries:
  CharGen, Reality Forge, and Grimoire have all shipped a visual entity
  relationship graph; Chronicled already had the underlying data, just no
  view of it). New `GET /api/entries/:category/:id/graph`
  (`lib/relationshipGraph.js`) walks the exact same field registry
  `lib/entryLinker.js` already uses to resolve/backfill cross-category
  references (`lib/entryLinkRegistry.js`) -- no new fields, no schema
  change, no AI calls, pure presentation over data that was already
  there. Hand-rolled SVG radial layout in `archive/js/render.js`
  (`renderRelationshipGraph()`), matching this codebase's no-build-step,
  no-new-dependency convention. Faction-to-faction edges are colored by
  their free-text `stance` (hostile / strained / allied / other, with a
  legend) -- `stanceGraphColor()`'s idea ported from the faction-only graph
  built independently on `claude/hopeful-rubin-2p5a67` (superseded by this
  general version and closed), with two keyword false positives fixed
  ("wary" no longer reads as war, "formally" no longer as allied). `v1.4`
  cache-version bump (UI-affecting). New `scripts/testRelationshipGraph.js`
  and `scripts/testRelationshipGraphStanceColors.js`. See
  `session_addendum_relationship_graph_shipped.md`.

- **Backlog reconciliation (2026-09-23): 12 fix branches from the
  unattended Sept 1-21 scheduled runs merged together.** The entries
  below were each written against a `main` that never saw the others, so
  two pairs needed real reconciliation rather than a plain merge:
  `findOrCreatePendingUpdate()`'s lock (dedupe race fix) and
  `updatePendingUpdate()`'s refresh-in-place (stale-suggestion fix) were
  built in parallel against the same unlocked find-then-create step --
  each would have silently undone the other as written, so the refresh
  now happens *inside* the lock (new Tests 3-4 in
  `scripts/testPendingUpdateDedupeRace.js` cover the concurrent-revised-
  confirm case neither branch tested, and fail against either fix
  alone). And the two independent lore category-drift fixes (imported
  World Bible -> Locations/Spells; Location grounding on non-core
  sections) were merged as a union in both `lib/loreParsing.js` and
  `routes/wizardLore.js`, so Locations and Spells each get tagged on
  every relevant section instead of whichever branch landed last.
  APP_VERSION bumped to v1.3 once for the batch (render.js changed).

- **Fix: "Delete World" left three tables behind, so a fresh world (same
  `world_id`) could still show old Timeline events, stale Suggested
  Updates, and old Calendar dates from the world it was supposed to
  replace.** `routes/deleteWorld.js` deliberately keeps the user's
  `worlds` row intact ("start over, not delete the account" -- Austin's
  call), so every world-scoped table's `world_id ... on delete cascade`
  FK never fires; the route already knew this and explicitly deletes
  `campaign_modules`/`campaign_arcs` for exactly that reason, but
  `timeline_events` (Phase 6), `pending_entry_updates` (Phase 7), and
  `calendar_notable_dates` (Phase 8) -- all added to the schema after
  that comment was written -- never got the same treatment. Added
  `deleteAllTimelineEvents`/`deleteAllPendingUpdates`/
  `deleteAllNotableDates` to their respective repo files and wired them
  into `POST /world/delete`, matching the existing Quest/Campaign
  pattern exactly. New `scripts/testDeleteWorldTableCoverage.js` --
  verified it fails against the pre-fix code (all three tables' rows
  survive) and passes against the fix; `testPipeline.js`,
  `testEnemyPipeline.js`, `testEntryDriftSuggestions.js`,
  `testCampaignStructureRaces.js`, `testSessionAssembly.js`,
  `testTimelineEvents.js`, `testTimelineEntryDateEvents.js`,
  `testCalendar.js`, `testCalendarPage.js`, `testEntryLinker.js`,
  `testEntryMetaPatchRace.js`, and `testSessionPrepDates.js` still pass
  unchanged.

- **Fix: two faction-identity bugs -- ghost-placeholder factions leaking
  into generation prompts as real choices, and a faction's real Roundup-
  matching key getting silently overwritten by its dossier slug during
  reciprocal-relationship sync.** `lib/roster.js#readFactionManifest()`
  was the one `readXManifest()` in that file with no `locked` option to
  even pass, so `lib/worldFlavor.js#getFactionOptions()` -- which feeds
  the "pick one of these faction ids" enum into nearly every content-
  generation prompt in the app (NPCs, enemies, items, locations, classes,
  survivors, logs, spells, procedural faction-picking) -- always included
  locked ghost-placeholder factions (`lib/entryLinker.js#ensureGhostPlaceholder()`
  auto-creates one the moment any other generated entry name-references a
  faction that doesn't exist yet). A generation could get told an empty,
  never-generated faction stub was available and pick it, directly
  contradicting `getFactionOptions()`'s own header comment. Same root
  cause as the two locked-ghost-leak bugs already fixed for PDF export --
  this was the one place still missing it. Separately,
  `lib/factionDeepLore.js#syncReciprocalRelationships()` wrote
  `factionKey: target.id` (the dossier slug) onto the faction it was
  splicing a reciprocal relationship into, instead of `target.faction ||
  target.id` (the real Roundup-matching key) -- the fallback every other
  faction-key computation in that same file already uses. For any world
  where those two values differ (a real, documented case for Austin's
  migrated Echoes world: `ferro_kings` matching key vs. `the-ferro-kings`
  slug), regenerating/confirming any faction with a relationship pointing
  at such a faction silently corrupted the target's matching key --
  the save succeeds with no error, but every entry already tagged with
  the real key instantly drops out of that faction's Roundup and out of
  faction-grounded generation context. New
  `scripts/testFactionOptionsLockedFilter.js` and
  `scripts/testSyncReciprocalRelationshipsFactionKey.js` -- both verified
  to fail against the pre-fix code and pass against the fix; full existing
  offline suite (`testPipeline.js`, `testEnemyPipeline.js`,
  `testPdfExportLockedFilter.js`, `testEntryLinker.js`,
  `testCampaignStructureRaces.js`, `testProceduralRulesetGenerators.js`,
  and every other `scripts/test*.js`) still passes unchanged. See
  `session_addendum_faction_identity_leak_fixes_shipped.md`.

- **Fix: wizard-generated (not imported) lore never grounded Spell
  generation -- another instance of the category-list-drift bug class
  already fixed for PDF export/World Status Panel/Location generation.**
  `routes/wizardLore.js`'s `GENERATED_SECTION_META` (the table deciding
  which `categoryTags` a wizard-generated-fresh lore section gets) never
  listed `"spells"` anywhere, even though `routes/generateSpell.js` grounds
  itself via `getLoreContext(worldId, { category: "spells" })` for every
  5e-ruleset world. Since `lib/loreContext.js#getRelevantLoreSections` only
  includes a non-core section when its `categoryTags` include the requested
  category, a wizard-generated Resources/Culture/History section -- and
  `technologyOrSupernatural` especially, whose own "magic" framing is the
  single most Spell-relevant section in the schema -- silently never
  reached a Spell generation prompt. Added `"spells"` to `resources`,
  `culture`, `technologyOrSupernatural`, and `history`'s `categoryTags`
  (plus `geography`, core, for display accuracy). This is the
  generate-fresh counterpart to the *imported*-lore fix already open
  against `lib/loreParsing.js` -- that file's `ALL_CATEGORIES` already
  covers the import path for both Locations and Spells; this fixes the
  other lore path for Spells specifically, the one gap neither of the two
  open Locations-lore-grounding PRs touched. New
  `scripts/testWizardLoreSpellsCategoryTag.js` -- verified it fails against
  the pre-fix code (`GENERATED_SECTION_META` wasn't exported yet, so the
  import crashes) and passes against the fix; full existing offline suite
  (every `scripts/test*.js` except `testTenantIsolation.js`) still passes
  unchanged. `npm start` boots cleanly. No UI-visible change (prompt-
  grounding data only), so no `bump-cache-version.js` run needed.

- **Fix: regenerating a Location or a Faction's Deep Lore (or an
  entryLinker.js backfill rebake landing on either) silently deleted a
  baked battle map, a dragged map pin, or a faction's AI-generated
  banner.** `saveLocationEntry()`/`saveFactionEntry()` (`lib/fileWriter.js`)
  each do a full `raw_json` overwrite built from that category's own
  content object -- but `dungeonMap` (routes/dungeonMap.js's baked battle
  map, real Gemini image spend) and `manualMapPosition` (routes/entries.js's
  dragged world-map pin) live on Locations, and `bannerImageUrl`
  (routes/worldArt.js's AI-generated faction banner) lives on Factions,
  entirely outside those content objects -- all three are written via
  `patchEntryMeta()` instead. `saveFactionEntry()` already carried
  `accentColor` forward the same way for the same reason; this was a
  documented, known-but-unfixed gap for the other three (see
  `entriesRepo.js#patchEntryMeta()`'s and `entryLinker.js`'s own NOTE
  comments) -- every Location regenerate-confirm or backfill rebake wiped
  its map bake/pin, and every Faction Deep Lore regenerate wiped its
  banner. Both writers now read the existing row first and carry these
  fields forward, mirroring the `accentColor` precedent exactly. New
  `scripts/testPatchOnlyFieldsSurviveRebake.js` -- verified it fails
  against the pre-fix code (5 failing checks) and passes against the fix;
  updated `scripts/testEntryMetaPatchRace.js`'s Test 3, which had
  previously pinned the old buggy behavior as an explicit "KNOWN GAP"
  assertion, to expect the now-fixed behavior instead; full existing
  suite (`testPipeline.js`, `testEnemyPipeline.js`, `testEntryLinker.js`,
  `testCampaignStructureRaces.js`, `testEntryDriftSuggestions.js`,
  `testSessionAssembly.js`) still passes unchanged.

- **Feature: Session Chronicle's implied-update suggestions now cover
  Locations, not just NPCs/Factions/Survivors/Items.** A Chronicle
  (`prompts/sessionChroniclePrompt.js`) already had the whole Quest/
  Campaign roster in context -- Locations included, since it's one of
  the 5 core Quest-slot categories -- and the downstream regenerate/
  status_flip machinery (`routes/pendingUpdates.js`,
  `archive/js/render.js`'s `REGENERATE_ENDPOINTS`) was already fully
  generic per category. `lib/sessionChronicleSuggestions.js`'s
  `VALID_CATEGORIES` whitelist was the only thing stopping a session
  recap that implies "the outpost was destroyed" or "the hideout was
  discovered" from surfacing a Suggested Update the same way an NPC
  dying or a faction losing territory already did. Added `locations`
  to that whitelist and to the prompt's `impliedUpdates` schema/
  instructions. Purely additive -- no schema, template, or UI change
  needed since every layer downstream was category-agnostic already.

- **Fix: `lib/logDateSuggestions.js` and `lib/sessionChronicleSuggestions.js`
  had the same check-then-act race already fixed elsewhere for Campaign
  Arc/Quest cleanup, entry metadata patches, and Suggested Updates
  apply/dismiss.** Both call the shared dedup guard in
  `lib/pendingEntryUpdatesRepo.js` (`findExistingUpdate` + `createPendingUpdate`,
  keyed on `source`/entry/category/suggestionType) before writing a new
  `pending_entry_updates` row -- it's what stops a regenerate-confirm of
  the same Log/Chronicle from inserting a fresh near-identical suggestion
  on every confirm, not just the first. But the check and the write were
  two separate, unguarded steps: two confirms of the same Log/Chronicle
  landing close together (a double-click on Confirm, or the same dossier
  open in two tabs) could each run the existence check before either
  insert landed, both see "no existing row," and both insert -- leaving
  the DM two near-identical suggestions for the same fact to dismiss/apply
  separately instead of one. Fixed by adding
  `pendingEntryUpdatesRepo.js#findOrCreatePendingUpdate()`, which wraps
  the check and the insert in one `lib/asyncLock.js` lock (same in-process
  pattern as the other fixes in this family) keyed on the same
  (world, source, entry, category, suggestionType) tuple the dedup check
  already uses -- the second caller's own existence check, re-run inside
  the lock after the first caller's insert has landed, now sees that row
  and skips the insert instead of racing it. Both call sites now go
  through it instead of calling `findExistingUpdate`/`createPendingUpdate`
  directly. New `scripts/testPendingUpdateDedupeRace.js` -- verified it
  fails against the pre-fix code (2 duplicate rows in both the Log-date
  and Chronicle-implied-update paths) and passes against the fix;
  `testEntryDriftSuggestions.js`, `testPipeline.js`, `testEnemyPipeline.js`,
  `testCampaignStructureRaces.js`, `testEntryMetaPatchRace.js`,
  `testEntryLinker.js`, and `testSessionAssembly.js` still pass unchanged.

- **Fix: a regenerated Session Chronicle or Log that revised its underlying
  facts (not just wording) left its Suggested Updates queue entry stale
  forever instead of refreshing it.** `findExistingUpdate()`
  (`lib/pendingEntryUpdatesRepo.js`) -- the dedup guard both
  `lib/sessionChronicleSuggestions.js` and `lib/logDateSuggestions.js` call
  on every regenerate-confirm of the same Chronicle/Log -- only ever
  matched on `(source, entryId, category, suggestionType)`, never compared
  the proposed content itself. A DM confirming a Chronicle that flips an
  NPC to "wounded", then regenerating it with corrected notes that actually
  flip the NPC to "dead," saw the suggestion queue keep showing "wounded"
  indefinitely -- applying it later would have written the wrong status.
  Same shape of gap in `logDateSuggestions.js` for a Log's resolved-date
  suggestion. Fixed with a new `updatePendingUpdate()` -- when a still-
  PENDING row already exists for that tuple and its `deltaText`/`payload`
  has actually changed, it's refreshed in place instead of silently
  skipped; an already-applied/dismissed row is left untouched either way
  (the DM already acted on it), matching the dedup guard's existing "any
  status" matching. New Tests 10/11 in
  `scripts/testEntryDriftSuggestions.js` -- verified both the refresh-in-
  place case and the leave-applied-rows-alone case; the full existing
  suite (`testPipeline.js`, `testEnemyPipeline.js`, `testEntryLinker.js`,
  `testCampaignStructureRaces.js`, `testSessionAssembly.js`,
  `testEntryMetaPatchRace.js`, `testPdfExportCategoryCoverage.js`,
  `testPdfExportLockedFilter.js`) still passes unchanged. See
  `session_addendum_stale_suggestion_refresh_shipped.md`.

- **Fix: imported World Bible lore never grounded Location or Spell
  generation -- same category-list drift bug as the PDF export fix below,
  in a different file.** `lib/loreParsing.js`'s `ALL_CATEGORIES` (the
  Wizard's "import an existing doc" category-tagging list, used both as
  the "unmatched section title" fallback and inside several
  `TOPIC_CATEGORY_MAP` keyword rows) was missing `"locations"` and
  `"spells"` entirely -- both real generator categories that call
  `getLoreContext(worldId, { category })` (`routes/generateLocation.js`,
  `routes/generateSpell.js`), just added after this file was written.
  Since `lib/loreContext.js`'s `getRelevantLoreSections()` only includes a
  non-core section when its `categoryTags` include the requested category,
  every non-core section of an uploaded World Bible -- resource/economy,
  culture, history, faction/politics, and (for Spells specifically) the
  `technolog|magic|supernatural|power system` row, whose own "magic"
  keyword is the single most relevant signal for Spell grounding -- was
  silently invisible to both categories; only the three `core: true` rows
  (geography/overview/glossary) got through, since core sections bypass
  category filtering entirely. Fixed by bringing `ALL_CATEGORIES` in line
  with `lib/entryLinker.js`'s own canonical `ALL_CATEGORIES` (which was
  already correct) and adding `"spells"` to the magic/technology row. New
  `scripts/testLoreCategoryTagCoverage.js` -- verified it fails against
  the pre-fix code (7 failing checks) and passes against the fix; full
  existing suite still passes unchanged.

- **Fix: Location generation never grounded on History, Faction/Politics,
  Culture, Resources, or Technology/Magic lore -- only ever saw the
  handful of "core" sections.** Same category-list-drift bug class as the
  PDF export, World Status Panel, and Spell roster-cap fixes elsewhere in
  this file: `routes/generateLocation.js` grounds itself via
  `getLoreContext(worldId, { category: "locations" })`, but neither of
  the two hand-maintained lists that decide which non-core lore sections
  get tagged `category: "locations"` (`lib/loreParsing.js`'s
  `ALL_CATEGORIES`/`TOPIC_CATEGORY_MAP`, used when a DM imports an
  existing lore doc; `routes/wizardLore.js`'s `GENERATED_SECTION_META`,
  used when the wizard generates lore fresh) had ever been updated to
  include it. `lib/loreContext.js#getRelevantLoreSections` only includes
  a non-core section when its `category_tags` includes the requested
  category, so a Location entry could only ever ground on `core:true`
  sections (Overview/Geography/Peoples/Glossary) -- a lore doc's
  History/Founding, Faction/Politics, Culture, Resources, and
  Technology/Magic sections silently never reached a Location generation
  prompt, for every world, on both the generate-fresh and import-a-doc
  paths. Fixed by adding `"locations"` to both lists' relevant entries.
  Full detail in `session_addendum_location_lore_grounding_shipped.md`.
  New `scripts/testLocationLoreGrounding.js` -- verified it fails against
  the pre-fix code (both the direct category-tag assertions and a hard
  crash importing the now-exported `GENERATED_SECTION_META`, which didn't
  exist as an export pre-fix) and passes against the fix; full existing
  offline suite (every `scripts/test*.js` except `testTenantIsolation.js`)
  still passes unchanged. `npm start` boots cleanly.

- **Cost: homebrew Spell generation's roster context was the one category
  that never got the MAX_FULL_ROSTER_LINES cap.** `routes/generateSpell.js`
  built its roster-overlap context inline with a raw, uncapped
  `listEntries(worldId, "spells")` map/join instead of going through
  `lib/roster.js` like every sibling category (NPCs, Enemies, Items,
  Classes, Survivors, Logs, Locations) -- a leftover from Spells being a
  brand-new category (multi-ruleset genericization, Phase 4) with no
  established roster-builder pattern to copy at the time. That meant a
  world's homebrew Spell generation was the one prompt whose cost grew
  unboundedly with its own history instead of being bounded at 60 entries
  like everything else (see `lib/roster.js`'s header comment on why that
  cap exists -- a category's roster context alone crosses 100% of a
  typical generation call's cost around ~390 entries without it). Added
  `buildSpellRosterContext()`/`readSpellManifest()` to `lib/roster.js`
  (same `splitRosterForCap()`/`plainOverflowNote()` shape as
  Classes/Survivors/Logs) and routed `generateSpell.js`'s homebrew path
  through it. New `scripts/testSpellRosterCap.js` -- verified it fails
  against the pre-fix code (the function it tests didn't exist yet) and
  passes against the fix, covering the empty-world fallback, under-cap
  (all listed), and over-cap (75 seeded spells -> capped at 60 lines +
  overflow note) cases; full existing offline suite
  (`testPipeline.js`, `testEnemyPipeline.js`, `testEntryLinker.js`,
  `testCampaignStructureRaces.js`, `testEntryDriftSuggestions.js`,
  `testSessionAssembly.js`, `testPdfExportCategoryCoverage.js`,
  `testPdfExportLockedFilter.js`, `testEntryMetaPatchRace.js`, and every
  other `scripts/test*.js` except `testTenantIsolation.js`) still passes
  unchanged.

- **Fix: `worldConfigRepo.js#saveDraftStep()` had the same unguarded
  check-then-act race already fixed for `patchEntryMeta()`/entry-linker
  rebake and the Campaign Arc/Quest cleanup helpers.** `routes/wizard.js`'s
  `POST /wizard/save-draft` autosaves on every field blur/change (not
  debounced or serialized client-side) -- tabbing through several fields on
  one wizard step fires several `saveDraftStep()` calls back to back.
  Each one read `world_config.draft_json`, shallow-merged its own field
  into a JS copy, and wrote the whole column back with a plain `.update()`,
  no lock -- two calls landing close together could both read the same
  pre-write `draft_json` and each write back a merge that silently drops
  the other's field (and since every step's fields live in the same
  `draft_json` column, this could clobber across steps too, not just
  within one). Now wrapped in `lib/asyncLock.js`'s `withLock()`, keyed
  `wizard-draft:${worldId}`, same pattern as the other three fixes. New
  `scripts/testWizardDraftSaveRace.js` -- verified it fails against the
  pre-fix code (two of three checks) and passes against the fix; full
  existing suite (`testPipeline.js`, `testEnemyPipeline.js`,
  `testEntryDriftSuggestions.js`, `testCampaignStructureRaces.js`,
  `testSessionAssembly.js`, `testEntryMetaPatchRace.js`, `testEntryLinker.js`,
  `testPdfExportCategoryCoverage.js`, `testPdfExportLockedFilter.js`) still
  passes unchanged.

- **Fix (v1.3): the homepage World Status Panel silently broke for every
  5e-ruleset world once Spells shipped -- same category-list-drift bug
  class as the PDF export and World Bible lore fixes below, this time in
  `archive/js/render.js`.** `renderWorldStatusPanel()`'s `CATEGORY_TARGETS`
  object (the per-category "what counts as a decent start" denominator
  for the progress bar) was never given a `spells` entry, so
  `Math.min(count / CATEGORY_TARGETS["spells"], 1)` computed as
  `Math.min(count / undefined, 1)` = `NaN` for that row. One `NaN` in the
  per-category list poisons `overallPct` (a plain sum/divide across every
  row), which broke two things on every affected homepage at once: the
  progress bar rendered an invalid `width:NaN%` (silently dropped by the
  browser, so the bar looked permanently stuck), and the `overallPct >= 1`
  "World fully archived — nice." congratulations state could never
  trigger again, since a `NaN` comparison is always `false`. Non-5e
  (Echoes/generic) worlds were unaffected -- their `category_config_json`
  already marks `spells.enabled: false` (see `archive/wizard-categories.html`),
  which excludes the row entirely -- but any 5e-ruleset world hit this on
  every single homepage load. Fixed by adding `spells: 3` to
  `CATEGORY_TARGETS`, matching the target already used for the other
  single-entity-at-a-time categories (Items/NPCs/Enemies/Survivors/Logs).
  New `scripts/testWorldStatusPanelCategoryTargets.js` -- loads the real
  `archive/js/render.js` into a Node `vm` context (a minimal `document`/
  `localStorage` stub, since this file has no module.exports or existing
  Node test harness) and calls `renderWorldStatusPanel()` for real;
  verified it fails against the pre-fix code (NaN in the rendered HTML,
  "fully archived" state unreachable) and passes against the fix. Full
  existing offline suite (every `scripts/test*.js` except
  `testTenantIsolation.js`) still passes unchanged; `npm start` boots
  cleanly. Not click-through-verified in an actual browser this session
  (no live Supabase-backed 5e world available here) -- worth a real
  homepage check on a 5e-ruleset world next session that has one.

- **Fix: "Delete World" left three tables behind, so a fresh world (same
  `world_id`) could still show old Timeline events, stale Suggested
  Updates, and old Calendar dates from the world it was supposed to
  replace.** `routes/deleteWorld.js` deliberately keeps the user's
  `worlds` row intact ("start over, not delete the account" -- Austin's
  call), so every world-scoped table's `world_id ... on delete cascade`
  FK never fires; the route already knew this and explicitly deletes
  `campaign_modules`/`campaign_arcs` for exactly that reason, but
  `timeline_events` (Phase 6), `pending_entry_updates` (Phase 7), and
  `calendar_notable_dates` (Phase 8) -- all added to the schema after
  that comment was written -- never got the same treatment. Added
  `deleteAllTimelineEvents`/`deleteAllPendingUpdates`/
  `deleteAllNotableDates` to their respective repo files and wired them
  into `POST /world/delete`, matching the existing Quest/Campaign
  pattern exactly. New `scripts/testDeleteWorldTableCoverage.js` --
  verified it fails against the pre-fix code (all three tables' rows
  survive) and passes against the fix; `testPipeline.js`,
  `testEnemyPipeline.js`, `testEntryDriftSuggestions.js`,
  `testCampaignStructureRaces.js`, `testSessionAssembly.js`,
  `testTimelineEvents.js`, `testTimelineEntryDateEvents.js`,
  `testCalendar.js`, `testCalendarPage.js`, `testEntryLinker.js`,
  `testEntryMetaPatchRace.js`, and `testSessionPrepDates.js` still pass
  unchanged.

- **New: "Download as VTT Token" button on any dossier page with a
  generated/uploaded portrait.** Client-side only (canvas crop + a border
  ring in the entry's own faction accent color, no server route, no AI
  spend) -- crops the portrait to a circle and downloads it as a PNG
  ready to drop into any VTT. Closes a small, repeatedly-flagged
  competitive gap (CharGen's free "Token Maker") at near-zero cost since
  Chronicled already generates the raw portraits. See
  `session_addendum_vtt_token_export_shipped.md`.
- **Fix: PDF export never learned about two categories added after it was
  written -- Session Packets couldn't be exported at all, and Spells was
  silently dropped from whole-world export.** `routes/export.js` keeps its
  own `VALID_CATEGORIES` set (duplicated from `routes/entries.js`'s, per
  that file's own comment on why) and it was simply never updated when
  Session Packets shipped -- so `GET /api/export/entry/session-packets/:id`
  and `GET /api/export/category/session-packets` both 400'd with "Unknown
  category," meaning the dossier page's generic "Download PDF" button (see
  `archive/js/render.js#wireEntryExportButton`, driven off `entry.category`
  for any category) failed on every click for a Session Packet. Separately,
  `lib/pdfExport.js`'s `CATEGORY_ORDER` (what the "Download Whole World"
  export actually loops over) never got `spells` or `session-packets`
  added either, even though `buildExportHtml()`'s entry rendering is
  already fully generic per category -- both were silently missing from
  every whole-world export. Fixed by adding `session-packets` to
  `routes/export.js`'s set, and both `spells`/`session-packets` to
  `CATEGORY_ORDER` and `DEFAULT_CATEGORY_LABELS` (the latter so a
  world without a custom category label falls back to "Session Packets"/
  "Spells" instead of rendering the raw internal category key). New
  `scripts/testPdfExportCategoryCoverage.js` -- verified it fails against
  the pre-fix code (10 failing checks) and passes against the fix; full
  existing suite (`testPipeline.js`, `testEnemyPipeline.js`,
  `testEntryDriftSuggestions.js`, `testCampaignStructureRaces.js`,
  `testSessionAssembly.js`) still passes unchanged.
- **Fix: PDF export (category and whole-world scope) leaked locked
  ghost-placeholder entries onto exported pages.** `lib/pdfExport.js`'s
  `buildExportHtml()` called `listEntries(worldId, category)` with no
  options at both its `category`- and `world`-scope call sites, which
  returns every row in that category including locked ghost-placeholder
  stubs -- `lib/entryLinker.js#ensureGhostPlaceholder()` auto-creates one
  (real `name`, null `bodyHtml`/`subtitle`) any time generated content
  references an NPC/Location/etc. that hasn't been generated yet, which is
  a routine, common occurrence, not an edge case. Every other reader of the
  `entries` table already excludes these (`lib/roster.js`'s roster-context
  builders, `lib/factionRoundup.js`, the category grid page's client-side
  `.filter(e => !e.locked)`) -- PDF export was the one place that didn't,
  so downloading a category or whole-world PDF produced a near-blank sheet
  (title, no content) for every such reference, surfacing content the user
  never actually generated into a document meant to only cover what they
  have. Both call sites now pass `{ locked: false }`, matching every other
  consumer. New `scripts/testPdfExportLockedFilter.js` -- verified it fails
  against the pre-fix code and passes against the fix; `testPipeline.js`,
  `testEnemyPipeline.js`, `testCampaignStructureRaces.js`,
  `testEntryDriftSuggestions.js`, `testEntryLinker.js`, and
  `testSessionAssembly.js` still pass unchanged.
- **Fix: `entriesRepo.js#patchEntryMeta()` and `entryLinker.js`'s backfill
  rebake path had the same unguarded check-then-act race already fixed
  elsewhere for Campaign Arc/Quest cleanup and Suggested Updates.**
  `patchEntryMeta()` -- the one shared function every entry-metadata patch
  goes through (dungeonMap's map-bake save, the dossier map-pin drag,
  faction banner/accent-color saves, the wizard's faction accent-color
  step, Suggested Updates' status flip) -- read a row, merged `patch` into
  its `raw_json` in JS, and wrote it back with a plain `.update()`, no
  lock. Two patches to the same entry landing close together (baking a
  Location's battle map in one tab while dragging its map pin in another,
  say) each read the same pre-patch state and each write back a merge
  that silently drops the other's change. Separately,
  `entryLinker.js#backfillReferencesFromNewEntry()`'s rebake step (fires
  after every confirm-entry save, resolving any now-linkable name
  references onto other rows) had the same shape of bug: it read a bulk
  `listEntries()` snapshot, mutated a matched row's content in JS, and
  rebaked (a full raw_json rewrite) off that possibly-stale snapshot --
  two new entries confirmed seconds apart that both name-reference the
  same not-yet-linked NPC could each resolve only their own reference and
  clobber the other's on rebake. Both now share one lock
  (`lib/asyncLock.js`, keyed `entry:${worldId}:${category}:${entryId}`):
  `patchEntryMeta()` wraps its whole read+merge+write in it, and the
  backfill rebake step re-reads the row fresh *inside* the same lock
  right before writing instead of trusting its earlier bulk-listed copy.
  Known remaining gap, documented in both files' comments rather than
  silently left to be rediscovered: a rebake is a full content-only
  rewrite with no idea a patch-only field (dungeonMap, accentColor,
  manualMapPosition) even exists, so a rebake that lands *after* a patch
  still drops that field -- the lock stops corrupted/interleaved writes,
  it doesn't turn rebake into a merge. New
  `scripts/testEntryMetaPatchRace.js` -- verified all three cases (two
  concurrent patches, two concurrent backfill rebakes, and the documented
  gap) against both the pre-fix and post-fix code;
  `scripts/testEntryLinker.js`, `testCampaignStructureRaces.js`,
  `testEntryDriftSuggestions.js`, `testSessionAssembly.js`, `testPipeline.js`,
  and `testEnemyPipeline.js` still pass unchanged.
- **Fix: Campaign Arc / Quest cleanup helpers had the same check-then-act
  race already fixed for `appendQuestToArc()` and Suggested Updates
  apply/dismiss.** `lib/campaignArcRepo.js#removeQuestFromAllCampaignArcs()`
  (deletes a Quest -> strips its id from every Campaign Arc's `questIds`)
  and `lib/campaignModuleRepo.js#removeEntryFromAllCampaignModules()`
  (deletes an entry -> strips it from every Quest's `entries`) each read a
  row, computed a filtered array in JS, and wrote it back with a plain
  `.update()` -- no guard against `appendQuestToArc()` (already locked) or
  another concurrent cleanup call landing in between. Two Quests deleted
  off the same Arc in quick succession, or a Quest-delete racing a new
  Quest being created from that Arc's unmatched stage, could silently lose
  one side's change the same way the already-fixed races did. Both now
  wrap their per-row read+write in `withLock()` keyed per
  `campaign-arc:${worldId}:${arcId}` / `campaign-module:${worldId}:${moduleId}`
  -- the same keys `appendQuestToArc()` already used, so the cleanup
  functions now serialize against it too, not just against themselves.
  `routes/campaignArc.js`'s and `routes/campaignModule.js`'s `PATCH`
  handlers (client-driven full `questIds`/`entries` replace) now acquire
  the same lock before writing, so they can't land between a cleanup
  call's read and write either. New `scripts/testCampaignStructureRaces.js`
  -- verified all three cases fail against the pre-fix code and pass
  against the fix; `testEntryDriftSuggestions.js`, `testPipeline.js`, and
  `testEnemyPipeline.js` still pass unchanged.
- **Fix: `POST /pending-updates/:id/apply`'s status_flip branch ran its side
  effects before the atomic status claim, same shape of gap the previous
  two fixes below closed elsewhere.** The `fromStatus`-guarded write at the
  bottom of `routes/pendingUpdates.js`'s `/apply` handler made the *status
  transition* itself race-safe, but the entry patch (`patchEntryMeta`) and
  Timeline event creation (`createTimelineEvent`) above it still ran off a
  plain, unguarded read of `suggestion.status`. Two concurrent `/apply`
  calls on the same suggestion (double-click, two open tabs) could both
  pass that read, both patch the entry, and both fire a Timeline event --
  only the atomic write at the end would correctly reject the loser with a
  409, by which point the duplicate side effects had already landed.
  Wrapped the whole handler body in `withLock()` (`lib/asyncLock.js`, same
  pattern as `appendQuestToArc()`'s fix just below), keyed per
  `worldId:suggestionId`, so a losing concurrent call's initial status
  check now runs after the winner's full apply -- side effects included --
  has finished, and correctly reports "already applied" instead of
  redoing the work. Also fixed `scripts/lib/fakeSupabase.js`'s query/RPC
  thenables to resolve on a real `setImmediate` tick instead of
  synchronously off a resolved promise -- without a genuine macrotask
  yield, two concurrent HTTP requests against a test server backed by this
  fake could never actually interleave, so no test using it could ever
  observe this class of race in the first place (a regression test could
  pass against pre-fix code for the wrong reason). New Test 9 in
  `scripts/testEntryDriftSuggestions.js` verified this fails against the
  pre-fix route and passes against the fix; all 17 other scripts using the
  shared fake still pass unchanged.
- **Fix: `appendQuestToArc()` had a check-then-act race, same shape as the
  Suggested Updates one below.** `lib/campaignArcRepo.js`'s
  `appendQuestToArc()` (called from `POST /campaign-arcs/:id/append-quest`
  whenever a DM saves a new Quest created from a Campaign Arc's unmatched
  stage) read the arc, computed a single-item `questIds`/`pendingStages`
  patch in JS from that snapshot, then wrote it back with a plain
  `.update()` — no guard against another write landing in between. Two
  Quests created off the same arc in quick succession (double-click, two
  open tabs) could both read the same `questIds` snapshot and each write
  back a different one-item patch; the second write wins outright, so the
  first Quest's link back to its arc silently disappears (and/or its
  `pendingStages` entry never clears, so "still needs a Quest" never
  resolves for a stage that already has one). Wrapped the read+write in
  `withLock()` (`lib/asyncLock.js` — the same in-process mutex
  `routes/confirmEntry.js`, `routes/worldArt.js`, `routes/map.js`, and
  `middleware/enforceEntryCap.js` already use for this exact shape of
  race), keyed per `worldId:arcId` so the second call's read only happens
  after the first call's write has landed.
- **Fix: Suggested Updates dismiss/apply guard had a check-then-act race.**
  `routes/pendingUpdates.js`'s "already acted on" guards (added in the fix
  just above this one) read the suggestion's status, branched in JS, and
  only then wrote the new status — two concurrent requests for the same
  suggestion (double-click, two open tabs) could both pass the read before
  either write landed, letting the loser silently overwrite the winner's
  status. `lib/pendingEntryUpdatesRepo.js#setPendingUpdateStatus()` now
  takes an optional `fromStatus` and folds it into the `UPDATE`'s `WHERE`
  clause (`.eq("status", fromStatus)`), making the transition itself
  atomic — a losing request gets back `null` instead of clobbering the
  row, and both routes now report a 409 in that case. `scripts/
  testEntryDriftSuggestions.js`'s existing dismiss/apply-guard tests
  (7-8) still pass unchanged, since the read-based fast path is untouched
  for the non-racing case.
- **Fix: Turnstile script URL typo broke CAPTCHA entirely (`challenge.cloudflare.com`
  instead of `challenges.cloudflare.com`).** `archive/js/auth.js`'s
  `loadTurnstileScript()` pointed at a hostname that doesn't resolve in DNS
  at all — a one-character typo (missing the "s") that made every call to
  `getTurnstileToken()` fail with "Could not load Turnstile.", 100% of the
  time, for every visitor, regardless of browser or network. This had been
  silently swallowed on the anonymous-signup path (`requireAuth()`'s
  try/catch just redirects to `/login.html` on any failure) since v1.1.0,
  and only surfaced as a hard login blocker once the previous fix below
  wired the same helper into `signIn()`/`signUp()`.
- **Fix: email/password login and signup broken by Supabase CAPTCHA
  protection.** `archive/js/auth.js`'s Turnstile guard (see
  `session_addendum_anonymous_access_shipped.md`) was only wired into
  `signInAnonymously()`, but Supabase's dashboard-side CAPTCHA requirement
  applies to every GoTrue call once enabled — so `signIn()`/`signUp()`
  started failing with "captcha protection: request disallowed (no
  captcha_token found)" as soon as that dashboard setting was turned on.
  Both now fetch and pass a Turnstile token the same way.
- **Two Suggested Updates queue bugs fixed: duplicate suggestions on
  regenerate, and a silent status-overwrite on dismiss.** (1)
  `createSuggestionsFromChronicle`/`maybeCreateDateSuggestion`
  (`lib/sessionChronicleSuggestions.js`, `lib/logDateSuggestions.js`) fire
  from `routes/confirmEntry.js`'s shared `afterSave()` hook on *every*
  confirm of a Chronicle/Log, not just its first — regenerating a
  Chronicle's prose (revised wording, same underlying facts) and
  confirming again re-created an identical `pending_entry_updates` row
  each time, since nothing checked whether a suggestion for the same
  `(source, entry, field)` already existed. Added
  `pendingEntryUpdatesRepo.js#findExistingUpdate()` and gated both
  triggers on it. (2) `POST /api/pending-updates/:id/dismiss`
  (`routes/pendingUpdates.js`) was missing the "already acted on" guard
  its sibling `/apply` route already has — dismissing a suggestion that
  was already `applied` (and had already patched the entry + fired a
  Timeline event) silently overwrote its recorded status to `dismissed`
  with no error, corrupting the row's own audit trail
  (`pendingEntryUpdatesRepo.js`'s header comment: "there's always a
  record of what was surfaced"). Both fixed, with two new regression
  cases in `scripts/testEntryDriftSuggestions.js` (Tests 7–8) — verified
  they fail against the pre-fix code and pass against the fix.
- **Header nav cleanup: grouped Sessions, Campaigns, and Locations into
  dropdowns, and de-duplicated the header markup across all 23 pages into
  one shared script.** The flat nav had grown to 19 tabs after Session
  Prep Companion landed and was already overflowing its own container
  width. Session Packets/Recap/Timeline/Calendar/Suggestions now collapse
  into one "Sessions ▾" dropdown, Quests/Campaigns into "Campaigns ▾", and
  Locations/Map into "Locations ▾" (Map is a visualization built on top of
  Location entries, not a separate category); every page now injects the
  header via `archive/js/siteHeader.js` instead of carrying its own copy —
  confirmed by this last addition needing a one-file edit, not 23. Full
  detail in `session_addendum_header_nav_grouping_shipped.md`.
- **Session Prep Companion: a full pre-session-prep / post-session-recap
  loop.** A real in-world calendar (minimal setup during World Setup,
  plus a browsable month-grid Calendar page overlaying Timeline events
  and DM-added recurring notable dates), generated Session Packets (Tier
  B prep documents — scene beats, NPC voice reminders, a complications
  deck) and Session Chronicles (in-setting recap journal entries, reusing
  the Logs category), a world-wide deterministic Timeline of Events, a
  persisted "Suggested Updates" queue surfacing narrative drift a
  Chronicle implies but the archive hasn't caught up to yet, entry-level
  status fields (alive/dead/active, carried forward automatically on
  regenerate), and quota/billing wiring for both new generation routes
  (a Chronicle bundles into the Packet it followed's charge when one
  exists, standalone otherwise). Full detail, per-phase breakdown, and
  what's still untested against a live world/live Supabase in
  `session_addendum_session_prep_companion_shipped.md`. Six new
  migrations (030-035, renumbered from 029-034 during merge with main —
  see that addendum's note — to make room for main's own new
  `migrations/029_split_generation_quotas.sql`) need to be applied by
  hand before this goes live.
- **Fixed a shipped-but-incomplete fix: `searchEntries()` (`lib/entriesRepo.js`)
  was still missing the `locked: false` filter.** `session_addendum_bug_audit_fixes_shipped.md`
  documents "pushed `locked: false` into the query" for both `listEntries`
  and `searchEntries`, but only `listEntries` actually got it — `searchEntries`
  only received the `SEARCH_RESULT_LIMIT` cap from that same pass. Locked
  rows are ghost placeholder stubs `lib/entryLinker.js`'s
  `ensureGhostPlaceholder()` auto-creates whenever generated content
  references an NPC/Location/etc. that doesn't exist yet — real `name`,
  null `bodyHtml`/`subtitle`. Typing a referenced-but-never-generated
  entry's name into the Archive-wide search bar surfaced it as a normal
  result; clicking through landed on a blank dossier page, since
  `renderDossier()` (`archive/js/render.js`) has no locked-entry handling
  at all (unlike category grid pages, which render a "Fill In" card for
  the same locked state). Now excluded, matching `listEntries`,
  `countEntries`, and every `buildXRosterContext` in `lib/roster.js`.
- **v1.1.0: anonymous-by-default access, replacing the separate "Try It" demo.** The whole app now works with no account at all — `archive/js/auth.js#requireAuth()` silently mints a real Supabase anonymous session (`signInAnonymously()`, guarded by Cloudflare Turnstile against scripted abuse — see that file's `getTurnstileToken()`, and the new `window.TURNSTILE_CONFIG` from `server.js`'s `/config.js`) instead of redirecting to `/login.html`, so a first-time visitor lands straight in the real wizard/generation pipeline with real, persisted content — not a canned, thrown-away demo. Because every authenticated page already funneled through `requireAuth()`, this one change made the entire app anonymous-capable with no other page-level edits. `login.html` is reframed from "the signup wall" to "save your progress" — its email/password form now upgrades the current anonymous session in place (`supabase.auth.updateUser`) instead of creating an unrelated second account, and the OAuth buttons (added two rounds ago) use `linkIdentity()` for the same reason when a session is already anonymous. `routes/billing.js`'s three checkout routes now require a real email (anonymous sessions have none) before allowing Stripe checkout. Fully removes the demo infrastructure shipped two rounds ago (`routes/demo.js`, `lib/demoPresets.js`, `lib/demoUsageRepo.js`, `archive/demo.html`, `archive/js/demoGenerator.js`) — it's strictly superseded. `marketing/pricing.html`/`index.html`/`compare.html`/`terms.html` collapse back from three pricing tiers to two (Free / Subscription), since Free itself now needs no signup step. See `session_addendum_anonymous_access_shipped.md`.
- **v1.1 split-quota pricing: text/image quotas split apart, a genuinely recurring free-account tier, and Regenerate/Remix gated to subscribers.** Images cost ~10x more per unit than a text generation ($0.08 vs $0.008), so `enforceGenerationCap`'s one shared points pool (used identically for portraits and text) is now two independent quotas — see `middleware/enforceGenerationCap.js`'s new `enforceImageGenerationCap`, `migrations/029_split_generation_quotas.sql`'s new `image_generation_count`/`used_images_this_cycle` columns and RPCs. The old one-time `TRIAL_CAP` (50 points, spent once, never resets) is retired in favor of a real recurring **monthly** free-account allowance (10 generations + 1 image/month, forever) via a new `free_cycle_reset_at` lazy-reset column on `world_config` — the first non-Stripe-billed usage in this schema to ever get a recurring cycle. Subscription bumped from $5/mo (25 generations) to **$4.99/mo (50 generations + 10 images)**, worst-case 76% margin either way. Regenerating/remixing an already-generated entry (as opposed to a fresh generation or filling a locked placeholder) is now a subscriber-only feature (`lib/regenerateGate.js`), wired into all 8 content-generation routes. Manual Mode edits are explicitly untouched — they were never gated and still aren't. `marketing/pricing.html`/`terms.html`/`archive/settings.html` updated to match. See `session_addendum_split_quotas_and_regenerate_gate.md`.
- **Pricing page comparison table, one-click OAuth, and a demo that can now be grounded in your own idea.** Three independent, additive changes: (1) `marketing/pricing.html` gets a Free-Trial-vs-Subscription comparison table below the existing plan cards, reusing `compare.html`'s table CSS rather than inventing new styles; (2) `login.html` adds Google/Discord one-click sign-in via Supabase OAuth alongside the existing email+password form (still needs the providers enabled in the Supabase dashboard before it's live); (3) the unauthenticated `/demo` generator can now take a visitor's own typed setting instead of only picking one of 3 fixed genre presets, and hands that text off (via `sessionStorage`) to prefill the wizard's Lore step if they sign up afterward. See `session_addendum_pricing_and_signup_friction.md`.
- **🔥 Production outage, fixed same-day: every generation for a subscribed
  account was 500ing with "Internal server error."** Traced via live
  Supabase logs to `check_and_spend_subscription_generation` throwing
  `column reference "used_this_cycle" is ambiguous` (Postgres 42702) —
  `returns table(..., used_this_cycle integer, ...)` implicitly declares
  `used_this_cycle` as a plpgsql variable for the whole function body,
  colliding with the unqualified `subscriptions.used_this_cycle` column
  reference inside its own `UPDATE`. Present in both the 1-arg version
  (`migrations/012_billing.sql`) and the 2-arg `p_amount` version
  (`migrations/015_field_assist_points.sql`) since the points migration,
  but never triggered until today — it only fires once
  `BILLING_ENABLED=true` *and* a real subscriber (not trial/legacy-cap,
  which take a different code path) still has quota left, and today was
  the first time that combination actually happened in production.
  `refund_subscription_generation` (018) is unaffected — it `returns
  void`, so it has no colliding OUT-parameter variable. Fixed directly in
  production (verified via a `BEGIN`/`ROLLBACK` call against the real
  subscriber row) by aliasing the table and qualifying the column
  reference; same fix captured in `migrations/028_fix_subscription_spend_column_ambiguity.sql`
  for anyone re-applying against a fresh database.
- **⚠️ Touches billing — two real money/quota races found and fixed, both
  live now that `BILLING_ENABLED=true` (v1.0.0 launch).** (1) Two
  near-simultaneous `/generate-X` requests (double-click, two tabs) for a
  world sitting one entry below its cap could both pass
  `enforceEntryCapOnGenerate`'s check before either's save landed — the
  same check-then-act race `routes/confirmEntry.js`'s `withLock()` already
  closed for its own write path, just never propagated to the 10
  generation routes it also guards. Fixed with an in-process reservation
  (`middleware/enforceEntryCap.js`'s `reserveEntryCapSlot()`) that claims
  a slot atomically (under the same `entry-cap:${worldId}` lock
  confirm-entry uses) at check time and releases it on `res.on("finish")`,
  without holding a lock across the several-second AI call in between —
  that would've serialized every generation request for a world just to
  close one narrow race. (2) `lib/worldConfigRepo.js`'s
  `addPurchasedEntries()` was a plain read-modify-write, justified as safe
  because it's "only called once per Stripe webhook event" — true for one
  event, but two *different* `checkout.session.completed` events for the
  same world (two quick entry-pack purchases, or a Stripe redelivery) can
  race each other and silently lose one purchase's +25 entries. Now an
  atomic single-round-trip Postgres function,
  `migrations/026_atomic_entries_purchased_increment.sql` — **needs to be
  applied by hand against Supabase**, no migration runner. New regression
  coverage: `scripts/testEntryCapRefund.js` gained a concurrent-requests
  case, `scripts/testEntriesPurchasedIncrement.js` is new. See
  `session_addendum_entry_cap_race_fixes_shipped.md`.

---

## v1.0.0 — 08/20/2026 — Public Launch

- **Billing is fully live** — `BILLING_ENABLED` flipped on, replacing the
  flat legacy beta cap with the real tiered flow: a 10-generation free
  trial (no card), a $5/month subscription (25 generations/cycle,
  unlimited entries), $2/5-generation credit packs (roll over, spent
  after quota), and $5/25-entry packs for worlds past the 30-free-entry
  baseline. See `session_addendum_v1_launch_cleanup.md`.
- **Found and fixed a real units bug in the live `plans` table** —
  `plans.monthly_quota` (the subscriber monthly generation quota) was
  live-set to 1250 instead of the intended 125 points (25
  generations/month), a 10x overcorrection with no matching migration
  file (migration 015's own `monthly_quota * 5` backfill was correct;
  something set it further after that). `migrations/025_fix_monthly_quota_units.sql`
  corrects it — **MUST RUN BY HAND before this is accurate in
  production**, per repo convention (no migration runner). See the same
  addendum for the full verification trail.
- **Beta framing removed everywhere it's user-facing** — every
  `archive/*.html` and `marketing/*.html` footer's `· beta` suffix
  dropped; `marketing/pricing.html`, `terms.html`, `privacy.html`,
  `index.html`, and `compare.html` rewritten from "we're in beta,
  billing is off" framing to describe what's actually live, with real
  confirmed numbers throughout (`pricing.html` now covers entries too,
  which it never mentioned before). Marketing CTAs now link straight to
  `archive/login.html?mode=signup` (new query-param support added this
  session) instead of the waitlist form; `waitlist-form.js` and the
  `/waitlist` backend route are untouched and still available for a
  future secondary use.
- **⚠️ Touches billing-adjacent code — `countEntries()` (`lib/entriesRepo.js`)
  no longer counts locked ghost placeholders against the free 30-entry
  cap.** `lib/entryLinker.js`'s `ensureGhostPlaceholder()` auto-creates
  `locked: true` stub rows whenever generated content references an
  NPC/Location/etc. that doesn't exist yet — entirely automatic, not
  something a user directly asks for. `countEntries()` (the sole basis
  for `middleware/enforceEntryCap.js`'s cap check and the Settings-page
  usage display in `routes/billing.js`) had no `.eq("locked", false)`
  filter, unlike `listEntries`'s `{ locked: false }` option, every
  `lib/roster.js` roster-context builder, and `routes/adminWorlds.js`'s
  own entry-count query (which already excludes locked rows for the same
  "placeholder rows shouldn't count as real content" reason). Content-free
  ghost stubs were silently eating into a free world's entry budget.
  `BILLING_ENABLED` defaults off so this cap isn't enforced in production
  today, but it's a live latent bug for the moment billing is turned on.
  Also fixed `lib/roster.js`'s `buildClassRosterContext` — it was the only
  one of seven `buildXRosterContext` functions missing the "nothing
  archived yet" fallback string, so a world's first-ever class generation
  rendered an empty roster section instead of an explanatory line under
  `prompts/classContentPrompt.js`'s "EXISTING ROSTER" header. Verified
  with `testPipeline.js`, `testEnemyPipeline.js`, `testEntryCapRefund.js`,
  and a manual server boot; no migration needed (`locked` column already
  exists).
- **Fixed `scripts/verifySrd5eFullIngest.js` — it was silently broken and
  never actually verifying the R5/R6 SRD ingestion parsers.** The offline
  mode (the one path a sandbox with no reachable Supabase can run) crashed
  outright on `parseWeapons is not a function` — it destructured
  `parseWeapons`/`parseArmor` from `ingestSrd5eFull.js`, which only ever
  exported a single combined `parseWeaponsAndArmor`. Before that crash it
  was also reporting false failures on every Spell/Class/Feat check
  (`Fireball range: got undefined`, `Fighter hit die: got null`, etc.) —
  those fields only exist inside each parsed row's `data_json`, not at
  the top level the script was reading from, and the Class hit-die
  expectation (`10`) never matched the source's real string format
  (`"D10 per Fighter level"`). Re-verified all of it against the live
  source markdown: `ingestSrd5eFull.js`'s actual parsers are correct and
  healthy — every failure was in this script's own stale assertions, not
  production ingestion logic. Fixed the magic-item attunement check the
  same way: there's no `attunement` field on the raw parsed row (that's
  derived downstream from `data_json.typeLine` by
  `lib/rulesets/5e/srdItemMapper.js`'s `parseAttunement()`, already
  covered by `scripts/test5eMagicItemMapper.js`) — this script now checks
  the raw `typeLine` text directly, which is the actual thing it's
  responsible for verifying. All 20 offline checks pass now; also ran
  `testPipeline.js`, `testEnemyPipeline.js`, and
  `test5eMagicItemMapper.js` to confirm nothing else regressed, and a
  manual server boot. (This sandbox's network policy still blocks the
  real Supabase host, so `--live` mode remains unexercised here — same
  standing limitation noted in prior sessions' entries below.)
- **"Help Me" field-assist system prompt is now cacheable** — every
  Help Me call on a given entry (worldId/category/faction unchanged)
  was paying full input-token price for `lib/worldFlavor.js`'s setting
  context and `lib/loreContext.js`'s lore context every single click,
  even though both are pure deterministic reads that come back
  byte-identical for every field on the same entry. `lib/fieldAssist.js`
  now builds its system prompt as instructions+setting+lore in one
  `cache_control`-marked block, with the (field-dependent, usually
  absent) quote-craft guidance appended uncached after it — repeat Help
  Me clicks while filling out one entry now hit Anthropic's prompt
  cache for that whole shared prefix instead of paying full price every
  time. No behavior change to the suggestions themselves; verified with
  a mocked-fetch harness confirming the cache block content and
  cache_control placement are correct, plus the existing
  `testPipeline.js`/`testEnemyPipeline.js` offline suites and a manual
  server boot.
- **Entry cross-linking addendum corrected** — a doc-only fix:
  `session_addendum_entry_cross_linking_shipped.md` incorrectly stated
  that Echoes' three ruleset-specific reference-field gaps
  (`evolutionEvent.locationId`, `foundAtLocationId`,
  `survivors.relationships[].toId`) were left unimplemented; they were
  actually shipped in Phase 1 (`lib/entryLinkRegistry.js`'s
  `RULESET_FIELDS.echoes`) and wired into the Echoes generate routes in
  Phase 2. The addendum had been backfilled from the pre-Phase-1
  planning doc (`phase0_entry_linking_audit.md`) rather than the real
  diff — fixed both docs so a future session doesn't spend time
  re-implementing something that already exists.
- **Quest/Campaign Module slot-fill now respects ruleset for Enemies/Items** —
  the "Generate one" button on an unmatched Quest slot used to always
  generate an Echoes-shaped entry regardless of the world's actual
  ruleset; it now dispatches on ruleset exactly like the standalone
  "Generate New Entry" buttons, and a 5e world's slot-fill also exposes
  the full Import/Reflavor/Homebrew source-tier choice, not just
  Homebrew. See `session_addendum_quest_slot_fill_ruleset_and_background_equipment.md`.
- **5e Background equipment/tool-proficiency no longer shows raw SRD
  choice text** — Soldier's Tool Proficiency and all 4 real backgrounds'
  Equipment field resolve deterministically to concrete gear instead of
  showing unresolved "Choose one kind of X" / "Choose A or B" chargen
  instructions on a generated PC's sheet. Existing saved PCs are not
  retroactively fixed (only affects newly-generated PCs going forward) —
  see the same addendum.
- **Entry cross-linking (Phases 0–4) — backfilled CHANGELOG/addendum for
  already-shipped work, plus new regression tests** — `lib/entryLinker.js`
  and `lib/entryLinkRegistry.js` (merged via PRs #28/#29, Phases 0–3) add
  a deterministic, zero-AI-call resolver that fills in cross-category
  references — a 5e spell's class list, an NPC's `relationships[]`, a
  Location's `notableNpcs[]`, a Log's `locationId`, a Faction's
  `relationships[]` — both forward (when an entry is saved, resolve
  against what already exists) and backward (when a NEW entry is saved,
  sweep the world for anything that named it and couldn't resolve
  before). Wired into every generation/confirm save path. Shipped with
  no CHANGELOG entry or addendum at the time; both are backfilled now,
  from the real Phase 0–4 commit history. Also shipped this session:
  `scripts/testEntryLinker.js`, offline regression coverage for the
  resolver (forward NAME_ONLY_ARRAY/ID_POINTER_ARRAY/self-referential
  matching, backward patch + rebake, stale-ghost cleanup,
  `ensureGhostPlaceholder` idempotency) — the feature had none before,
  despite being load-bearing for every save path in the app. **Phase 4
  (the one-off production backfill sweep for entries saved before this
  feature existed) remains incomplete** — `scripts/backfillEntryLinks.js`
  is written and tested against the fake, but this sandbox's network
  policy still blocks the real Supabase host (reconfirmed this session),
  so it has never been run for real; needs a session with real DB
  network access, or a manual hybrid run. Also fixed a stale line in
  `world_forge_scope.md` (claimed `entries_category_check` still
  rejected `'spells'` — `migrations/024` already fixed that, flagged but
  never corrected). See: `session_addendum_entry_cross_linking_shipped.md`

---

## v0.95 — 08/14/2026 — D&D 5e Ruleset Revamp

- **Real SRD Backgrounds/Species/Feats + Magic Items backfill (R6)** —
  this session had real Supabase credentials for the first time in this
  project's history, and the load-bearing finding is that the
  credentials don't help: this environment's network policy blocks the
  Supabase host outright (confirmed via the egress proxy's own
  diagnostics), so every phase below was built and thoroughly verified
  offline, not against production. Ingested real SRD Backgrounds (4 —
  the free SRD's real count, not a full PHB's 16) and Species (9) from
  `character-origins.md`, the one source file R5's ingestion never
  touched. Wired the real 9 Species into the Race/Species reference
  pool (replacing `starterRaces.js` as the default seed, kept as an
  offline fallback). Replaced the hand-authored Backgrounds/Feats with
  the real ingested ones and built the real 2024 mechanic a Background
  actually has: it grants one specific named Origin Feat immediately at
  level 1 (Acolyte → Magic Initiate, Criminal → Alert, Sage → Magic
  Initiate, Soldier → Savage Attacker), separate and additive from the
  existing optional General Feat at real ASI levels. Wired the 260 real
  SRD Magic Items (ingested by R5, never used by anything) into Items'
  Import tier, fixing two real bugs along the way: rarity/attunement
  were being silently dropped for every Import/Reflavor item, and
  Regenerate would have silently failed to recover a Magic Item's SRD
  source (`srd_id` collision risk across the two item categories).
  Backfilled R5's missing addendum and CHANGELOG entry from its real
  commit history (no addendum was ever written for R5 at the time).
  Flagged, not fixed: R5's own `verifySrd5eFullIngest.js` has a
  pre-existing broken import and possible Spells/Classes source drift;
  `world_forge_scope.md`'s R5 section is now stale ("planned, not yet
  built" — R5 shipped months of work ago). See:
  `session_addendum_r6_srd_content_backfill.md`

- **SRD ingestion + Import/Reflavor fixes (R5)** — a real, properly
  CC-BY-4.0-licensed source (`downfallx/dnd-5e-srd-markdown`) cleared
  where R4's `5e-bits/5e-database` lead didn't. Ingested real SRD
  Spells (349), Equipment, Classes (12, one sample subclass each), 17
  Feats, and 260 Magic Items into `srd_library`; wired Import (free,
  zero AI cost) / Reflavor (AI rewrites narrative, mechanics untouched)
  / Homebrew for Items, Classes, and Spells, matching the pattern
  Enemies already had. Fixed a real UI bug found along the way — Import
  and "Generate with AI" were showing the exact same panel — by
  splitting every category's Stage-2 view into two mutually-exclusive
  sub-views, and extracted the shared promotion/toggle mechanics into
  `render.js`/`style.css` once three pages needed it. Also: added
  `'spells'` to `entries.category`'s CHECK constraint (was silently
  rejecting every spell write since the category predated the
  migrations folder), gated World Info's Attributes/Skills sections to
  Echoes-only rulesets, moved Import Character into the staged
  create-entry flow, fixed Regenerate on every Import/Reflavor entry
  across all four categories (a pre-existing gap, not new this
  session), added CC-BY-4.0 attribution badges to Items/Classes/Spells,
  and bumped `srd_library`'s query limit past Spells' real row count.
  **Left for a later session:** Magic Items (260 real rows) and Feats
  (17 real rows) were ingested but never wired to anything — Import
  scope was Items/Classes/Spells only; Backgrounds/Species
  (`character-origins.md`) were never ingested at all. No addendum or
  CHANGELOG entry was written at the time — this entry and
  `session_addendum_r5_srd_ingestion_and_import_fixes.md` were
  reconstructed retroactively during R6 from the real commit history.
  See: `session_addendum_r5_srd_ingestion_and_import_fixes.md`

- **Bug fix: entry-cap rejection didn't refund the generation spend** —
  every `/generate-X` route mounts `enforceGenerationCap` (deducts
  points/quota/a credit, attaches `req.refundGeneration()`) BEFORE
  `enforceEntryCapOnGenerate`. When the entry cap rejected a request with
  a 403, it returned directly without ever calling
  `req.refundGeneration()`, so a world sitting at its 30-entry free cap
  burned a full generation's spend on every single attempt for zero
  output. Currently dormant since `BILLING_ENABLED` defaults off, but a
  live landmine for when it's flipped on. Fixed in
  `middleware/enforceEntryCap.js`; new regression test
  `scripts/testEntryCapRefund.js` (stubs billingRepo/entriesRepo/
  worldConfigRepo via `require.cache`, no DB needed).

- **Fixed the two broken generation-pipeline test scripts** —
  `scripts/testPipeline.js` and `scripts/testEnemyPipeline.js` had been
  silently dead since the Supabase/multi-tenant migration: they asserted
  against the old flat `archive/<category>/data/<id>.js` +
  `manifest.js` files the app hasn't written since (content lives in the
  `entries` table now — see CLAUDE.md's "Data model" section), and never
  accounted for the
  `requireAiEnabled`/`enforceGenerationCap`/`enforceEntryCapOnGenerate`
  middleware chain added afterward, which made every request 500 trying
  to reach a real Supabase project no sandbox has network access to. Both
  now run against a new in-memory Supabase fake
  (`scripts/lib/fakeSupabase.js`, the one shared helper in `scripts/` —
  factored out of the pattern `testProceduralRulesetGenerators.js`
  already used, since an HTTP-route pipeline test needs the same
  query-builder fake plus `user_settings` and the generation-count RPCs)
  and assert against `entriesRepo.getEntry()` instead of dead file paths.
  Deleted `testPipelineGemini.js`/`testPipelineHybrid.js` outright rather
  than fixing them the same way — both mocked a "generate NPC content via
  Gemini" pathway that was never real: `/api/generate-npc` has only ever
  called Claude — Gemini-as-text-model exists solely in the
  `/api/debug/compare-text-models` tooling — keeping them around
  un-fixable would have implied Gemini-for-content is a tested,
  supported path when it never has been. CLAUDE.md's Commands section
  updated to match.
- **Ruleset recovery, Phase R4 (5e character-sheet completeness)** — the
  5e ruleset's working parts (CR math, leveling, SRD monster import) were
  solid, but a Player Character sheet was missing pieces a real table
  would notice immediately. Shipped: an item type picker for 5e Items
  (weapon/armor/wondrous/potion/etc., "let it choose" by default);
  code-determined skill proficiencies, saving throw proficiencies (real
  class→saves mapping for all 12 core classes), passive Perception, and
  initiative bonus on every PC; a Race/Species reference system
  (Skills-pattern, not a full category — a hand-authored starter list of
  the 9 core SRD races, editable per world, with an optional PC/NPC
  dropdown whose ability score increase is applied server-side); real
  mechanical Backgrounds (13 core, skills/tool proficiency/equipment/
  feature) and an optional Feat slot at the real ASI levels (hand-
  authored fallback — see below); and full multiclassing (a PC can now
  have up to two classes, with the real HP/spell-slot/proficiency-bonus/
  saving-throw aggregation rules, verified against the published tables).
  Also added a 5e-only Encounter Difficulty / XP Budget calculator on the
  Quest builder, pure DMG-table math against a party and a Quest's
  referenced Bestiary entries. **5e-bits/5e-database license
  verification did not clear the source** — real side-by-side comparison
  against the official CC-BY-4.0 SRD 5.2.1 confirmed the underlying game
  numbers are accurate, but the repo's own README blankets all of its
  content (including the 2024 directory) under OGL 1.0a with no CC-BY-4.0
  mention anywhere, and its 2024 directory has no Spells data at all —
  so Backgrounds/Feats ship hand-authored instead, flagged for upgrade
  once a properly-labeled source (a promising lead was found) is
  ingested in a future phase. See:
  `session_addendum_r4_5e_completeness_shipped.md`

- **Multi-ruleset genericization** — worlds can now pick a `ruleset` at
  creation time (`echoes` | `5e` | `pf2e` | `generic`), permanent once
  setup completes; Echoes stays fully intact and admin-only. Shipped:
  schema + `lib/rulesets/index.js` registry, a canonical 5e SRD content
  library (201 real monsters, verified CC-BY-4.0), `archive/licenses.html`
  attribution, and real Homebrew-tier generation across essentially
  every category for both 5e AND pf2e — Bestiary (5e also has real
  Import/Reflavor with real DMG CR math; PF2e/Generic Bestiary use real
  verified level-budget math), Spells (5e cantrip scaling, pf2e
  rank-by-level + Heightened(+N) scaling), Classes (5e: real 1–20
  leveling/proficiency/ASI/spell-slot tables; pf2e: real proficiency/
  Class DC/HP formulas), Items (5e: real SRD weapon/armor/rarity tables;
  pf2e: real rune tiers + Bulk system, price guidance explicitly labeled
  an estimate), NPCs (default combat profile + "Combatant" upgrade for
  both rulesets), Player Characters (a PC is a real Class instance for
  both rulesets), a Generic ruleset with a real wizard UI plus real
  Classes/Items/NPCs/Player Characters (deliberately narrative-first —
  no leveling or rarity system, since a Generic world defines neither),
  and differential billing (Import free, Reflavor discounted, Homebrew
  full price; entry-cap bypass for imports). Ruleset-aware frontend forms
  now cover every category with a non-Echoes implementation (Bestiary/
  Classes/Items/Spells/Survivors/NPC-Combatant, across all four
  rulesets as applicable), including a brand-new Spells index page.
  Still deferred: Import/Reflavor for every PF2e category and for 5e
  Spells/Classes/Items (no verified licensed dataset for either —
  actively re-investigated, see the addendum), a Generic Spells category
  (real design work, not just wiring — no obvious narrative-first
  answer for what a homebrew "spell" even is), the
  Survivors→"Player Characters" slug rename (cosmetic, scoped out as
  risky), and the subscription/credit billing path (verified safe by
  code reading only, not exercised against a live project). See:
  `session_addendum_ruleset_genericization.md`
- **Pathfinder 2e removed (multi-ruleset recovery, Phase R1)** — PF2e had
  Homebrew-tier support across every category but no path to Import/
  Reflavor (blocked on an unresolved ORC-vs-CUP licensing question) and
  no real users on it; removed cleanly rather than deprecated, since no
  real world ever used it. Ruleset lineup is now `echoes` (admin-only) |
  `5e` | `generic`. Deleted `lib/rulesets/pf2e/`, `prompts/rulesets/pf2e/`,
  `scripts/ingestSrdPf2e.js`, and the five `scripts/testPf2e*.js` files;
  removed pf2e branches from every shared generation route, the wizard's
  ruleset picker, and every ruleset-aware frontend form. New migration
  `022_remove_pf2e.sql` tightens the `world_config` ruleset CHECK
  constraint. See: `session_addendum_pf2e_removal_shipped.md`
- **Ruleset recovery, Phase R2 (small/contained fixes)** — five
  independent fixes from the recovery plan's diagnostic findings: Spells
  is now a real, ruleset-gated wizard category toggle; Bestiary's
  Import/Reflavor/Homebrew picker got promoted out of a hidden `<select>`
  AND out from behind the "Generate with AI" accordion stage into its
  own visible Stage-1 button; the NPC Combatant upgrade button is now
  gated behind the account's AI-features toggle; a real bug behind the
  Combatant button's label not persisting was found and fixed (it read
  `entry.combatProfile`, which is always undefined — the field only ever
  lands at `entry.raw.combatProfile` — not the hypothesized regenerate
  regression, which turned out not to exist); and portrait generation
  now dispatches its save function by ruleset, not just category, fixing
  a hard crash on Enemies/Classes for any non-Echoes world. See:
  `session_addendum_r2_small_fixes_shipped.md`
- **Ruleset recovery, Phase R3 (procedural + manual entry revamp)** —
  procedural ("Roll Randomly") generation and Manual Mode both predated
  or sat outside the ruleset project and always produced Echoes-shaped
  content, crashing on write for 5e/generic worlds. Every category each
  ruleset actually has now gets a REAL procedural generator and a REAL
  manual entry form: 5e enemies (real CR math), classes (real 1-20
  shape), items (resolved SRD weapon/armor stats), spells (real cantrip
  scaling, plus a brand-new manual entry point — none existed before),
  and survivors (built on a real Class entry, computed HP/proficiency/
  spell slots); generic enemies/survivors (this world's own attributes +
  formula), classes/items (narrative-first, no invented leveling or
  rarity system). NPCs/Locations confirmed already ruleset-agnostic and
  working correctly — left untouched. New `lib/proceduralGenerators/{5e,
  generic}.js` + matching `data/proceduralTables/{5e,generic}/*.json`,
  `routes/generateProcedural.js` now dispatches by ruleset (mirroring
  `confirmEntry.js`'s established pattern), and a new
  `archive/js/rulesetManualForms.js` overrides the manual-entry/edit
  dispatch points without touching a single line of Echoes' existing
  forms. Verified via a new permanent test script
  (`scripts/testProceduralRulesetGenerators.js`, real write path against
  an in-memory Supabase fake, run 25x clean) plus 19 headless-browser
  assertions across every new form. **Follow-up, same day:** the new
  procedural tables gained real genre-awareness (same 5-bucket detection
  Echoes' own procedural system has — a sci-fi-flagged world now draws
  "Chrome Prowler" wielding a "Servo-Fist," a fantasy world draws
  "Blightfang Ghoul" wielding a "Greataxe," instead of always sounding
  the same regardless of what the wizard says), which also surfaced and
  fixed a real pre-existing bug: several flavor/description/background
  pools were plain string arrays being read with an object-shaped
  accessor, so those fields were silently `undefined` on every
  procedurally-generated entry since this phase's original ship. See:
  `session_addendum_r3_procedural_manual_revamp_shipped.md`
- **Beta feedback fixes (batch 3)** — six independent bugs from beta
  tester feedback: Quest generation can no longer select/reference a
  category the world has disabled in Wizard Step 7; faction banner
  generation now reads the live archive instead of the wizard's
  `factions_json` snapshot, so factions created after setup can get a
  banner; PDF export now inlines faction banners and location battle maps
  (previously silently absent — both are client-side-injected, never in
  `bodyHtml`); Faction Deep Lore generation got a higher token ceiling
  plus a reusable completeness check (`callClaudeExpectingJson`'s new
  `requiredKeys` param) so a near-truncated response retries instead of
  silently saving with missing sections; NPC `physicalDescription` gained
  anti-cliché steering (was converging on a recurring "mismatched eye"
  crutch); and image generation now retries once on a transient
  no-image-data Gemini response, benefiting every image call site in the
  app for free. See: `session_addendum_beta_feedback_batch3.md`
- **Archive search + category page grouping/ordering** — scoped, decisions
  confirmed, not yet built. See: `session_addendum_search_and_grouping.md`
- **Future roadmap ideas (unranked, no version yet):** table/dungeon
  generation, solo-play engine (paid expansion/DLC tier, pending Phase 5
  multi-tier billing support). Broader "full tool for DMs +
  worldbuilders" brainstorm: deeper worldbuilding content (timeline,
  culture/religion, calendar, flora/fauna, relationship graph),
  cross-cutting platform features (full-text search, tagging, version
  history). See: `session_addendum_future_phases_roadmap.md`. (Notes:
  the quest/questline generator idea originally logged here shipped in
  v0.8 as Quests + Campaigns, and the "session prep bundle" DM-tool idea
  is substantially covered by v0.8's Quest PDF export — both removed
  from this list; a query-driven "aggregate everything tagged to a
  location/scenario" version distinct from the Quest structure itself is
  still unbuilt if that's ever wanted as its own thing.)

---

## v0.10 — [DATE] — App-Wide Bug Audit & Fixes

- **Full-app bug audit and fix pass**, covering the generation pipeline,
  data layer, middleware/caps/billing, frontend, PDF/image/map
  compositing, and campaign/procedural generation. Fixed a wizard
  data-loss bug (auto-reset could wipe an already-completed world), a
  handful of real money leaks (AI-toggle bypasses, missing Stripe
  webhook idempotency, no refund path on failed generations, unlocked
  check-then-act art generation), several correctness bugs (image
  mimetype mislabeling, log regenerate silently losing its type,
  dangling references left behind by deletes), a few races, and a round
  of efficiency cleanup (N+1 roster fetches, unbounded queries, capped
  Chromium concurrency, deduped frontend helpers). See:
  `session_addendum_bug_audit_fixes_shipped.md` for the full list.

---

## v0.9 — 08/10/2026 — Manual Mode
**Phase:** Unscoped additions (post-Quests/Campaigns)

- **New: full manual entry mode.** Every category can now be created and
  edited by hand from a blank entry, with zero AI calls — same bespoke
  per-category forms Editable Content already built, opened on an empty
  entry instead of a generated one. Computed stat fields still
  auto-compute correctly either way. New independent **entries-per-world**
  cap, separate from the generation cap (30 free, +25 for $5, unlimited
  for subscribers) — inert while `BILLING_ENABLED` is off (current
  default).
- **New: field-level "Help me" AI assist**, across all 8 categories'
  free-text fields (~80 fields). A single suggestion, inserted directly
  into the field, overwriting whatever was there using it as context.
  Shares the same AI pool as full generations rather than a separate
  quota — a new integer **points** system under the hood (1 generation =
  5 points, 1 field assist = 1 point) so partial spend never touches
  floating-point math in the billing tables. Nothing user-facing ever
  says "points" — still shows as plain generations everywhere.
- **New: the World Setup Wizard is now genuinely AI-optional end to
  end.** Every step's fields were already free-text-first with Generate
  buttons as pure assist (including a paste/upload Import path for World
  Lore with zero AI calls). Closed the two remaining gaps where AI fired
  automatically regardless of choices made earlier: Step 6 (Style Guide)
  now offers a real choice — Generate World Art or Skip for now — instead
  of silently generating a world mood board and faction banners on save;
  skipped art stays generatable or uploadable later from World Info and
  each faction's own page, same Generate/Upload pattern entry portraits
  already use. Step 8 (Review) now offers the same choice for upgrading
  factions into the full Deep Lore template, instead of running that
  upgrade on every faction automatically — a world that skips it keeps
  fully real, complete faction entries in the shorter Step 4 layout, and
  any single faction can still be expanded later via its own
  "Regenerate" button.
- **New: "Generate Procedurally" — a third, zero-AI-cost way to create
  any entry**, across all 8 categories. Instant weighted-table +
  Mad-Libs-template generation (no API call, no spend against your
  generation cap — only the shared entries-per-world cap applies).
  Items and Enemies still run through the real damage/derived-stat
  formulas, not new math, so a rolled item or enemy is mechanically
  identical in rigor to an AI-generated one. Factions and Logs are
  included too but labeled experimental — both produce mechanically
  correct, correctly-grounded entries (real relationships, real roster
  references) with templated prose, a reasonable first draft rather
  than a finished entry. **Follow-up pass: genre-aware.** Every table
  now reads your world's own Genre field from setup and reskins
  accordingly — a fantasy world rolls enchanted blades and
  "Dragon's Roost"-style locations, a post-apocalyptic world rolls
  scrap-fused scavenger gear, with zero cross-genre bleed. Every pool
  also grew roughly 4-13x (e.g. items' weapon pool 45→190 rows,
  enemies' name parts 15→99 each) to push repeat-entry odds down
  substantially.
- **New: streamlined "+ Create Entry" flow.** Each category page used
  to show the AI form, "Create Manually", and "Generate Procedurally"
  all at once. Collapsed into a single "+ Create Entry" button that
  opens a clean three-way choice — Generate with AI / Enter Manually /
  Roll Randomly — instead of a cluttered panel.
- **New: account-level "AI Features" toggle** (Settings). Turns off
  every AI-spend surface for your account — category-page AI
  generation, Fill In, Regenerate, ✨ Help Me, and portrait Generate —
  enforced server-side, not just a hidden button, so it's a real kill
  switch. Manual Entry, Roll Randomly, and Upload Image all keep
  working with AI off. (Wizard AI steps, Quest/Campaign AI generation,
  and World Mood Board/Faction Banner art are explicitly out of scope
  for this pass and still fire regardless of the toggle — flagged as a
  known gap for a follow-up.)
- **Fixed: blank optional fields no longer show unrelated placeholder
  copy.** The homepage and every category page had leftover flavor text
  baked into the base template from Chronicled's own single-tenant
  origins — visible only when a world left a Category Configuration
  blurb or site tagline blank. Now defaults to nothing instead of
  copy that doesn't fit the world you're building.
- See: `session_addendum_manual_entry_mode_shipped.md`,
  `session_addendum_field_assist_shipped.md`,
  `session_addendum_manual_wizard_path_shipped.md`,
  `session_addendum_procedural_generation_shipped.md`,
  `session_addendum_create_entry_collapse_and_ai_toggle.md`

---

## v0.8 — [DATE] — Quests, Campaigns & Battle Maps
**Phase:** Unscoped additions (post-Locations)

- **New: Dungeon/Battle Maps.** AI-illustrated top-down battle map per
  Location, generated on demand. The grid is baked directly into the
  saved PNG server-side (a small Puppeteer-based compositor, reusing the
  same dependency already installed for PDF export — no new package)
  rather than drawn client-side, so a plain right-click "Save image as"
  gives a GM a print/VTT-ready gridded map, exactly like every other
  image in the app. Marker/token placement was built, then deliberately
  removed — token management is left to whatever tool a GM actually runs
  the table with; this app's job stops at handing over a clean map.
- **New: Quests.** (Shipped internally as "Campaign Module" — every
  user-facing string now says "Quest," internal table/route/file names
  were deliberately left unchanged; see the addendum for why.) Ties
  together NPCs, Locations, Enemies, Items, and Logs into a DM-buildable
  structure. Build one by hand from real existing entries, or let the
  archive propose one via AI — grounded in the world's actual roster,
  never inventing placeholder entries; any role nothing existing fits
  gets flagged with a concept for the DM to fill in on demand (with a
  choice to generate, pick something else, or leave it open).
- **New: Campaigns.** A higher-level container sequencing multiple
  Quests into an ordered story arc. AI planning is one lightweight call
  — proposes named stages, matches existing Quests where they genuinely
  fit (a much higher bar than matching a single NPC — a whole Quest
  already has its own committed story), and flags the rest for on-demand
  creation, which round-trips back into the Campaign automatically once
  built.
- **Quest & Campaign PDF export.** A Quest's export bundles every
  referenced entry's full sheet (stat blocks, dialogue, everything) into
  one printable session-prep packet, not just the reference list.
- **Bestiary/Enemies added as a referenceable category in Quests** —
  closes the gap where "encounters" had no way to specify what's
  actually being fought.
- **Reliability: retry-once-on-parse-failure**, added to every content
  generator (all 8 categories + every wizard step). A malformed or
  truncated model response now gets exactly one automatic retry (with a
  bumped token budget, since truncation is the most common real cause)
  before surfacing as a user-facing failure — reduces wasted
  generation-cap spend and token cost from transient failures.
- **Quote craft guidance strengthened** (Classes/Factions/NPCs/Enemies).
  The existing anti-cliché guidance only named the literal "I don't X —
  I Y" phrasing; broadened to catch the same negate-then-reframe
  structure regardless of wording, plus a concrete self-check the model
  applies before finalizing any signature line.
- **Bug fixes:** regenerated battle maps now actually show the new image
  (browser was caching the old one under the same storage URL); a
  generated Campaign plan no longer gets lost when navigating away to
  create a stage's Quest (now persists immediately server-side instead
  of living only in browser memory); Quest pages now show a finalized
  read-only view by default with an explicit Edit action, matching every
  other category, instead of always opening in edit mode; fixed
  `routes/worldArt.js` (World Mood Board / Faction Banners, shipped
  earlier) never having actually been mounted, so those endpoints had
  been unreachable since that feature originally shipped.
- See: `session_addendum_dungeon_maps_shipped.md`,
  `session_addendum_campaign_structure_shipped.md`,
  `session_addendum_campaign_encounters_battlemap_export.md`,
  `session_addendum_campaign_arcs_shipped.md`

---

## v0.7 — [DATE] — Locations & Maps
**Phase:** Locations (complete)
- **8th content category shipped.** Full generator + art, following the
  NPC pattern: Name/descriptor, Region/Biome, Controlling Faction (exact-
  list grounding via `worldFlavor.js`), Notable Features, Danger/Tags,
  Notable NPCs Tied Here (real entries only, no forced placeholders),
  optional Hooks/Secrets.
- **Map tier decision resolved: full computed layout shipped** (tier 3 of
  the three originally scoped — code-computes location positions, not
  just an illustrative image or hand-set pins). Biggest engineering lift
  of the three options; the other two tiers (illustrative-only,
  image+pins) were not built as intermediate steps.
- See: `phase_locations_addendum.md`
- **Also folded into this version, internal only:** persisted per-user
  cost tracking (`cost_log` table, `migrations/008_cost_log.sql`, one row
  per Claude/Gemini call tagged by world/user/category/provider with
  token counts + estimated cost — replaces the old in-memory-only
  tracking that reset on every redeploy). No public-changelog entry for
  this part. See: `session_addendum_cost_tracking.md`

## v0.6 — [DATE] — Chronicled is here; beta infra built
**Phase:** Rebrand / Beta prep
- **Phase 6 (migrate real Echoes archive as user #1) cancelled** — fresh-
  world wizard testing serves as the pipeline's proof instead.
  `scripts/migrateEchoesToWizard.js` and `lore/world_bible_sections.json`
  dead-file-cleaned as a result.
- **Renamed World Forge (internal codename) → Chronicled.** Domain
  `chronicled.world` purchased and live. Custom SMTP via Resend
  (DKIM/SPF/DMARC/MX verified). Rebranded login page, wizard footers,
  `package.json`, `README.md`.
- Beta usage cap infra built (25 generations/world, atomic enforcement,
  `middleware/enforceGenerationCap.js` + migration 006); Settings page
  with live usage readout + Delete World button (does not reset cap, by
  design).
- See: `session_addendum_chronicled_rebrand.md`

## v0.5 — [DATE] — Custom look for every world + Skills/Stats overhaul
**Phase:** Phase 4 (complete) + unscoped additions
- **Phase 4 (genericize visual style) fully complete:** site-wide
  theming, per-faction accent colors (batched generation in Style Guide
  step), art-prompt-generator genericization (CHARACTER vs. OBJECT
  framing branches, landscape composition enforced). Site *copy* also
  genericized as a side effect (World Name field, AI-suggested site
  title/tagline/status line/footer per world).
- **New Skills/Stats system (not an original phase line item):** 7 fixed
  weapon-skill categories get world-flavored display names; new 18-skill
  fixed field-skill pool feeds classes/items/survivors instead of ad hoc
  invention; skill level cap of 100 introduced. New
  `migrations/005_skill_system.sql` + `skill_system_json` column.
- Item damage formula rebuilt: `damageMin`/`damageMax` now generated
  directly per weapon instead of derived from the old
  `weaponRoll`/crit-multiplier formula.
- **New: World Info tab** — permanent read-only reference page (World
  Identity, Lore section titles, Attributes, Skills), live-pulled on
  every load rather than cached/generated.
- **New: faction generator added to the live archive page** (previously
  wizard-only) + reciprocal relationship sync between factions.
- Dead-file audit performed (documented, not yet deleted).
- See: `session_addendum.md`

## v0.4 — [DATE] — Every generator now grounded in your world's lore
**Phase:** Phase 3 (complete)
- All 7 `prompts/*ContentPrompt.js` builders rewritten to ground
  generation in a world's own saved data (lore, factions, stat/skill
  system) instead of hardcoded Echoes content.
- Live image generation bug found and fixed — deeper/separate from the
  originally scoped genericization work.
- See: `phase3_complete_addendum.md`

## v0.3 — [DATE] — Live archive read path + early theming
**Phase:** Phase 1 cleanup + early Phase 3/4 (built after Phase 2 shipped)
- Closed the original Phase 1 gap: `archive/js/render.js` and all 9
  archive pages now fetch from new `GET /api/entries/:category[/:id]`
  routes instead of injecting flat `manifest.js`/`data/*.js` files.
- Faction bridge (partial Phase 3 slice): wizard-created factions now
  also write into the live `entries` table, so they appear on the real
  Factions archive page. **Partial only** — Regenerate on a
  wizard-created faction still routes through the legacy
  `FACTION_SEEDS`-only endpoint and errors (known, accepted gap at the
  time).
- Live site theming (early Phase 4 slice) pulled forward: wizard's Style
  Guide step now actually restyles the site, not just grounds a future
  art-prompt generator.
- See: `frontend_read_path_and_theming_addendum.md`

## v0.2 — [DATE] — Guided world setup wizard
**Phase:** Phase 2 (complete)
- All 8 wizard steps built, deployed, confirmed working end to end: Seed
  & Vision, Lore path choice + World Lore, Factions, Stat System, Style
  Guide, Category Configuration, Review & Confirm.
- Shared infra: `lib/worldConfigRepo.js` and friends for typed
  read/write per step.
- **Progressive-commit pattern adopted mid-build**, correcting the
  original "nothing commits until Step 8" design: starting with Step 3
  (World Lore), each step now writes directly to its real destination on
  save. Kept for every step going forward, trading cleaner "Start Over"
  semantics for crash-survival and letting later steps ground in real,
  already-finalized prior-step data. (Corrected from an earlier version
  of this changelog, which had mis-ordered this after v0.3's work — it
  was actually a mid-Phase-2 decision, not a later one.)
- See: `phase2_complete_addendum.md`, `scope_doc_addendum_progressive_commit.md`

## v0.1 — [DATE] — Accounts & private worlds
**Phase:** Phase 1 (complete)
- Supabase auth + DB/storage isolation (no generator/content changes).
  Schema/RLS, `fileWriter`/`roster` rewrite, real auth wiring
  (`requireAuth()`), automated tenant-isolation testing, hosting
  migration off Replit to Railway (later Render).
- See: `multi_tenant_pivot_scope.md` Section 5.

---

*Add new entries at the top of the numbered list (below Unreleased). Keep
each entry to a few scannable bullets — anything needing full
architectural detail gets its own addendum file, linked from the entry.
Mark internal-only entries clearly so it's obvious they won't appear on
the public changelog.*
