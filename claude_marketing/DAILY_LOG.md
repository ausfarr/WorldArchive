# Chronicled — Marketing Daily Log

Newest entries at the top. Log what actually happened, not what was planned — `GROWTH_STRATEGY.md` and `ACTION_ITEMS.md` hold the plan.

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
