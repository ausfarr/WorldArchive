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

- **Archive search + category page grouping/ordering** — scoped, decisions
  confirmed, not yet built. See: `session_addendum_search_and_grouping.md`
- **Future roadmap ideas (unranked, no version yet):** quest/questline
  generator, table/dungeon generation, solo-play engine (paid
  expansion/DLC tier, pending Phase 5 multi-tier billing support). Broader
  "full tool for DMs + worldbuilders" brainstorm: DM/session tools
  (session prep bundle flagged as flagship), deeper worldbuilding content
  (timeline, culture/religion, calendar, flora/fauna, relationship graph),
  cross-cutting platform features (full-text search, tagging, export,
  version history). See: `session_addendum_future_phases_roadmap.md`

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
