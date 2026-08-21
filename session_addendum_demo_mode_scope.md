# Session Addendum: Unauthenticated Demo Generator — Scope

**Status: scope doc only. No code changes included.** Per this project's
"scope doc first, then build" convention (`session_addendum_ruleset_recovery_r4_5e_completeness_scope.md`,
`procedural_generation_scope_proposal.md`). Stop here for review before
Phase 1 (backend) starts.

## Problem

Beta feedback (a specific tester / Reddit comment) says the account-
creation wall before someone can try Chronicled at all is costing
conversions — people bounce at the signup prompt before seeing any
generated content. Goal: let an unauthenticated visitor generate a
small, hard-capped number of real NPCs/Enemies, text-only, grounded in a
lightweight genre preset, directly inside `app.chronicled.world` — no
account, no `worldId`. Convert to a real account once they've seen the
value (hit the cap, or click "save this").

## Correction to the task brief's premises

The brief cited `prompts/npcContentPrompt.js` and
`prompts/bestiaryContentPrompt.js` as the two pipelines to reuse, and
asked for presets "consistent with the D&D 5e / Generic rulesets the
public product actually targets." Two things worth flagging before
locking the plan below, since they change what "reuse the existing
pipeline" actually means per category:

**`prompts/bestiaryContentPrompt.js` doesn't exist.** The real Echoes
Bestiary prompt is `prompts/enemyContentPrompt.js`, and — unlike NPCs —
Enemy generation isn't one pipeline at all. `routes/generateEnemy.js`
branches on `getRuleset(worldId)` into three genuinely different code
paths (`world_forge_scope.md`'s registry): Echoes (`prompts/enemyContentPrompt.js`
+ `lib/statFormulas.js`'s BODY/REFLEX/KNOWLEDGE/PRESENCE/SANITY/FATE
formulas), 5e (import/reflavor/homebrew tiers against `srd_library`), and
Generic (`prompts/rulesets/generic/enemyContentPrompt.js` +
`lib/rulesets/generic/homebrewEnemyGenerator.js`, a world-defined
attribute system evaluated by `lib/rulesets/generic/statFormulas.js`'s
small linear formula engine).

**Echoes' mechanical system is off-limits for the same reason Echoes'
setting is.** The decisions-locked brief already excludes the Echoes
*setting* ("that's the admin-only proprietary ruleset") — but
`lib/statFormulas.js`'s six-attribute formula IS the Echoes ruleset
mechanically (`world_forge_scope.md`'s hard invariant #3: Echoes is
admin-gated everywhere it could appear). A demo running BODY/REFLEX/
KNOWLEDGE/PRESENCE/SANITY/FATE numbers would be shipping Echoes' actual
proprietary mechanics to the public under different flavor text, not
avoiding them. 5e's formulas (proficiency bonus, spell slots, CR) are
real D&D SRD math but bring real ruleset-specific machinery (class
levels, `srd_library`, saving throws) with nothing analogous for a demo
that has no world/wizard behind it. **Enemies in demo mode reuse the
Generic ruleset's Homebrew pipeline** — genuinely genre-agnostic by
design (`world_forge_scope.md` Phase 10), takes a small externally-
supplied attribute system, and is the one enemy pipeline built to not
assume any specific setting. See "Enemy generation" below for the
concrete shape.

