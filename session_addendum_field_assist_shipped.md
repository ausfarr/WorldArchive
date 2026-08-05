# Addendum — v0.9 Manual Mode, Piece 2: Field-Level "Help me" AI Assist (shipped)

Follow-up to `session_addendum_manual_entry_mode_shipped.md`'s three-piece
v0.9 plan. Piece 1 (full manual entry) and its two polish rounds are
done; this ships Piece 2. Piece 3 (manual wizard path) is still not
started.

Also folds in the paper-trail gap flagged at the start of this session:
`session_addendum_manual_mode_polish_round3.md` was never actually
written to project knowledge, even though its work (placeholder-text
hints, Classes skill picker as a row editor, map lock toggle, plus the
weapon-skill-label and attribute-label fixes that followed it) is
confirmed live in the repo as of commit `1e6ff54`. Worth writing that one
up separately if the trail matters going forward — this addendum only
covers Piece 2.

## Scope decisions locked this session

- **Single suggestion, inserted directly into the field** (not multiple
  options to pick from).
- **Overwrites on click, using whatever was already in the field as
  context** — not gated to empty fields, no confirm dialog.
- **Comprehensive across all 8 categories' genuine free-text fields** —
  but row-editor fields (relationship stance/why, dialogue branch
  tone/reply, ability name/flavor/effect/scaling, notable-NPC why) are a
  **fast-follow, not in this pass** — they don't go through the shared
  `efField` helper at all, so covering them means bespoke per-row-editor
  wiring (4 different data shapes), not reuse of the one integration
  point this pass uses. Recommended and agreed rather than assumed.
- **Manual-only isn't a separate tier for this purpose** — clarified
  mid-session that "Manual-only" was never a hard 0-AI wall, just
  free/trial users choosing not to spend their AI allowance. Field
  assists draw from the same trial/subscription pool everyone else uses;
  no special-casing anywhere in the code.

## The points system (new, touches real billing tables)

Rather than a fractional (e.g. "0.2 of a credit") spend or a second
quota users would have to track separately, field assists draw from the
**same pool** as full AI generations, just at a fraction of the cost —
implemented as an integer **"points"** unit specifically to avoid
floating-point/numeric-column risk in the tables that already handle
real money (`credit_ledger`, `subscriptions.used_this_cycle`).

- **1 full generation = 5 points. 1 field assist = 1 point** (literally
  0.2 of a generation, per Austin's ask — just represented as an integer
  ratio instead of a float).
- Nothing user-facing ever shows the word "points" — `/billing/status`
  converts back to plain "generations" via `pointsToGenerations()`
  (floor division) before the JSON leaves the server. A new
  `fieldAssistsRemaining` field is exposed on every state (beta/trial/
  subscribed) for a possible future Settings line, not yet surfaced in
  the UI.
- `migrations/015_field_assist_points.sql` — backfills every existing
  counter (`world_config.generation_count`, `subscriptions.used_this_cycle`,
  `plans.monthly_quota`, `credit_ledger.amount`) ×5 so no existing beta
  tester's usage looks worse after deploy, and both RPCs
  (`check_and_increment_generation_count`,
  `check_and_spend_subscription_generation`) gain a `p_amount` param
  (defaults preserved for safety, but every real call site now passes it
  explicitly).
- `lib/worldConfigRepo.js`: `GENERATION_CAP` 25 → 125 points (same real
  generosity). `lib/billingRepo.js`: `TRIAL_CAP` 10 → 50 points.
  `routes/stripeWebhook.js`: credit-pack purchases now insert points
  (×`POINTS_PER_GENERATION`) so a purchase's real spending power in
  generations is unchanged, while also being spendable a la carte on
  cheaper assists.
- `middleware/enforceGenerationCap.js` is **generalized, not
  duplicated** — takes an `amount` of points to spend (defaults to a
  full generation's cost, so the 7 existing `/generate-X` call sites
  needed zero changes), plus a new `enforceFieldAssist` wrapper that
  passes 1. One code path, one pool, no parallel middleware file.
- Cap-reached messaging accounts for the case where a full generation
  (5 points) gets blocked but partial points remain — e.g. 3 points left
  isn't enough for a generation but is still 3 spendable field assists;
  the rejection message now says so instead of implying nothing is left.

## Which fields actually get "Help me"

`lib/fieldAssistFields.js` (server) and a matching `FIELD_ASSIST_ELIGIBLE`
Set (client, `archive/js/render.js`) are a **deliberate subset** of
`FIELD_HINTS`, not the full list — cross-checked every entry against its
actual render call site rather than assuming the hint table was current:

- **Excluded: fields that render as a dropdown (`efSelect`) despite
  having a stale `FIELD_HINTS` entry** — `locationId`, `weaponSkill`,
  `className`, `foundAtLocationId`, `evo-locationId`, `rarity`,
  `category`, `tier`, `logType`, `primaryAttribute`, `secondaryAttribute`,
  `relevantStat`. These hint entries predate those fields becoming
  selects and are dead code for tooltip purposes too — not something
  this session fixed, just discovered and worked around.
- **Excluded: numeric fields** — the six attributes, age, damageMin/Max,
  effectorTier, apCost, phase-threshold. No canonical value range exists
  anywhere in the system to suggest a number against (same gap flagged,
  not solved, for the attribute display labels in the round-3 work).
- **Corrected: `ef-skill-major/minor/misc`** in `FIELD_HINTS` are stale
  keys from before the Classes skill picker became a row editor — the
  real free-text DOM ids (only rendered pre-Wizard-Step-5, when there's
  no skill system to build the picker from) are the `-fallback` variants,
  which is what's actually wired up.
- Result: **~80 fields** across all 8 categories, all genuine
  text/textarea `efField` inputs.

## How the suggestion gets built

`lib/fieldAssist.js` — one Haiku call (always `HAIKU_MODEL`, ignoring
whatever `CONTENT_MODEL` is set to — a single-field nudge doesn't need
the app's primary/possibly-Sonnet content tier). System prompt combines:
world setting (`worldFlavor.getSettingContext`), category/faction-scoped
lore (`loreContext.getLoreContext`), and — for the four quote-shaped
fields (`signatureQuote`, `dialogue-opening`, `capstoneQuote`,
`overviewQuote`) — the existing `QUOTE_CRAFT_GUIDANCE` antithesis-crutch
guidance, reused at the single-field level rather than only in full
generators. User message is the entry's already-filled fields (read live
from the DOM at click time via `gatherFieldAssistContext`, not the
original `raw` the form opened with, so it reflects anything typed
during the current session) plus the target field's hint text as the
instruction. `max_tokens` comes from a 3-tier length classification
(SHORT/MEDIUM/LONG) per field rather than per-field tuning.

## Frontend wiring

- "✨ Help me" button rendered inside `efField()`'s label row, gated on
  `FIELD_ASSIST_ELIGIBLE.has(id)` — zero changes needed at any of the
  ~90 individual `efField()` call sites.
- Which category is being edited is tracked via a single module-level
  `currentEditCategory`, set at the two real entry points into an edit
  overlay (`editEntry()` and `wireManualCreateButton`'s click handler) —
  both already receive/know their category as a real value, so this
  avoids threading `category` through `efField`'s signature everywhere.
- One delegated `click` listener on `document` for `.field-assist-btn`
  (registered once at script load) handles every overlay automatically,
  including `showFactionEditForm`'s own hand-rolled overlay markup —
  that form doesn't use the shared `openEditOverlay()`, but does reuse
  the same `#edit-form-overlay` id, which is all the context-gathering
  needs.
- Row-editor inputs (relationships, dialogue branches) don't carry a
  plain `id` attribute (they use `data-idx`/`data-field` instead) — the
  context-gathering's `!el.id` check already skips them cleanly, no
  extra filtering needed, no key collisions with `efField`'s ids.
- Cap-reached errors surface via the same `result.message`-over-
  `result.error` preference already established for the 9 save handlers.

## Not addressed this round

- Row-editor free-text fields (see Scope decisions above) — fast-follow.
- No Settings UI for `fieldAssistsRemaining` yet, though it's already in
  the API response.
- `scripts/bump-cache-version.js` couldn't actually be run — it requires
  the `glob` package, which isn't in `package.json`'s dependencies (not
  introduced this session, just discovered). The version bump (v0.9 →
  v0.10, `lib/version.js` + all 24 `render.js?v=` references) was done
  manually to match exactly what the script would have done. Worth
  adding `glob` to `package.json` so the script works standalone next
  time.

## Still needed before this is live

- Run `migrations/015_field_assist_points.sql` against Supabase.
- Everything here is inert in the same way Piece 1 was while
  `BILLING_ENABLED` is off (current default) — the legacy beta path
  (125-point lifetime cap) is what's actually active right now; the
  trial/subscription/credit points conversions only start mattering once
  billing is flipped on.
