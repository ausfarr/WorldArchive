# Session Addendum — Beta Feedback Fixes (Batch 3)

Six independent bugs surfaced by a beta tester, root-caused before this
session started. Out of scope (handled separately): the fixed six-attribute
stat system and the fixed 8-category taxonomy — `prompts/wizardStatSystemPrompt.js`,
`prompts/wizardCategoryConfigPrompt.js`, and category-count logic were not
touched.

## Fix 1 — Disabled categories still get referenced by Quest generation

**Files:** `routes/campaignModule.js`, `prompts/campaignModulePrompt.js`

`VALID_ENTRY_CATEGORIES` was a fixed 5-category set with no awareness of a
world's `category_config_json.enabled` flags, so a disabled category (e.g.
Logs hidden in Wizard Step 7) could still be selected by the Quest
generator or filled via `/generate-slot-entry` — with no nav link or page
for the user to ever see the result.

- Added `getEffectiveEntryCategories(worldId)` — reads `getCategoryConfig`
  and filters `VALID_ENTRY_CATEGORIES` down to whatever has
  `enabled !== false` (a category with no config entry yet defaults to
  enabled, matching `archive/js/render.js`'s own `cfg.enabled === false`
  check).
- `POST /campaign-modules/generate`: computes the effective set up front;
  fails fast with a 400 (and refunds the generation) if it's empty rather
  than silently defaulting to a hidden category. Roster context builders
  (`buildRosterContext` etc.) are only called for enabled categories — an
  `effectiveCategories.has(cat) ? build...() : Promise.resolve(null)`
  ternary per category, so a disabled category costs zero extra tokens,
  not just a post-hoc filter. The old `VALID_ENTRY_CATEGORIES.has(e.category)
  ? e.category : "npcs"` fallback now checks the effective set and falls
  back to `"npcs"` only if npcs itself is enabled, otherwise the first
  available enabled category.
- `POST /campaign-modules/generate-slot-entry`: added an explicit
  enabled-check (with refund) after the existing "unknown category" check.
- `prompts/campaignModulePrompt.js`: rewritten so the schema's `"category"`
  enum and every roster section (`NPC ROSTER`, `LOCATION ROSTER`, etc.) are
  built only from the enabled set passed in from the route — a disabled
  category is never mentioned in the prompt at all, not just filtered from
  the output. The static-instructions block's category-list prose
  (`STATIC_INSTRUCTIONS`) also adapts, so a Locations/Enemies-disabled
  world doesn't get told "an encounter without an Enemy is incomplete."