**NPCs, by contrast, really are one ruleset-agnostic pipeline** — the
brief's framing holds up as-is there.
`prompts/npcContentPrompt.js` + `lib/entryTemplate.js` are used
identically for every ruleset (`world_forge_scope.md`: "Factions/
Locations/NPCs/Logs are the confirmed-narrative exceptions... should
stay ungated so they keep working identically across every ruleset").

## Decisions locked (recap, not re-litigated)

- Lives inside `app.chronicled.world`, not the marketing site.
- User picks generator: NPC or Enemy.
- 2–3 generic genre/vibe presets (High Fantasy, Sci-Fi/Cyberpunk,
  Post-Apocalyptic), one short seed paragraph each — no world bible, no
  roster context, no faction system.
- Portraits: explicit, separately capped, NOT auto-generated after text.
  "Generate Portrait" is a second button shown after the text result
  renders.
- Rate limits, tracked separately (portraits cost ~4x a text gen):
  **2 text / visitor / rolling 24h, 1 portrait / visitor / rolling
  24h**, enforced server-side via hashed IP in a new `demo_usage` table.
  A short-lived cookie may mirror both counts client-side for instant
  UI feedback only — never trusted server-side.
- Portraits are ephemeral — no Supabase Storage write, returned as a
  data URL, gone on refresh, exactly like the text result.
- No persistence beyond the browser session. No carry-into-account-on-
  signup flow this session.
- Billing, Stripe, existing auth, and every authenticated route's
  behavior are untouched — this is purely additive.

## New route(s) and exact mounting point

`server.js` currently gates **every** `/api/*` route behind
`app.use("/api", resolveTenant)` (server.js:107) before any route file
is mounted, followed by `attachCostContext` and
`blockAdminViewMutations`. The one existing precedent for an
unauthenticated `/api`-adjacent route is `waitlistRoute`
(server.js:103), mounted with `app.use(waitlistRoute)` **before** that
resolveTenant line specifically so it's not gated.

New `routes/demo.js`, exporting a router with:
- `POST /api/demo/generate` — `{ category: 'npcs' | 'enemies', preset: 'high-fantasy' | 'sci-fi-cyberpunk' | 'post-apocalyptic' }`
- `POST /api/demo/generate-portrait` — the generated entry's relevant
  fields (name + whatever the art-prompt builder reads off `subjectJson`
  today, i.e. the same `raw` object `/generate` just returned)

Mounted in `server.js` as `app.use("/api/demo", demoRoute);` placed
**alongside `waitlistRoute`, before `app.use("/api", resolveTenant)`** —
same reasoning, same pattern, no changes to the tenant-gating line
itself. Both new handlers set `req.worldId`/`req.userId` to nothing;
`lib/costContext.js`'s `getCostContext()` already degrades gracefully
with no `AsyncLocalStorage` context (`{}` — `costTracker.js` treats a
missing `worldId` as "skip DB persistence, console log still happened"),
so `callClaudeExpectingJson`/`callClaude`/`generateImage` all work
unchanged with zero request-scoped wiring. **Known gap, not fixed this
session:** demo generation cost won't land in the `cost_log` table the
way real generations do — visible in Anthropic/Gemini's own dashboards
and server console logs only. Flagged under Deferred below rather than
building a demo-specific cost-logging path now.

## Trusted IP header (Render hosting)

`server.js` does not currently call `app.set('trust proxy', ...)`
anywhere — confirmed by reading the whole file. Render's edge terminates
TLS and proxies to the app instance, setting a real `X-Forwarded-For`
header, but **without `trust proxy` set, Express's `req.ip` reads the
immediate socket peer (Render's internal proxy), not the real visitor**
— every visitor would collide on the same effective "IP" and the cap
would either block everyone together or (depending on how Render's
proxy chain resolves) nobody meaningfully. This needs `app.set('trust
proxy', 1)` (trust exactly one hop — Render's own edge — not an
unbounded chain) added to `server.js`, then `req.ip` becomes reliable.
This is a real, small change to `server.js` outside `routes/demo.js`
itself and needs to be called out plainly in the Phase 1 PR, not buried
— it's the one piece of this feature that touches a file every other
route also depends on. `enforceGenerationCap.js`/every other existing
route reads `req.worldId`, never `req.ip`, so this has no observable
effect on any authenticated path.

## `demo_usage` table (migration, not run by Claude — Austin runs it by hand)

`migrations/027_demo_usage.sql` (next number after `026_atomic_entries_purchased_increment.sql`):

```sql
create table if not exists demo_usage (
  ip_hash text not null,
  day date not null,
  text_count int not null default 0,
  portrait_count int not null default 0,
  primary key (ip_hash, day)
);
```

IP hashed with Node's built-in `crypto` (`createHash('sha256')`) — no
new dependency; `package.json` has none of the usual rate-limit/hashing
libs installed today. `day` is UTC calendar date (`new Date().toISOString().slice(0,10)`),
giving a rolling *server-day* window rather than a true rolling 24h —
simplest correct-enough implementation matching the `(ip_hash, day)`
primary key's natural shape; a true rolling window would need a
timestamp + range query instead of a point lookup. Flagging the
simplification rather than silently picking the stricter interpretation
the brief's "rolling 24h" phrase implies.

Increment logic needs the same atomic-upsert care
`enforceGenerationCap.js`/`lib/worldConfigRepo.js`'s
`checkAndIncrementGenerationCount` already uses (check-then-increment
under one round trip, not a read then a separate write) — a Postgres
`insert ... on conflict (ip_hash, day) do update set text_count =
demo_usage.text_count + 1 where demo_usage.text_count < 2 returning
text_count` (or a small `SELECT ... FOR UPDATE` RPC, matching the
existing row-locked pattern) avoids the same double-spend race that
`migrations/018_generation_refund.sql`'s header describes for the real
cap.

## Generation pipelines (demo-mode branch on each, not a fork)

**NPCs** (`routes/generate.js`'s existing imports, called directly from
`routes/demo.js` — no route changes to `generate.js` itself needed
since NPCs already take no ruleset-specific input):
`buildNpcContentSystemPrompt({ settingContext, loreContext,
factionOptionsText, rosterContext, name: null, role: null, faction:
null })` — `settingContext` = the preset's one-paragraph seed flavor,
`loreContext` = `""`, `factionOptionsText` =
`"(no factions exist in this world yet — use null or \"unaligned\" for
any faction field)"` (the exact string `formatFactionOptionsForPrompt`
already returns for zero factions — reuse it directly rather than
inventing new wording), `rosterContext` = the same
"No NPCs archived yet..." string `buildRosterContext` returns for an
empty world. `callClaudeExpectingJson(...)` → `lib/entryTemplate.js`'s
`buildBodyHtml(npc, null)` for render HTML. No `entriesRepo`/
`entryLinker` calls — nothing to link against, nothing to save.

**Enemies**: `buildHomebrewGenericEnemySystemPrompt` +
`generateHomebrewGenericEnemy`-shaped call (`prompts/rulesets/generic/enemyContentPrompt.js`,
`lib/rulesets/generic/homebrewEnemyGenerator.js`) against a small
hardcoded demo `genericSystem` (my call on exact numbers, kept
intentionally simple — real content, not a placeholder):

```js
const DEMO_GENERIC_SYSTEM = {
  useFormula: true,
  attributes: [
    { key: "power", label: "Power" },
    { key: "speed", label: "Speed" },
    { key: "mind", label: "Mind" },
    { key: "grit", label: "Grit" }
  ],
  derivedStats: [
    { key: "health", label: "Health", attributeKey: "grit", coefficient: 4, base: 10 },
    { key: "damage", label: "Damage", attributeKey: "power", coefficient: 1, base: 2 }
  ]
};
```

`computeDerivedStats(DEMO_GENERIC_SYSTEM, proposed.attributes)` from
`lib/rulesets/generic/statFormulas.js` — real formula code, not
model-stated numbers, same "model writes narrative, code writes math"
invariant every other ruleset follows. Render via
`lib/rulesets/generic/enemyTemplate.js`'s `buildEnemyBodyHtml(enemy,
DEMO_GENERIC_SYSTEM, null)`.

**Response shape for `/api/demo/generate`** (server renders `bodyHtml`
itself, same as every real generate route does before a save — verified
against `archive/js/render.js:2735`'s `sheet-body.innerHTML =
entry.bodyHtml`, the actual dossier render path):
```json
{ "category": "npcs" | "enemies", "raw": { ...generated JSON... }, "bodyHtml": "<...>" }
```
Frontend (Phase 2) drops `bodyHtml` into a dossier-styled container
reusing `archive/css/style.css` — no new CSS, no mockup styling.

**Portraits**: `routes/generateEntryImage.js`'s existing chain —
`buildArtPromptSystemPrompt({ category, subjectJson, styleGuide: null,
factionAccent: null })` (both null are already-handled "no style guide
yet" / "no faction accent" fallbacks, not new code paths) → `callClaude`
(Haiku) → `generateImage()` (unchanged, `lib/imagegen.js` has zero
worldId/Storage coupling itself). The ONLY branch point is
`lib/fileWriter.js`'s `saveImage()` call — `routes/generateEntryImage.js:167`'s
`const imageUrl = await saveImage(req.worldId, id, imageBuffer,
mimeType); await saveFn(...)`. Demo mode skips both lines entirely and
instead does `` `data:${mimeType};base64,${imageBuffer.toString("base64")}` ``,
returned as `{ imageDataUrl }`. No Storage bucket touched, no `saveFn`
(no entry to update — there's no entry, period).

## Tests (Phase 1, per project convention)

`scripts/testDemoUsage.js`, matching `scripts/testTenantIsolation.js`'s
"real Supabase, throwaway rows, safe to run against the real project"
pattern (`demo_usage` rows keyed by a synthetic test `ip_hash`, deleted
at the end) — hit `/api/demo/generate` 3x from the same simulated IP,
assert the 3rd is a 429 with `text_count` still capped at 2; hit
`/api/demo/generate-portrait` 2x, assert the 2nd is 429 at
`portrait_count` capped at 1; assert a different `ip_hash` is
unaffected by either. Given the mocked-fetch precedent
(`scripts/testPipeline.js`/`testEnemyPipeline.js`), the Claude/Gemini
calls themselves can be mocked the same way — this test is about the
cap logic, not generation quality.

## Explicitly deferred (do not build this session)

- **Carry a demo-generated entry (text or portrait) into a newly
  created real account.** Noted in the original brief as deferred;
  confirmed here, no code scaffolding for it either.
- **A global/site-wide daily cap** on top of the per-visitor cap. Worth
  doing before a real traffic spike (a viral post could still run up a
  meaningful API bill via many distinct IPs, each individually under
  cap) — genuinely a good idea, not built here. Would likely be a single
  `SELECT sum(text_count), sum(portrait_count) FROM demo_usage WHERE
  day = today` check in the same middleware, cheap to add later.
- **Persisting demo portraits anywhere** (Supabase Storage or
  otherwise). Ephemeral by design per the locked decisions.
- **Demo generation cost in `cost_log`.** Console-log/dashboard visible
  only, per the "Trusted IP header" section above — not wired into
  `lib/costContext.js`'s per-request `AsyncLocalStorage` since there's
  no `worldId` to attribute it to.
- **A true rolling 24h window** for the rate limit (vs. this doc's
  simpler UTC-calendar-day window) — flagged above, not the brief's
  literal ask, worth a second look if a visitor near a day boundary
  complains about the cap resetting "too early."
- **Billing, Stripe, existing auth, any authenticated route.** Untouched.

## Suggested build order for Phase 1

1. `app.set('trust proxy', 1)` in `server.js` + `migrations/027_demo_usage.sql`
   + the atomic increment/check function — foundational, everything else
   depends on a real IP hash and a working cap check.
2. `routes/demo.js`'s `/generate` (NPCs first — genuinely one pipeline,
   proves the demo-mode branch pattern before Enemies' extra
   `genericSystem` wiring).
3. `/generate` for Enemies (Generic ruleset path + `DEMO_GENERIC_SYSTEM`).
4. `/generate-portrait`.
5. `scripts/testDemoUsage.js`.
