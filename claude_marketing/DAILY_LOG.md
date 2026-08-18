# Chronicled — Marketing Daily Log

Newest entries at the top. Log what actually happened, not what was planned — `GROWTH_STRATEGY.md` and `ACTION_ITEMS.md` hold the plan.

---

## 2026-08-18 — Automated daily check-in, Day 2 still pending; CharGen confirmed as real competitor

**Session summary:** Second automated check-in. Nothing has moved on Austin's side — Action Items #1 and #2 are still unchecked, two calendar days after the kickoff session. The main development this session was on the competitive-intelligence side, not the outreach side.

**1. Previous post visibility check — still N/A, nothing posted yet.** Searched for `"chronicled.world" reddit`, `"Chronicled" TTRPG worldbuilding AI reddit post`, and a site-scoped Reddit query — no indexed Reddit posts about Chronicled exist anywhere. So there's still nothing for the "silent suppression" check to actually check. Direct reddit.com fetch is **now failing even harder than before** — WebFetch returned an outright "Claude Code is unable to fetch from www.reddit.com" this session (previously it was an egress-proxy block; same practical effect, worth noting the failure mode changed slightly). Verifying post visibility once posts exist will still need Austin's own logged-out check or search-engine indexing, not a direct fetch from this environment.

**2. Competitive landscape scan — real movement here:**
- **CharGen is now CONFIRMED as a direct competitor**, not just flagged. Its own changelog/feature pages (search-indexed, still can't direct-fetch char-gen.com) describe a "World Codex" that cross-links NPCs, factions, settlements, regions, and species via a relationship graph — the same "grounded, everything connects" pitch this project uses. CharGen also publishes its own "World Anvil alternatives" and "Kanka/LegendKeeper alternatives" comparison content — it's an active, resourced competitor. Pricing correction: the "$5/mo Guild tier" flagged yesterday was noise — CharGen's real pricing is a gold-credit *art* system (free 10 gold/day, Plus $9.99/mo, Elite $19.99/mo), nothing at $5/mo. No mention of Chronicled anywhere in CharGen's own content — not on their radar yet.
- **New competitor found: Friends & Fables (fables.gg).** Free worldbuilding tools spanning NPCs/monsters/items/spells/factions/lore/quests/races/classes — nearly Chronicled's exact category list — completely free, no ads/restrictions, exportable. Its actual business is a paid AI-narrated multiplayer text-RPG ($19.95–$39.95/mo), so the free tools are likely a lead-gen loss-leader rather than the core product — softens the threat somewhat, but it's still a free alternative someone will bring up. Whether its output is cross-linked/grounded like CharGen's and Chronicled's is unverified (fables.gg is egress-blocked too).
- World Anvil's August 2026 update: UI-only (professional settings ported to new editor) plus a community reading challenge — no pricing or AI-feature change. Kanka/LegendKeeper: no pricing changes found. StormScape (encounter-builder, runs its own "vs. World Anvil/LegendKeeper/Kanka" comparison content) surfaced again — logged as a secondary watch item, not urgent.
- Full detail and sourcing in `COMPETITOR_WATCH.md`'s 2026-08-18 entry; strategic consequence written up in `GROWTH_STRATEGY.md` §2.

**3. New opportunities:** None found — Reddit is still fully inaccessible to this session (see above), so there's no way to scan live threads for engagement opportunities from here. No other concrete lead surfaced via general web search this session.

**4. Real numbers:** None logged beyond the static 18 free-beta signups / 5–6 active testers. Still qualitative-only; numbers won't move until posts actually go out.

**5. Strategy adjustments made:** Retired the "no direct AI-native competitor" claim entirely in `GROWTH_STRATEGY.md` §2 (it was "in question" yesterday, now confirmed false) and added Friends & Fables as a tracked competitor in `COMPETITOR_WATCH.md`. **Checked both drafted Reddit posts against this** — neither `drafts/reddit_post_worldbuilding.md` nor `drafts/reddit_post_rpg_generators.md` actually claims "nobody else does this," so no draft edits were needed. Flagged for a *future* session (not urgent): once outreach is actually happening, comparison-content copy should lean on Chronicled's real remaining differentiators (private per-user archive vs. CharGen's shared codex, world-specific stat/skill system, preview-then-confirm regenerate, PDF/VTT export) rather than the now-false "only one that links things" claim. Channel priority (r/worldbuilding → r/rpg_generators → r/DMAcademy) unchanged — nothing today argues for reordering it.

**Bottom line for Austin:** the competitive picture firmed up real this time — CharGen is a genuine, resourced competitor and there's a new free alternative (Friends & Fables) worth knowing about — but the actual blocker hasn't moved: two days in, #1 and #2 still haven't been posted, and everything downstream is still waiting on that.

---

## 2026-08-17 (evening) — Automated daily check-in, Day 1 still pending

**Session summary:** First run of the daily automated check-in. Nothing has moved on Austin's side yet — this is the same calendar day as the kickoff session below, and neither Reddit draft has been posted.

