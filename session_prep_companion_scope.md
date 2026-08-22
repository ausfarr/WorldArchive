# Session Prep Companion — Scope

**Status:** Scoping complete. Second core use-case for the platform,
alongside the existing content-generation pipeline. All open questions
resolved. Ready to move to build-session prompts.
**Owner:** Austin
**Last updated:** 2026-08-21 (locked cross-entry date consistency —
canonical entry dates win, Logs are grounded against them and never
independently establish a conflicting date; confirmed no backfill for
legacy entries — supersedes prior version)
**Relationship to `world_forge_scope.md` / multi-tenant pivot docs:** This
is a new, additive doc — it doesn't supersede anything. It leans heavily
on infrastructure those docs already describe (regenerate/preview flow,
Logs category, `factionRoundup.js`'s deterministic-aggregation pattern,
the "reference real ids, never invent" rule from the Campaign Arc
planner). Fold a condensed version back into the main scope doc once this
is far enough along, same convention as the multi-tenant doc.

---

## 1. What This Is

Everything built so far generates *world content* (NPCs, items, quests,
lore). This is the second half: a tool that helps a DM actually **run**
sessions at the table and **record** what happened, using that same
content as grounding — and feeds what happens back in, so the world
state stays current instead of drifting stale the moment play starts
deviating from what was generated.

Two directions, one loop:
- **Prep** — before a session, assemble what the DM needs.
- **Recap → Chronicle → Timeline → entry updates** — after a session,
  capture what happened and let it ripple back into the archive.

---

## 2. The Core Loop

```
Pick a Quest or Campaign
        │
        ▼
  ASSEMBLY (free, no AI)
  — resolve entries_json → real NPCs/enemies/items/locations
  — pull linked battle/dungeon map
  — pull prior Chronicle(s) for continuity
        │
        ▼
  PREP OUTPUT (see Section 3 — tiered by AI-heaviness)
        │
   [ session happens at the table ]
        │
        ▼
  RECAP INPUT — DM's rough notes (freeform)
        │
        ▼
  SESSION CHRONICLE (generated, Logs sub-type — see Section 4)
        │
        ├──▶ TIMELINE EVENT (deterministic, aggregated — Section 5)
        │
        └──▶ SUGGESTED ENTRY UPDATES (surfaced, never auto-applied —
             Section 6)
```

---

## 3. Prep — Tiered Scope

**Tier A: Assembly (still built first, as plumbing for Tier B)**
- Pure assembly (roster resolve, map link, prior Chronicle pull) — zero
  cost, instant, no generation UI needed.
- One cheap Claude call (same shape as `campaignArcPrompt.js` — single
  lightweight planning call, references real ids only) producing a
  short "where things stand" paragraph + 2–3 suggested hooks/
  complications, grounded in the assembled roster + prior Chronicles.

**Decision (updated): building both tiers in v1, not staging A-then-B.**
Original plan was to ship Tier A alone first and validate before committing
to Tier B. Austin's call: build Tier B now. Sequencing within the build
(Section 9) still starts with the assembly/plumbing work Tier A needs
anyway, since Tier B depends on it (roster resolution, prior-Chronicle
pull) — but the lightweight "blurb" version of prep is not being shipped
as a standalone intermediate step; Tier B's Session Packet is the real v1
prep output.

**Tier B: Fully generative "Session Packet"**
- Real generated content, own schema/template, goes through
  preview→confirm like everything else. Produces:
  - Opening read-aloud text
  - 3–5 scene beats tagged to real roster entries
  - NPC voice/motivation reminders (grounded in existing character
    bibles, not reinvented)
  - A complications deck (optional curveballs)
  - Open threads carried forward from Timeline/Chronicle history
- Gets its own manifest/category (`session-packets`) so past packets are
  browsable, same pattern as every other generated category.

~~Original plan: ship Tier A alone first.~~ Superseded — see decision note
above Tier B. Assembly is still the first thing built (Tier B needs it as
an input), but the shippable v1 prep output is the full Session Packet,
not a standalone blurb.