**Note on prompt caching:** `STATIC_INSTRUCTIONS` is no longer byte-identical
across every world (it now depends on that world's enabled-category set),
which slightly narrows Anthropic prompt-cache reuse across different worlds
with different category configs. Correctness was prioritized over that —
it still caches fine across repeated calls for the *same* world, since a
world's category config rarely changes between Quest generations.

## Fix 2 — Faction banners fail for factions created after the wizard

**File:** `routes/worldArt.js`

Both `POST /world-art/generate-faction-banners` (batch) and
`POST /world-art/generate-faction-banner/:factionId` (single) read
`getFactions(worldId)` — a snapshot of `world_config.factions_json` written
once during the wizard. A faction created later via the normal generate/
create-entry flow lands in the `entries` table but never gets appended to
that snapshot, so the single route threw `"Faction not found."` and the
batch route silently skipped it.

- Batch route now sources from `listEntries(worldId, "factions")`
  (live archive) instead of `getFactions()`.
- Single route now uses `getEntry(worldId, "factions", factionId)` (a
  direct id lookup, replacing the old find-in-array-from-getFactions
  pattern) — also fixes a minor inefficiency (no longer fetches every
  faction just to find one).
- `generateOneFactionBanner()`'s `concept` field: verified against the
  actual row shape returned by `entriesRepo.js` (`rowToManifestEntry`/
  `rowToFullEntry` both spread `raw_json` onto the object). A faction with
  Deep Lore already generated has its wizard-seed `concept` nested under
  `.raw.concept` (`lib/fileWriter.js`'s `saveFactionEntry` stores
  `raw: faction`); a wizard-bridged faction that hasn't had Deep Lore run
  yet has no `concept` field at all in the entries table (only `subtitle`
  carries that text, per `routes/wizardFactions.js`'s `buildFactionEntryMeta`).
  Neither shape matches the old `factions_json`-sourced flat `.concept`
  field, so the helper now checks `faction.concept || faction.raw?.concept
  || null` to cover both eras of the entry's lifecycle. `concept` is
  flavor-only context for the art prompt (falls back to `null` cleanly),
  so this isn't load-bearing — it just keeps the art prompt as informed as
  before wherever the data exists.
- `getFactions()`/`factions_json` itself is untouched — still correct for
  the wizard-time flows (`routes/wizardFactions.js`, `routes/wizardStyleGuide.js`,
  `lib/factionDeepLore.js`'s wizard-seed path).
- Verified unchanged: the per-faction lock key
  (`` `faction-banner:${worldId}:${faction.id}` ``) and the "skip if a
  banner already exists" guard both key off `faction.id`, which is
  present and identical regardless of which source (`factions_json` vs.
  `entries`) the faction object came from.

## Fix 3 — Faction banners and battle maps missing from PDF export

**File:** `lib/pdfExport.js`

`buildEntryBlock()` only ever rendered `entry.bodyHtml`. Faction banners
and location battle maps are both fetched from Supabase Storage and
injected into the DOM client-side at page load (`archive/js/render.js`'s
`loadWorldMoodBoard` for banners, `renderLocationBattleMap` for maps) —
neither is ever written into `bodyHtml`, so Puppeteer rendering the static
`wrapDocument()` HTML string never picked them up.

- `buildEntryBlock` is now `async` and takes an explicit `category`
  parameter (passed by each of its 4 call sites — `entry`/`campaign`/
  `category`/`world` scope — rather than trusting `entry.category`, since
  campaign-scope entries in particular are more reliably typed by the
  Quest's own `ref.category`).
- Added `buildFactionBannerBlock(worldId, entry)` — mirrors the live
  dossier page's actual trust model: a real Storage existence check via
  `factionBannerExists`/`getFactionBannerUrl` (from `lib/fileWriter.js`),
  **not** `entry.raw.bannerImageUrl`. That field's own comment in
  `lib/fileWriter.js` explains why: the DB bridge write
  (`patchEntryMeta`) can silently fail to persist during the wizard's
  multi-minute sequential per-faction generation window even when the
  image itself uploaded fine, so Storage is the only thing the live page
  actually trusts, and export now matches. Non-fatal per entry (catches
  and logs, returns `null`) so one faction's Storage hiccup can't fail an
  entire export.
- Added `buildBattleMapBlock(entry)` for `category === "locations"` —
  **does not** hit Storage at all, unlike banners. Confirmed via
  `routes/dungeonMap.js` that `raw_json.dungeonMap.imageUrl` is written by
  `patchEntryMeta` in the *same request* that generates/uploads the map
  (no multi-minute wizard batch window for that write to get interrupted
  in, unlike banners) — and confirmed the live page's own
  `renderLocationBattleMap()` trusts `entry.dungeonMap` directly with no
  separate existence check. Since `listEntries`/`getEntry` already spread
  `raw_json` onto the returned entry, the URL is simply already sitting on
  the object passed to `buildEntryBlock` — a synchronous field read, no
  extra round trip needed.
- Both respect the existing `includeImages` toggle (checked once at the
  top of `buildEntryBlock`, same as `stripImages` already does for
  portraits).
- `category`/`world` scope exports now build all of a category's entry
  blocks via `Promise.all(entries.map(...))` instead of a synchronous
  `.map()`, so the per-entry Storage lookups for banners run in parallel
  rather than serially — a whole-world export could have many factions.
  `campaign` scope stays sequential (already a sequential `for` loop for
  its own `getEntry` lookups; a Quest is 3-7 entries, not worth
  restructuring).
- New `.pdf-banner-img`/`.pdf-battlemap-img` print CSS classes (full sheet
  width, bordered, `break-inside: avoid-page`) — the live site's
  `.battle-map-img` class relies on an absolutely-positioned parent
  wrapper that doesn't exist in the export markup, so it wasn't reused
  as-is.
- Portraits are untouched — still inlined via `bodyHtml` exactly as
  before.

## Fix 4 — Faction generation silently drops trailing sections

**Files:** `lib/factionDeepLore.js`, `lib/claude.js`

`parseJsonResponse`'s "slice to the last `}`" truncation repair can
produce validly-parsing JSON that's just missing whichever top-level keys
the model hadn't reached yet when it hit `maxTokens` — which never
triggers `callClaudeExpectingJson`'s existing retry-on-parse-failure,
since parsing didn't fail. Faction Deep Lore schema-orders
`relationships`, `economyResources`, and `joining` last
(`prompts/factionContentPrompt.js`), making them the fields most likely to
get cut.

Did both remedies, as the brief allowed:

- **Raised the ceiling:** `maxTokens` bumped `2500` → `4000` at both Deep
  Lore call sites in `lib/factionDeepLore.js` (`generateFactionDeepLore`
  and `createNewFaction`). The smaller seed-generation calls (`1200`/
  `1500`) were left alone — no evidence they're truncating, and the brief
  said to leave them unless found otherwise.
- **Completeness check, parameterized on the shared utility** (chose this
  over a locally-scoped check in `factionDeepLore.js`, per the brief's
  stated preference): `callClaudeExpectingJson` in `lib/claude.js` now
  accepts an optional `requiredKeys` array. After a successful parse, any
  key in `requiredKeys` that's missing/null/undefined/blank-string throws
  a new internal `IncompleteJsonError`, caught by the existing retry path
  — which now picks an "incomplete" framing ("your previous response was
  INCOMPLETE -- it was missing: X, Y") instead of the generic "invalid
  JSON" framing when that's what actually happened. Still exactly one
  retry, same "not a loop" reasoning as the existing parse-failure path.
  - Arrays are deliberately **not** required to be non-empty — `relationships:
    []` is a legitimate response (a faction genuinely alone in the world),
    not a sign of truncation. Only `undefined`/`null`/blank-string count as
    "missing."
  - `lib/factionDeepLore.js` defines `DEEP_LORE_REQUIRED_KEYS` (all 13 top-
    level keys in `factionContentPrompt.js`'s schema) and passes it at both
    Deep Lore call sites.
- **Cap double-charge, verified not an issue:** `enforceGenerationCap`
  deducts once per route call, before any Claude API call happens
  (`middleware/enforceGenerationCap.js`) — entirely outside and upstream of
  `callClaudeExpectingJson`'s internal retry, so a retry (parse-failure or
  now completeness-failure) never touches the cap/points a second time.
- `callClaudeExpectingJson`'s `requiredKeys` param is generically reusable
  — flagged in the code comment as a plausible fit for Classes' full
  1–99 ability tree next, per the brief's own suggestion.

## Fix 5 — NPC portraits converge on a "distinctive feature" trope

**Files:** `lib/promptGuidance.js`, `prompts/npcContentPrompt.js`

`physicalDescription` (NPC schema only) had no anti-cliché steering, so
generation defaulted hard to one recurring crutch (a mismatched/scarred/
replaced eye) — the same general failure mode `QUOTE_CRAFT_GUIDANCE`
already exists to solve for signature quotes.

- Added `PHYSICAL_DESCRIPTION_GUIDANCE` to `lib/promptGuidance.js`,
  structured the same way as `QUOTE_CRAFT_GUIDANCE`: names the general
  failure (over-reliance on one striking feature, not just eyes — framed
  so it holds up if the model fixates on something else next), a
  mechanical self-check, and a menu of genuinely different variety
  categories (posture/carriage, hands, gait, clothing wear, a physical
  habit/tic, off-face scarring, build/texture tied to the character's
  actual life) — explicitly not a ban on facial features/eyes, just a fix
  for lopsided reliance on them.
- Wired into `prompts/npcContentPrompt.js`'s `STATIC_INSTRUCTIONS`,
  directly ahead of the `RELATIONSHIPS` section, with an explicit
  `This applies to physicalDescription.` pointer (matching how
  `QUOTE_CRAFT_GUIDANCE` is pointed at `signatureQuote`/`overviewQuote`
  elsewhere in the codebase).
- **Checked `prompts/artPromptPrompt.js`** per the brief's instruction: it
  has no independent physical-description framing logic of its own — its
  "Key visual details" instruction explicitly says to pull from the
  generated entry's `subjectJson` and never invent new details not implied
  by it. So once `physicalDescription` itself stops leaning on the crutch,
  the art prompt naturally stops inheriting it too — no separate fix
  needed there.
- **Checked enemies/classes/survivors** per the brief's instruction: none
  of their schemas (`prompts/enemyContentPrompt.js`, `classContentPrompt.js`,
  `survivorContentPrompt.js`) have a `physicalDescription`-style base-
  appearance field — enemies have `flavor` (lore, not appearance), classes
  have `evolutionEvent.visualShift` (describes a *change*, not a base
  description), survivors have neither. `physicalDescription` is genuinely
  NPC-only in this codebase today. `PHYSICAL_DESCRIPTION_GUIDANCE` lives in
  the shared file specifically so wiring it into any of those later (if
  they gain such a field) doesn't require duplicating the guidance text —
  noted in the export's own code comment.

## Fix 6 — Image generation fails hard on transient Gemini refusals

**File:** `lib/imagegen.js`

`generateImage()` threw immediately on a `finishReason`-present-but-no-
`inlineData` response (a soft-refusal/hiccup), with no retry — unlike
`lib/claude.js`'s `callClaudeExpectingJson`, which already has a
documented retry-once pattern for its own transient-failure mode. The
reporting tester's case resolved itself on a manual second attempt.

- Extracted the single-request logic into `attemptGenerateImage(prompt,
  apiKey, imageConfig)`, which throws a new `NoImageDataError` (subclass
  of `Error`) specifically for the retryable case, and a plain `Error`
  for everything else (`!res.ok`, missing API key, network failure).
- `generateImage()` now tries once, and on `NoImageDataError` specifically
  retries exactly once more (logging a distinct
  `"no image data on first attempt, retrying once"` line, separate from
  `attemptGenerateImage`'s existing failure-path `console.error`, so it's
  possible to tell from logs how often this is actually happening).
  Mirrors `callClaudeExpectingJson`'s "retry once, not in a loop"
  reasoning exactly — a second consecutive failure is treated as
  structural, not bad luck.
- Any other error type (`!res.ok`, bad API key) propagates on the first
  attempt with no retry, per the brief — those aren't fixed by trying
  again.
- `logImageCost()` is called exactly once, from whichever attempt (first
  or retry) actually returns successfully — verified there's no path
  where it's reached twice for one `generateImage()` call.
- No per-call-site changes needed — every image call in the app
  (portraits, faction banners, the world mood board, map backdrops) shares
  this one function, so all of them get the retry for free.

## Not changed

- No cache-version bump needed — none of the six fixes touched
  `render.js`, `mapLayout.js`, or `portraitActions.js` (the three files
  `scripts/bump-cache-version.js` cache-busts). All changes were
  server-side (`lib/`, `routes/`, `prompts/`).
- `getFactions()`/`world_config.factions_json` (Fix 2) and
  `prompts/wizardStatSystemPrompt.js`/`prompts/wizardCategoryConfigPrompt.js`
  (out of scope per the brief) were left untouched.

## Flagged for Austin's review

- **Fix 1's prompt-caching note above** — worth a look if cost logs show
  Quest generation's cache-hit rate dropping meaningfully; the fix trades
  a small amount of cross-world cache reuse for correctness (never
  offering a disabled category to the model). Believed to be the right
  tradeoff, but flagging since it's a real behavior change to a
  previously-universal cache key.
- **Fix 2's `concept` field**: for a faction bridged from the wizard but
  never regenerated since (no Deep Lore run yet), there is genuinely no
  `concept` text available to the banner's art prompt today (only
  `subtitle`, which for that era of entry already *is* the concept text
  under a different key). Considered falling back to `faction.subtitle`
  too, but that's `Epithet: "..."` for Deep-Lore-generated factions
  (wrong content for that case) and the raw concept for wizard-only ones
  (right content, but shape-dependent on which flow wrote the entry) — a
  fragile enough distinction to skip rather than risk feeding the wrong
  text into the art prompt. Current behavior (silently `null`, prompt
  still works fine without it) seems like the safer default; flagging in
  case Austin wants the extra flavor detail badly enough to warrant a
  more careful fix.
- **Testing**: could not exercise `scripts/testPipeline.js`/
  `testEnemyPipeline.js`/etc. end-to-end in this session — they mock the
  Anthropic/Gemini `fetch` calls but still construct a real
  `@supabase/supabase-js` client at require-time
  (`lib/supabaseClient.js` throws without real `SUPABASE_URL`/
  `SUPABASE_SECRET_KEY`), and this session had no Supabase credentials
  available. Every modified file was syntax-checked with `node -c` per
  this session's testing convention, and each fix's logic was traced
  against the actual call sites/data shapes in the repo, but none of the
  six fixes got a real end-to-end run against a live Supabase project or
  real Anthropic/Gemini keys. Worth a manual pass (or a CI environment
  with real/test credentials) before considering this batch fully
  verified.

## Files touched

- `routes/campaignModule.js`
- `prompts/campaignModulePrompt.js`
- `routes/worldArt.js`
- `lib/pdfExport.js`
- `lib/claude.js`
- `lib/factionDeepLore.js`
- `lib/promptGuidance.js`
- `prompts/npcContentPrompt.js`
- `lib/imagegen.js`