**1. Previous post visibility check — N/A, nothing posted yet.** Action Items #1 and #2 (post to r/worldbuilding, r/rpg_generators) are still unchecked. Confirmed via web search ("chronicled.world reddit", "Chronicled TTRPG worldbuilding" site:reddit.com) that no indexed Reddit posts about Chronicled exist anywhere, paid-era or otherwise — so the "silent suppression" risk this check exists to catch has nothing to check yet. Direct reddit.com fetch is **still blocked** in this environment (confirmed again this session) — once posts do go up, verifying they're visible to a logged-out visitor will need Austin's own check or search-engine indexing, not a direct fetch from this session.

**2. Competitive landscape scan:**
- World Anvil: April 2026 update added QoL features to the free Freeman tier (Autolinker, larger uploads, advanced search) but did **not** reverse the 42-article cap — a partial goodwill gesture, still usable as "42-article cap" messaging. No native AI generation found.
- **New finding, needs verification: CharGen (char-gen.com)** looks like it may be a real direct competitor — AI-generated, cross-linked regions/settlements/factions/NPCs via a "World Codex." This contradicts the "no direct AI-native competitor" wedge claim the strategy doc and outreach copy lean on. Could not fetch char-gen.com directly (blocked by egress proxy) — this is a search-snippet-level signal, not confirmed. **Flagged in `COMPETITOR_WATCH.md` and `GROWTH_STRATEGY.md` §2 for Austin/a future session to verify by actually opening the site.**
- Also surfaced, lower confidence: DunMax (mobile "D&D World Builder" app, claims AI NPC/faction/lore generation). RoleForge and DreamGen are AI-GM/live-play tools, not prep/archive tools — adjacent, not direct, same bucket as Campfire.

**3. New opportunities:** None found — couldn't browse live Reddit threads (same fetch block as above), and no other concrete lead surfaced. No change to the existing plan.

**4. Real numbers:** None logged beyond the static 18 free-beta signups / 5–6 active testers from the kickoff session. No analytics/signup tracking confirmed as live yet — still qualitative-only. Numbers won't start moving until Austin actually posts.

**5. Strategy adjustments made:** Added the CharGen caveat to `GROWTH_STRATEGY.md` §2 and a new dated section to `COMPETITOR_WATCH.md`; softened the "no direct competitor" claim to "unconfirmed, verify before repeating in outreach copy" rather than deleting it outright (it may still turn out to be true). No change to channel priority (r/worldbuilding → r/rpg_generators → r/DMAcademy) — nothing today contradicts that call.

**Bottom line for Austin:** the plan hasn't changed, only gotten one caveat added. The blocker is still that Action Items #1 and #2 haven't happened yet — everything downstream (the A/B channel test, the 48h comment-reply window, the metrics log) is waiting on that.

---

## 2026-08-17 — Growth push kickoff (post-paywall)

**Session summary:** First marketing/growth session since billing went live this week (paid launch). Set up `claude_marketing/` as the working folder for this workstream, separate from product dev.

**Research done:**
- Mapped the real TTRPG audience across Reddit (r/worldbuilding, r/DMAcademy, r/rpg, r/rpg_generators, smaller subs), Discord, and YouTube/Twitch — see `GROWTH_STRATEGY.md` Section 1.
- Pulled live pricing/positioning for the three real competitors: World Anvil, Kanka, LegendKeeper — none have native AI generation, all three are manual wikis. Baseline saved to `COMPETITOR_WATCH.md`.
- Investigated the r/rpg_generators "best channel by feel" claim. **Could not browse live Reddit post/comment history this session — reddit.com fetch requests were blocked by tooling.** Used an existing internal note instead (a prior tester-feedback session logged real pushback there along the lines of "if it's using AI, it's not going to get a positive response"). Verdict: test it for real today rather than assume it's still the best channel — see Section 3 of the strategy doc.
- Confirmed with Austin: nothing has been posted about Chronicled since billing went live — today's drafts are the first outreach of the paid era. Also confirmed framing approach: lead with the problem solved (consistency/auto-organized archive), not "AI," per Austin's call on the AI-skeptic risk.

**Decisions made:**
- Revised channel priority from "r/rpg_generators first" (Austin's instinct) to **r/worldbuilding first, r/rpg_generators as a same-day A/B test, r/DMAcademy third pending a rules check.** Rationale in `GROWTH_STRATEGY.md` Section 3.
- All post copy leads with the product's value (grounded consistency, auto-organized archive), mentions AI-assisted generation matter-of-factly rather than as the headline.

**Deliverables produced this session:**
- `GROWTH_STRATEGY.md`, `ACTION_ITEMS.md`, `COMPETITOR_WATCH.md`, this log.
- `drafts/reddit_post_worldbuilding.md`
- `drafts/reddit_post_rpg_generators.md`
- `drafts/reddit_post_dmacademy.md` (needs Austin to confirm current sub rules before use)
- `drafts/twitter_build_in_public_thread.md`
- `drafts/tester_reengagement_dm.md` (optional)

**Open items for next session:**
- Did Austin post the two Reddit drafts today? What happened (upvotes/comments/signups)?
- Did the r/worldbuilding vs. r/rpg_generators same-day test produce a real answer on which channel is actually better?
- Was the r/DMAcademy rules check done, and did that post go out?
- Any tester screenshots/quotes obtained for future posts?

**Known limitation to flag for future sessions:** live Reddit fetch (reddit.com) is blocked in this tool environment — subreddit rules, subscriber counts, and post history need to be manually checked by Austin or reconfirmed via search-engine results rather than direct page fetch.