---

## 4. Recap → Session Chronicle

- **New standalone Recap page** (locked this session) — not embedded in
  the Quest/Campaign view. DM navigates here after a session, picks
  which Quest/Campaign it belongs to, types rough freeform notes
  (bullets, whatever).
- Full narrative Chronicle generated from those notes — in-setting
  prose, formatted like an existing Log. **Likely implemented as a Logs
  sub-type**, reusing
  `logTemplate.js` and the Logs category rather than a new one, since a
  session chronicle *is* exactly the kind of found-text/journal content
  Logs already models.
- Chronicle generation is explicitly grounded in **what was planned**
  (the prep output it followed, if one exists) vs. **what actually
  happened** (the recap notes) — the model should be told this
  distinction so improvised deviations from prep get captured correctly.
- Each confirmed Chronicle carries: session number (global, see Section
  7.1), quest/campaign id it belongs to, referenced entry ids, and an
  in-world calendar date (see Section 4a — real calendar confirmed in
  scope).

---

## 4a. Calendar System (new — pulled in from Reddit feedback)

Was an open question ("real date vs. Session N only"); Austin's call is
**build a real fantasy calendar system**, partly because it's needed to
make Timeline dates meaningful, and partly because it's independently
requested ("Fantasy calendar support?" — real Reddit comment the same
day this was scoped). **Confirmed sequencing: minimal version now
(unblocks Chronicle/Timeline dates), full calendar page as a fast-follow
once the core session-prep loop is live.** Scoping both here now so the
full version isn't a blind guess later.

### 4a-i. Minimal Calendar (built alongside Session Prep, step 2 in
Section 9)

Just enough structure to timestamp Chronicles/Timeline meaningfully —
no dedicated page yet.

- **New `calendar_config` column on `world_config`** (same home as
  `stat_system_json`/`style_guide_json`), shape:
  ```
  calendar_config: {
    months: [{ name: string, days: number }, ...],   // ordered, DM-defined
    days_per_week: number,
    weekday_names: [string, ...],                     // optional, can omit
    era_name: string,                                  // e.g. "Age of Ash"
    current_date: { year: number, month_index: number, day: number }
  }
  ```
