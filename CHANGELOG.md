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
