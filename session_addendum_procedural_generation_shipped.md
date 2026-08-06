# Session Addendum: Procedural (Non-AI) Generation — Shipped

Full architectural detail for the "Procedural Generation" entry in
`CHANGELOG.md`. See `procedural_generation_scope_proposal.md` (merged in
PR #3) for the original scoping investigation this builds on — this
session deliberately overrode that proposal's own recommendation to skip
Factions and Logs, to find out in practice (not just by the proposal's
own reasoning) whether a table-driven approach could work there too.

## What shipped

A third entry-creation path — **"Generate Procedurally"** — next to
"Generate with AI" and "+ Create Manually" on all 8 category pages.
Zero API cost, zero LLM calls, instant. Concretely:

- `data/proceduralTables/<category>.json` × 8 — weighted-entry pools and
  Mad-Libs paragraph/sentence templates, one file per category, in the
  `{value, weight, tags}` shape `procedural_generation_scope_proposal.md`
  §3.3 specified.
- `lib/proceduralGenerators.js` — the single dispatcher
  (`generateProcedurally(worldId, category, opts)`) plus one generator
  function per category, exactly as §3.1 called for. Shared utilities
  (`weightedPick`, `weightedPickN`, `fillTemplate`, `applyStatLabels`,
  `dedupeId`/`uniqueId`, `pickFaction`) live at the top of the same file
  rather than duplicated 8 times.
- `routes/generateProcedural.js` — one thin route, `POST
  /api/generate-procedural`. It does **not** write to the database —
  it calls the generator and returns the unsaved `entry` object, the
  same preview shape a regenerate call already returns. The frontend
  immediately follows up with the **existing** `POST /api/confirm-entry`
  to persist it — so there is genuinely no new write path, no new DB
  column, and no per-category branching in the save layer. Gated by
  `enforceEntryCapOnGenerate` only (a procedural entry is still a new
  row against the shared per-world entry cap) — **not** by
  `enforceGenerationCap`, since there's no AI spend anywhere in this
  path to protect.
- `archive/js/render.js`'s `wireProceduralGenerateButton()` — one shared
  function, called from each of the 8 category `index.html` pages right
  after `wireManualCreateButton()`. Deliberately skips
  `showGenerationOverlay()` (that's reserved for real AI waits per its
  own header comment) in favor of the lighter disable+status treatment
  Manual Mode's save button already uses, since this is effectively
  instant.

Numeric fields for Items and Enemies route through the **existing**
`lib/itemFormulas.js` (`clampDamageRange`, `WEAPON_ROLL_RANGES`,
`computeArmorDR` at render time) and `lib/statFormulas.js`
(`TIER_BUDGET`, `computeDerivedStats` at render time) — no new formulas
were invented for this feature, per the task's explicit instruction and
the proposal's own #0 finding that those two modules are the only
genuinely deterministic precedent already proven in this codebase.

## Incidental fixes made along the way

- `scripts/bump-cache-version.js` had a dead `require("glob")` at the
  top (the function below it explicitly does a plain `fs` scan instead,
  per its own comment) that crashed the script on every invocation.
  Removed the dead import so the required "bump the cache version when
  shipping a render.js change" step in `CLAUDE.md` actually works.
- `package-lock.json` was out of sync with `package.json` (missing
  `@supabase/supabase-js`, `puppeteer-core`, `@sparticuz/chromium`,
  `stripe`, and still named `world-forge`/`0.1.0`). Running `npm
  install` to get a working `node_modules/` for local testing
  regenerated it correctly; committed since a lockfile that doesn't
  match its own `package.json` is a latent bug regardless of this
  feature.
- A real subject/pronoun-agreement bug in the NPC physical-description
  Mad-Libs pool, caught by this session's own screenshot testing:
  "**They carries** their weight..." / "**They dresses** like...".
  Fixed by conjugating per-pronoun (`carries`/`carry`,
  `dresses`/`dress`, `has`/`have`, `seems`/`seem`) in
  `lib/proceduralGenerators.js` rather than hardcoding a verb form in
  the templates, plus a matching fix in `data/proceduralTables/npcs.json`.
- A double-quote render bug in Factions: `lib/factionTemplate.js`
  already wraps `faction.overviewQuote` in literal quote marks
  (`"${escapeHtml(faction.overviewQuote)}"`), but the archetype seed
  templates in `data/proceduralTables/factions.json` also had quote
  marks baked into the string, rendering `""like this.""`. Fixed by
  stripping the embedded quotes from the table data.

Both bugs were caught by actually looking at rendered dossier
screenshots during testing, not by reading the code — a concrete
argument for why the task's "screenshot after each category" requirement
mattered, not just a formality.

## Testing note: how this was actually verified

This session's sandboxed environment had no reachable Supabase project —
the throwaway dev project the user provided
(`urtixpjyhhqcpzypvbni.supabase.co`) is blocked by this environment's
network egress allowlist (confirmed via the agent proxy status endpoint;
raw Postgres on port 5432 is unsupported through the proxy entirely,
independent of credentials). With the user's explicit sign-off, testing
used a **temporary, git-revertable, in-memory stand-in** for
`@supabase/supabase-js` (covering only the `from()/select()/eq()/
upsert()/...` and `auth.getUser()` surface this app actually calls),
swapped into `lib/supabaseClient.js` and `archive/js/auth.js` for the
duration of local testing only, then reverted via `git checkout --` before
anything was committed — neither file has any diff in this session's
commits. The real dev server, real Express routes, real
`lib/entriesRepo.js`/`lib/fileWriter.js`/`lib/worldFlavor.js`, and a real
headless Chromium (Playwright, installed to a scratch directory, not
added to `package.json`) all ran unmodified against that stand-in. Every
screenshot in this session came from that real stack, not a mock-up.

No `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` were available either, so the
Factions/Logs "AI-generated comparison" entries requested by the task are
**hand-authored stand-ins**, not live model output — each one says so in
its own `designNotes` field. They're a reasonable proxy for "what a fully
fleshed entry looks like" (same length/structure/voice this app's prompts
already aim for), but they are not a live A/B test against the real
model, and that gap should be kept in mind when weighing the verdicts
below.

