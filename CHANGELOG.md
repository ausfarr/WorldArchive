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