- **Setup path:** a "generate for me" option (same pattern as the wizard
  — one small prompt call proposing month names/lengths/era name
  grounded in the world's genre/tone from Step 1), plus manual entry.
  Lives as an addition to the existing World Setup Wizard rather than a
  new standalone flow — closest natural home given it's one more
  `world_config` field like Stat System (wizard Step 5) or Style Guide
  (Step 6).
- **Advancing the date:** at Chronicle-confirm time, the DM sees the
  current in-world date pre-filled and can adjust it forward (sessions
  often span multiple in-fiction days) before confirming. No calendar UI
  needed for this — just a date-entry control on the Recap/Chronicle
  confirm step, validated against `calendar_config` (correct month
  lengths, no invalid dates).
- Deterministic date→string formatting helper (`formatWorldDate()`,
  reads `calendar_config`) used anywhere a date needs to render — Timeline
  entries, Chronicle headers.

### 4a-ii. Full Calendar Page (fast-follow, after core loop ships)

A real browsable calendar, addressing the standalone Reddit request
properly rather than just as Timeline plumbing.

- **New page** (e.g. `archive/calendar/index.html`) — month-grid view of
  the current in-world year, using `calendar_config` for month
  names/lengths.
- **Events overlay:** Timeline entries (Section 5) plotted on their
  in-world date — clicking a day with events jumps to that Timeline
  entry/Chronicle. This is the payoff for building Timeline as
  world-wide/deterministic — the calendar page is mostly a different
  *view* of the same Timeline data, not a separate data source.
- **Manual notable dates:** DM-added holidays/recurring events
  (harvest festivals, a faction's founding day) independent of session
  play — small addition, own lightweight table or a JSON array on
  `calendar_config`, reference-only, no generation involved unless the
  DM wants a "generate a holiday for me" helper (optional, cheap,
  same one-call pattern as everything else).
- **Multiple eras/years:** if `era_name` ever needs to change
  mid-campaign (a world-shaking event resets the calendar), that's a
  real design question for this phase, not the minimal version — flagging
  now so it's not forgotten, not solving it here.
- **Not scoped yet, needs its own pass when this phase starts:** whether
  moon phases / seasons are worth modeling, and whether this page should
  be reachable from world-level nav or feel like a Session Prep
  sub-feature. Small decisions, fine to make when the phase actually
  starts.

---

## 5. Timeline of Events

**Locked this session: world-wide, single timeline** — not scoped per
Campaign. A recurring NPC's full arc across multiple Quests/Campaigns
shows as one continuous thread, which is the whole point.

- **Deterministic, not model-authored** — same pattern as
  `factionRoundup.js`. Built by scanning confirmed Session Chronicles at
  confirm-time (or on-demand), not a separate generation call.
- Each Timeline entry: session number, date (real or in-world — open
  question), source Chronicle id, one-line summary (pulled from the
  Chronicle's own structured summary, not re-derived), linked entry ids,
  linked faction ids.
- Clicking a Timeline entry jumps to the linked entries/Chronicle — same
  cross-linking system already in use everywhere else.
- Faction tie-in: a Timeline event tagging a faction surfaces a nudge
  ("this faction's Roundup may be stale — regenerate?") rather than
  auto-triggering anything, consistent with nothing auto-writing
  anywhere else in the system.

### 5a. Timeline Sourcing — Beyond Chronicles (expanded scope)

**Locked: yes, Timeline events come from three sources, not just
Chronicles.** The original design only created Timeline entries from
confirmed Session Chronicles — which misses both the common case of an
off-screen state change (a faction leader dying via Regenerate, no
session played) and dates that surface inside a Log's own prose.

- **Trigger 1 (existing):** Session Chronicle confirmed → Timeline event,
  dated to the Chronicle's in-world date.
- **Trigger 2 (new):** Any Regenerate or status-flip confirm that implies
  a real state change (death, appointment, territory change, relationship
  shift) → Timeline event, same deterministic creation pattern, just a
  different entry point. Not every Regenerate needs to create an event —
  a wording tweak isn't a Timeline moment. Simplest approach: the
  confirm UI for Regenerate/status-flip gets an optional "log this to the
  Timeline?" toggle + one-line summary field, defaulting on for
  status-flips (which are inherently state-change actions) and off for
  plain content Regenerates (where it's often just a rewrite).
- **Trigger 3 (new):** Any Log confirm (new generation or regenerate)
  where the model successfully resolved an in-prose date (Section 6a) →
  Timeline event, dated per Section 6a's cross-entry consistency rule
  (canonical entry date wins if the log references an already-dated
  entry; otherwise the log's own resolved date is used and surfaced as
  a suggested update on the referenced entry). Logs with no resolvable
  date don't create an event — silently skipped, not forced.
- **Dating Trigger 2/3 events:** since there's no session to anchor the
  date to, the confirm step gets the **same date-entry control** already
  scoped for Chronicle confirm (Section 4a-i), reused here rather than
  built twice. For Trigger 2, DM picks the date manually (defaulting to
  current world date, editable). For Trigger 3, the model-resolved date
  is pre-filled but still DM-editable before confirming, same as
  everywhere else nothing auto-writes without a review step.

---

## 6. Entry Drift — Suggested Updates

**Locked this session: offer both options, DM picks per-suggestion.**

When a confirmed Chronicle implies a state change to an existing entry
(NPC died, faction lost territory, item consumed, relationship changed),
surface it as an actionable suggestion — never auto-applied:

- **Option 1 — Suggest Regenerate.** Pre-fills the existing
  regenerate→preview→confirm flow with the specific delta as the
  revision instruction ("Session 14: died in the reactor collapse — the
  regenerate should account for this"). No new safety model needed; this
  is the existing guardrail doing exactly what it already does.
- **Option 2 — Status field flip.** A lightweight `status` field
  (alive/dead/allied/hostile/etc.) on categories where it makes sense,
  updated directly without a full narrative rewrite — for the "died
  off-screen, don't need new prose" case.

**Categories getting a status field (locked this session):**
- **NPCs** — full support
- **Factions** — full support
- **PCs** — full support. *Note: this is a naming correction, not a new
  category — the generic system already labels this category per-world
  (Category Configuration, wizard Step 7); "Survivors" was always the
  Echoes-specific label. Worth a quick check during build that the
  default generic label is actually "PCs," not inherited Echoes naming,
  anywhere in code/UI that assumes it.*
- **Enemies — Boss-tier only.** Not every enemy (most are per-encounter,
  disposable). Gate on the existing Tier field
  (Trash/Elite/Boss) — only Boss-tier enemies get a status field.
- **Items — conditionally.** Only when quest/campaign-relevant or
  flagged as an artifact/relic, not routine gear. Needs a flag on the
  item (or reuse the existing QuestItem sub-type from the 4-way item
  branch — worth checking whether that already covers this before adding
  a new flag).
- **Classes, Logs** — no status field; doesn't apply.

Suggestions are generated as a list attached to the confirmed Chronicle
— DM works through them (act on each, or dismiss). Open question on
whether unacted suggestions need to persist as a real queue or if
"act now or it's gone" is acceptable for v1 (Section 7).

---

## 6a. Entry-Level Structured Dates (new — full chronology layer)

**Locked: building this too.** This is the bigger of the two extensions
— rather than Timeline only capturing things that happened *during* the
tool's use (sessions, regenerates), entries themselves carry real
in-world dates, so a faction founded decades before the campaign started
can appear on the calendar/Timeline even though nothing was ever
"logged" for it. This is genuinely a product-wide change (touches all 7
generators' schemas), not a Session-Prep-only feature — worth treating as
its own numbered phase rather than folding invisibly into Section 9's
list.

**Schema additions, per category (only where semantically meaningful):**
- **Factions:** `founding_date`
- **NPCs:** `birth_date` (optional — often unknown/irrelevant), and for
  faction-leader-type NPCs specifically, `appointed_date` /
  `death_date` when applicable (ties directly into your original
  example)
- **PCs:** same shape as NPCs where relevant
- **Items (artifact/quest-relevant only, per Section 6's existing
  scoping):** `created_date` / `discovered_date`, whichever fits the
  item's story
- **Enemies (Boss-tier only, matching Section 6):** `first_encountered`
  is really a Timeline-event concern (Trigger 2 covers it), not a static
  entry field — most bosses don't have a meaningful "born" date worth
  modeling. Recommend **not** adding a schema field here, just relying on
  Timeline events.
- **Classes:** no date fields — doesn't apply.
- **Logs — yes, revised from earlier exclusion.** Logs (found-text
  content — terminal logs, journal entries, audio transcripts) often
  reference an in-world date *within their own prose* ("Day 12 of the
  siege," "three nights after the collapse"). At generation/regenerate
  time, the model attempts to resolve any such reference into a real
  `calendar_config`-consistent date, same "propose + validate" pattern
  as the other categories — if the log's content doesn't ground to a
  specific date (most atmospheric/personal logs won't), the field stays
  null rather than forcing one. This also cleanly covers Session
  Chronicles, since they're a Logs sub-type (Section 4) — no special-
  casing needed, Chronicle dating (4a-i) is just this same mechanism
  applied to a log that's guaranteed to have a real date because it's
  tied to an actual played session.

**How dates get set:**
- **At generation time:** the model proposes a date consistent with
  `calendar_config` and any world history already established (a faction
  founded before the world's "current" date, an NPC's age implying a
  birth year) — same "model writes narrative, code validates structure"
  split used everywhere else. Needs a validation pass (date falls within
  valid month/day ranges per `calendar_config`, isn't nonsensically in
  the future) before the entry is written, same spirit as the `vm`
  round-trip validation already used for templating.
- **Editable like any other field** — a proposed date isn't locked in;
  DM can adjust before confirming, same as everything else in this
  system.
- **Retrofit: no backfill.** Confirmed — entries generated before this
  ships won't have these fields, and that's fine. Same self-heal pattern
  already established for the `raw` field (Section 6, main
  `world_forge_scope.md`) — populate on next Regenerate rather than a
  bulk backfill pass. No special handling needed, including for Logs.

**Cross-entry date consistency (locked — canonical entry dates win,
Logs must conform):** a Log's prose can reference something that
already has a real date elsewhere in the archive — e.g. a terminal log
says "the leader died on the 14th" when that NPC's own `death_date`
field (set via Regenerate) already says something else. Not acceptable
to have two different "true" dates for the same event floating around
the archive. Resolution:
- **Entry-level date fields are the canonical source of truth.** A Log
  never gets to independently establish a date for an event that
  belongs to another entry's own dated field.
- **Log generation/regenerate is grounded with referenced entries'
  existing dates**, injected into the prompt the same way roster/world-
  bible context already is (Section 3b of the main scope doc) — if the
  log is about to reference the Press-Ganger's death, the prompt
  includes the Press-Ganger's actual `death_date` so the model writes
  text consistent with it rather than inventing its own.
- **Trigger 3 (Log-sourced Timeline events) prefers the canonical date
  over prose-parsing.** If the log references an entry that already has
  a relevant date field set, the Timeline event uses *that* date, full
  stop — the model's date-resolution pass (described above) only
  applies when there's no canonical date to defer to yet (a genuinely
  new event the log is the first record of).
- **New event, no canonical date yet:** if a Log is the *first* mention
  of something (e.g. narrates an NPC's death that hasn't been reflected
  in that NPC's entry at all), the log's resolved date becomes the
  proposed source — but doesn't silently write it onto the NPC's entry.
  It surfaces as a suggested update (Section 6/7.5's persisted queue) so
  the DM can confirm it before it becomes canonical, same review
  discipline as every other cross-entry effect in this system.

**Calendar/Timeline payoff:** once entries carry real dates, the full
calendar page (4a-ii) isn't just a play-log view — it's a real
chronology: pre-campaign history (faction foundings, notable NPC births/
deaths that predate the campaign) sits alongside actual played-session
events on the same calendar, which is a genuinely stronger pitch for the
standalone "fantasy calendar" interest than a play-log-only version would
be.

**Scope boundary, flagging now:** this does NOT mean generating a full
timeline of *every* entry's history unprompted — dates are proposed only
for the fields listed above, at generation/regenerate time, for the
entry being worked on. No separate "backfill history for the whole
archive" generation pass is in scope here.

---

## 7. Decisions Locked This Session

1. **Session numbering: global**, not per-Campaign. One running count
   across the whole world.
2. **In-world date tracking: real calendar system**, not just "Session
   N" — see Section 4a. Independently requested by a tester (Reddit),
   so this has value beyond just feeding Timeline dates.
3. **Recap input: new standalone page** — see Section 4.
4. **Status field categories:** NPCs, Factions, PCs (renamed from
   Survivors — see Section 6), Boss-tier Enemies only, conditionally
   Items (quest/artifact-relevant only). Not Classes/Logs.
6. **Tier A vs Tier B: building Tier B now**, not staging behind a
   validated Tier A first — see Section 3's updated decision note.
7. **Cost/quota: enforced like every other generation.** A Session
   Packet generation costs the same as a standard content generation —
   **1 generation = 5 credits**, same unit as everything else. Needs
   wiring into `enforceGenerationCap.js`/the quota system same as the 7
   existing generate routes. Open sub-question: does the Chronicle
   (recap-side) generation *also* cost 1 generation separately, or is it
   bundled into the same 5-credit charge as the Packet it follows? Worth
   pinning down before billing wiring — bundling is simpler for the user
   to reason about, charging separately is more accurate to actual API
   cost (two real Claude calls either way).

## 7a. Still Open

None currently — Section 4a below covers the calendar system in full
(minimal-now / full-later already decided, detail below). Revisit this
section if anything surfaces mid-build.

5. **Suggestion persistence: real stored queue.** Unacted suggested
   updates persist past a page reload — likely a lightweight
   `pending_entry_updates` table (or column on the Chronicle row: a JSON
   array of `{entry_id, category, suggestion_type, delta_text, status:
   pending|dismissed|applied}`), read wherever the DM would naturally
   see it (Chronicle page, maybe a small badge/count on the world
   dashboard). Marked `applied`/`dismissed` once acted on rather than
   deleted, so there's a record of what was surfaced.

---

## 8. Reuse Map (why this is smaller than it looks)

| Piece | Reuses |
|---|---|
| Prep blurb / Chronicle cleanup (Tier A) | `campaignArcPrompt.js` pattern — one lightweight planning call, real-ids-only |
| Entry update suggestions | Existing regenerate → preview → confirm flow, unchanged |
| Timeline aggregation | `factionRoundup.js` pattern — deterministic archive-scan, zero model cost |
| Session Chronicle (Tier B) | Logs category + `logTemplate.js`, as a sub-type |
| Session Packet (Tier B) | Standard prompt-builder → JSON schema → template → preview/confirm pattern used by every other category |
| Quota/cost enforcement | `enforceGenerationCap.js`, same 5-credit unit as existing generations |
| Timeline Triggers 2 & 3 (5a) | Same regenerate/status-flip/log confirm flows, same date-entry control as Chronicle confirm |
| Entry-level dates (6a) | Same "model proposes, code validates" split as stat/damage formulas; same self-heal-on-regenerate pattern as legacy `raw` field backfill; cross-entry date grounding reuses roster/world-bible context injection (Section 3b) |

Net new: a Session Packets table/manifest, a Recap page, Chronicle
generation (Logs sub-type), Timeline aggregation logic (now with three
trigger sources — Chronicles, Regenerate/status-flip confirms, and Log
date resolution), a `calendar_config` addition to `world_config`, new
date fields across 5 of 7 entry schemas including Logs (6a), a `status`
field migration, and the suggestion-surfacing UI. No new architecture
patterns — everything above is an application of patterns already
proven in the codebase.

---

## 9. Suggested Build Order (updated — Tier B-first, chronology layer
included)

1. **Assembly plumbing** (roster resolve, map link, prior-Chronicle pull)
   — Tier B's Session Packet needs this as input regardless.
2. **Minimal calendar** (4a-i — `calendar_config` on `world_config`,
   date-entry control at Chronicle-confirm, `formatWorldDate()` helper)
   — unblocks Timeline dates without a full calendar UI yet.
3. **Entry-level structured dates (6a)** — schema additions to
   Factions/NPCs/PCs/Items/Logs templates + prompt builders, validation
   against `calendar_config`. Sequenced here (before Session Packet)
   since it's a schema change best landed once, not incrementally —
   and doesn't depend on anything Session-Prep-specific, only on the
   minimal calendar from step 2.
4. **Session Packet generation** (Tier B prep, full scope per Section 3)
   — new manifest/category, prompt builder, preview/confirm.
5. **Recap page + full Chronicle generation** — closes the loop.
6. **Timeline of Events**, all three trigger sources — Chronicle confirm
   (original), Regenerate/status-flip confirm (5a), and Log date
   resolution (5a) — pure aggregation, no new generation cost.
7. **Entry drift suggestions + `status` field migration + persisted
   suggestion queue** (`pending_entry_updates`, per Section 7.5) —
   reuses existing regenerate flow; categories per Section 6.
8. **Full calendar page** (4a-ii — month-grid view, Timeline events
   overlay including pre-campaign entry dates from step 3, manual
   notable dates) — fast-follow once the core loop is live.
9. **Quota/billing wiring** — should land alongside step 4 (Session
   Packet is the first real cost-incurring piece), not deferred to the
   end.