## Honest per-category verdict

This is the actual point of trying all 8, not just the 6 the proposal
recommended.

**Strong — genuinely usable as-is:**
- **Items** — the strongest category by a clear margin. Real formula
  output (Damage Range, Damage Reduction with its formula shown),
  rarity-gated effects, condition/flavor variety. Structurally and
  qualitatively close to indistinguishable from an AI-generated item at
  a glance.
- **Enemies** — nearly as strong. Full stat block, real derived stats,
  tier-appropriate abilities (2/3/4 by Trash/Elite/Boss), combat notes,
  boss phase changes. The one soft spot: ability `effect`/`scaling` text
  is templated per-ability, not bespoke per-enemy, so two enemies that
  happen to roll the same ability will read identically there — a small
  table (~15 abilities) makes this noticeable well before 20+ enemies
  exist in one world, exactly the repetition-threshold math the
  proposal's §5 predicted.
- **Classes** — surprisingly strong given how little precedent existed
  for it. Full 1-99 progression, tier themes, evolution event, working
  ability-slot assembly from a shared pool crossed with 6 fully-authored
  archetype seeds. The "low volume, high depth per unit" authoring
  approach the proposal predicted was necessary turned out to be
  achievable in one sitting — 6 archetypes is enough that a world's
  handful of classes won't obviously repeat.

**Workable — solid skeleton, weak prose (as predicted):**
- **Locations** — region/biome and danger tags are genuinely good;
  faction grounding and the accent-color tag pickup work. Notable
  Features/Hooks & Secrets are visibly templated on a close read, same
  gap the proposal flagged.
- **Survivors / NPCs** — structured fields (attributes, traits, speech
  pattern, role) are solid and the faction-relationship auto-link is a
  nice touch; personality/backstory/dialogue/quest hook are honestly
  Mad-Libs, readable but not something a GM should run at the table
  unedited. Matches the proposal's "partial fit" call exactly.

**Weak — the experimental two, tried anyway, and the proposal's instinct
was right:**
- **Factions** — the roster/relationship grounding is real (procedural
  factions correctly reference and form relationships with actual other
  factions in the world, not invented ones), and the 6 archetype seeds
  read as coherent, differentiated organizations, not just re-skinned
  copies of each other. But side-by-side with a fully-written faction
  (see the screenshots from this session), the gap is visible on a close
  read: the hand-authored version has concrete specifics (a named rail
  yard, a specific furnace, "a dozen foremen, mostly lifers") that the
  procedural version can't reach without either a much deeper
  per-archetype table (defeating the "6 fully-written seeds" approach
  that made this tractable at all) or a genuinely per-world detail
  source procedural generation doesn't have access to. Usable as a
  strong first draft to hand-edit, not as a finished faction.
- **Logs** — the weakest of the 8, as the proposal predicted, and this
  is the one place trying it anyway didn't overturn that prediction.
  The roster-grounding mechanism works correctly (real names/locations/
  items get slot-filled in), which matters for keeping a log from
  reading as generic. But `bodyText` is the entire value of a Log entry,
  and Mad-Libs sentence templates read flatly next to hand-authored
  prose with real character voice — the side-by-side comparison in this
  session's screenshots shows a templated "did X. did Y." rhythm against
  a hand-authored entry with actual dry humor and specificity. Usable as
  a placeholder to mark "a log belongs here," not as something a player
  should read as-is.

**Bottom line:** the proposal's Strong/Partial split for the core 6 held
up under real testing. Its "poor fit, don't build it" call on
Factions/Logs was directionally correct but not absolute — both produced
something structurally complete and mechanically correct (real
relationships, real roster grounding), just prose-thin exactly where
those two categories carry the most weight. Worth keeping as an
experimental option (clearly labeled, which it is — every experimental
entry's own `designNotes` field says so) rather than either shipping it
unlabeled as equivalent to AI generation, or not shipping it at all.

## Known gaps / follow-ups not solved by this session

- Item/Enemy ability & flavor-line pools are the proposal's own
  identified repetition risk at ~40-60 rows; this session shipped
  Items at ~70+ rows (weapons+armor+consumables+quest items combined)
  and Enemies' `abilities`/`combatNotes` pools around 15-20 entries each
  — a reasonable floor for a beta, but a world that generates dozens of
  enemies procedurally will still start noticing repeats before an
  AI-generated roster would.
- Survivors/NPCs procedural mode was NOT scoped to "background filler
  only" (one of the two options the proposal's §5 flagged as an open
  decision) — it generates full named characters same as Manual Mode
  does, leaning on the existing per-field "Help me" AI-assist
  (`routes/fieldAssist.js`) as the intended follow-up polish path for
  the Mad-Libs fields, consistent with §3.4's original design note.
- No regenerate/fill-placeholder support for procedural generation —
  "Generate Procedurally" only ever creates a brand-new entry, mirroring
  Manual Mode's scope rather than AI generation's full
  new/fill/regenerate three-way branch. Adding that would mean
  `routes/generateProcedural.js` accepting a `fillExistingId`, same
  shape as every `routes/generateX.js` file already has — a
  straightforward but out-of-scope-for-this-session follow-up.
