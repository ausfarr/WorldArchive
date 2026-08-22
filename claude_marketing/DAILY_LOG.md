# Chronicled — Marketing Daily Log

Newest entries at the top. Log what actually happened, not what was planned — `GROWTH_STRATEGY.md` and `ACTION_ITEMS.md` hold the plan.

---

## 2026-08-22 — Automated daily check-in, Day 6: Austin says move on from the verification loop; compare.html updated with CharGen; two adjacent tools found

**Session summary:** Sixth automated check-in. Austin left a direct note at the bottom of the previous entry: the r/rpg_generators post is live at `https://www.reddit.com/r/rpg_generators/comments/1vtquiw/chronicled_is_out_of_beta_v100_is_live/`, and his instruction was to check it if possible, otherwise move on — stop getting stuck on unresolved verification, keep pushing forward, and look for ways to improve the site and draft marketing ideas. That instruction shaped this session's approach.

**1. Previous post visibility check.** Tried fetching the URL directly (`www.reddit.com` and `old.reddit.com`, both the HTML page and the `.json` API endpoint) — all four attempts failed with "Claude Code is unable to fetch from [host]," the same hard block logged in every one of the five prior check-ins. Also re-ran targeted web searches (`site:reddit.com` variants, the post ID `1vtquiw`) — no external trace, consistent with Reddit's indexing lag rather than proof either way. **Conclusion: this is a permanent environment limitation, not a transient one** — six consecutive sessions, same failure mode, every fetch strategy tried. Per Austin's instruction, this is being logged and set aside rather than re-attempted identically tomorrow; see `ACTION_ITEMS.md` for the one lightweight ask (paste a screenshot or the visible score/comment count next time it's convenient — no urgency). One real observation: the live post's title (`chronicled_is_out_of_beta_v100_is_live`) doesn't match either original A/B-test draft title — it reads as a v1.0-launch announcement Austin wrote himself, not the `reddit_post_rpg_generators.md` draft framing. No r/worldbuilding URL has ever been logged, so whether that half of the original same-day A/B test happened is still unknown — not chasing this further per the same instruction.

**2. Competitive landscape scan:** Two adjacent (not direct) tools surfaced: **Archivist AI** (myarchivist.ai) — turns live TTRPG session recordings/notes into recaps, timelines, and a searchable "Campaign Wiki," which is session-memory tooling, not pre-session content generation (different job-to-be-done than Chronicled). **Jenova AI's "Roleplay Game Master"** — a free AI-GM'd persistent-world roleplay tool, same bucket as already-tracked RoleForge/DreamGen (live play, not prep-and-archive). Neither changes the competitive picture materially; full detail in `COMPETITOR_WATCH.md`'s 2026-08-22 entry. No material change from World Anvil, CharGen, or Reality Forge beyond what's already logged.

**3. New opportunities / site improvement (the concrete forward move this session):** `marketing/compare.html`, the live public comparison page, was still only comparing Chronicled against World Anvil, Campfire, and Chronicler — four days after CharGen was confirmed (2026-08-18) as the real, resourced direct competitor, and it was never added. Fixed this session: added CharGen as a full column (core model, AI-generation pricing model, portrait/token art, lore-consistency mechanism, stat blocks, PDF export, best-fit framing), marking two rows "not confirmed" rather than guessing, matching the page's existing honest-comparison tone. Updated the page's title/meta tags to mention CharGen for search relevance. This is a real site change, committed and pushed with this session's other work — not just a drafted idea.

**4. Real numbers:** None logged. Still 18 free-beta signups / 5–6 active testers as the only concrete figures on record; the live Reddit post has no visible score/comment count from this session (fetch blocked) and Austin hasn't pasted one. Real analytics/signup tracking is still pending setup.

**5. Strategy adjustments made:** Updated `GROWTH_STRATEGY.md` §0 status line to reflect Austin's "move on" instruction and stop treating daily re-verification as the top priority; added §2b for the two new adjacent tools and the compare.html fix. Refreshed `ACTION_ITEMS.md` to drop the repeated "confirm the URL" framing (resolved: URL exists, further verification is optional/low-priority) and add a short, concrete list for today. No change to channel priority ordering.

**Bottom line for Austin:** the verification loop is closed out per your instruction — the post exists, this environment structurally can't fetch Reddit to check its visibility, and that's not going to change tomorrow. Real forward motion this session: the public comparison page now honestly reflects CharGen as a competitor instead of pretending the space is smaller than it is. Next useful things from your side: a comment-reply pass on the live post if you haven't already, and whichever of the still-open Action Items (directory submissions, DMAcademy rules check if not actually done) is quickest to knock out.

---

## 2026-08-21 — Automated daily check-in, Day 5: Austin marked #1/#2 done but no URLs/results logged anywhere; v1.0.0 shipped (beta framing dropped); CharGen ships Campaign Studio

**Session summary:** Fifth automated check-in, and the first with real movement on Austin's side: a commit yesterday afternoon (`e63f9cf`, "Update ACTION_ITEMS.md with completed tasks," Thu Aug 20 14:01 EDT) checked off #1 (r/worldbuilding post), #2 (r/rpg_generators post), #4 (DMAcademy rules check), #5 (Twitter thread), #6 (log results in DAILY_LOG.md), and the optional tester-reengagement DM. That commit only edited checkboxes — no post URLs, no upvote/comment numbers, and nothing was actually added to this log despite #6 being marked done. Separately, Austin also shipped **v1.0.0 this week**: beta framing was removed across `archive/` and `marketing/`, and pricing/index CTAs changed from "Sign Up" to "Start Now" (commits `cad59bc`, `68af2ef`, `f9f6cb1`, `5c80a47`, `e5bc6b3`, all Thu Aug 20). Product-side, Chronicled is no longer in beta as of this week.

**1. Previous post visibility check — inconclusive, cannot confirm either way.** No post URLs exist anywhere in the repo to fetch directly, and direct `reddit.com` fetch remains hard-blocked in this environment (confirmed again this session, same failure mode as every prior check-in). Searched for both drafts' distinctive title phrasing (`"stop my TTRPG world's lore from contradicting itself"`, `"generator that remembers everything it already generated"`) and `site:reddit.com "chronicled.world"` — zero hits on any of them. This is consistent with either (a) the posts are live but Reddit content typically lags general web-search indexing by more than a day, so absence isn't proof of nothing, or (b) they were never actually posted and the checkboxes reflect intent/an in-progress action rather than a completed one, or (c) the "silent suppression" risk this check exists to catch. Cannot distinguish between these from here — **this needs Austin to paste the actual post URLs into this log**, both so future automated sessions can track real engagement and so a logged-out visibility check (the one this task is actually supposed to run) becomes possible at all.

**2. Competitive landscape scan:**
- **CharGen shipped "Campaign Studio"** — the changelog-title lead flagged as unconfirmed on 2026-08-20 is now a real, substantial feature: session continuity (recaps, structured session events, bounded transcript windows), a "Campaign Map" linking notes/sessions/entities/quests/relationships, inline entity creation from the manuscript (select an unrecognized name, generate it directly from the 22-generator World Codex catalogue), and a full desktop+mobile UI with an AI "Assistant" panel. This is a materially bigger, more integrated product than a generator-plus-archive — CharGen is now building toward a full session-prep-to-table workspace, not just cross-linked generation. Widens the gap flagged on 2026-08-19; reinforces (doesn't change) the standing call to lean on Chronicled's narrower differentiators rather than compete on breadth.
- **The "catches contradictions" pitch is now crowded, not just a three-way race.** General search this session surfaced several more tools making the same core claim independent of the three already-tracked direct competitors: **Inkwarden** (AI companion that checks whether plot points contradict an established timeline/canon) and **Storyflow** (canvas combining maps/factions/timelines with an AI that "catches contradictions as it grows"), alongside already-known free alternatives (Fantasia Archive, Lore Forge, Fortelling). None of these were deep-verified this session (time-boxed, and several likely egress-blocked) — logged as a landscape observation, not new confirmed competitors requiring individual `COMPETITOR_WATCH.md` entries yet. The takeaway: "AI that keeps your world consistent" has become a genre-standard pitch across 2026, not a wedge unique to Chronicled or its three main rivals.
- **Reality Forge:** pricing page URL confirmed to exist (`reality-forge.com/pricing`) but content still unreachable (egress-blocked) — unchanged from 2026-08-19/20, still unverified.
- **World Anvil:** no material change found beyond what's already logged (August Reading Challenge, Summer Camp merch, September/October community-event previews) — no pricing or AI-feature change.

**3. New opportunities:** Reddit remains fully inaccessible from this session for live thread scanning — same standing limitation. Confirmed theresanaiforthat.com's Worldbuilding category (28 tools currently) has an open "Submit AI tool" flow, consistent with the 2026-08-19 finding — Action Item #8 is still open and still a same-day-doable task if Austin wants a lower-friction win.

**4. Real numbers:** None logged. Still 18 free-beta signups / 5–6 active testers as the only concrete figures on record — and per the note above, even yesterday's supposedly-completed Reddit posts have no attached numbers. Real analytics/signup tracking is still pending setup.

**5. Strategy adjustments made:** Updated `GROWTH_STRATEGY.md` §0 status line and added a note that the product shipped v1.0.0 and dropped beta framing this week — which matters because both ready-to-post Reddit drafts currently say *"It's in beta and I'm still actively building it"* in the body copy. If the posts described above haven't actually gone out yet, that line needs updating before they do (a live v1.0.0 product calling itself "beta" undersells it and reads as stale). If they *have* already gone out with the old copy, it's a minor inconsistency, not worth editing after the fact. Logged CharGen's Campaign Studio expansion in `COMPETITOR_WATCH.md`. No change to channel priority ordering.

**Bottom line for Austin:** something moved for the first time in five check-ins, but not visibly enough to act on: the checkboxes say #1/#2 are posted, but there's no URL, no number, and no trace this session could find externally. Paste the actual post links into this file (or just tell the next check-in directly) so this stops being a search-engine guessing game — and if those posts haven't gone out yet, swap the "it's in beta" line for something reflecting the v1.0.0 launch before they do.

Austin:
https://www.reddit.com/r/rpg_generators/comments/1vtquiw/chronicled_is_out_of_beta_v100_is_live/
Link above to post. Let's move on from this and move on from pending tasks. Check the post if you can, if not, we just continue forward. Keep doing your thing, don't ever get caught up on tasks not completed. If possible, find ways to make the actual website better, draft marketing ideas, etc. Keep pushing to get this seen.

---

## 2026-08-20 — Automated daily check-in, Day 4 still pending; pain point independently validated, two new names found

**Session summary:** Fourth automated check-in. Still nothing moved on Austin's side — Action Items #1 and #2 are unchecked for a fourth straight day, the whole blocker is unchanged. This session's main development was finding independent (non-competitor, non-Chronicled) validation that Chronicled's core pitch targets the actual unsolved problem in this space, plus two new names for the competitive map.

**1. Previous post visibility check — still N/A, nothing posted yet.** Searched `"chronicled.world" reddit` and `site:reddit.com "Chronicled" TTRPG worldbuilding AI` again — no indexed Reddit posts about Chronicled found, unchanged from the prior three check-ins. Since there is still no live post anywhere, there is nothing for the "silent suppression" check (fetch each post URL logged out) to actually check — that verification stays blocked on Austin posting in the first place, not on a tooling limitation this time.

**2. Competitive landscape scan:**
- **Independent validation of the core pitch:** general web search (not competitor marketing) surfaced multiple sources agreeing that AI worldbuilding tools' real unsolved problem in 2026 is lore memory/consistency, not generation itself — "[tools] fail at consistency checking — catching contradictions rather than confidently inventing new lore that conflicts with previous information." That is Chronicled's exact wedge, said by people with no reason to be talking about Chronicled. Logged in `GROWTH_STRATEGY.md` §2a as evidence the drafted posts' framing (lead with "stop lore from contradicting itself," not "AI") is on target.
- **New, adjacent: Inkfluence AI** (inkfluenceai.com) — an AI novel-writing platform ($9.99–$19.99/mo) with the same story-bible-grounding mechanic, listing TTRPG designers as one of three target audiences. Job-to-be-done is manuscript generation, not a running-a-game archive — logged as adjacent/watch, not a fourth direct competitor.
- **New, not a competitor — SEO/brand-confusion risk:** "Chronicler" (chronicler.pro and its open-source repo, mak-kirkland/chronicler on GitHub, 690+ stars) is a free, offline, non-AI worldbuilding wiki with a near-identical name that currently outranks anything findable for "Chronicled" in search. No functional overlap (no AI, no hosted archive) but worth Austin's awareness for future SEO work.
- **CharGen:** one unverified signal — its changelog page's indexed title now reads "Campaign Studio: Write the Whole Campaign," a possible new feature not covered in the 2026-08-19 roundup. Page itself is still egress-blocked to direct fetch, so this is a lead for a future session to confirm, not a confirmed shipment.
- **Reality Forge:** still fully egress-blocked (both `reality-forge.com` and `www.reality-forge.com`), pricing still unverified.
- **World Anvil:** no material change — August newsletter (title/metadata only, page itself egress-blocked) reads as the same UI/community-event content already logged, no pricing or AI-feature change.
- Full detail in `COMPETITOR_WATCH.md`'s 2026-08-20 entry.

**3. New opportunities:** Reddit remains fully inaccessible from this session (no change from prior check-ins) — could not scan live threads for engagement opportunities or verify current subreddit self-promo rules. No other concrete new-opportunity lead surfaced beyond the pain-point validation above, which is message-validation rather than a new channel or thread to jump into.

**4. Real numbers:** None logged beyond the static 18 free-beta signups / 5–6 active testers. Still qualitative-only — numbers won't move until outreach actually goes out. (Real analytics/signup tracking is still pending setup, per the standing note in the task brief — nothing to factor in yet.)

**5. Strategy adjustments made:** Added §2a to `GROWTH_STRATEGY.md` (pain-point validation) and a 2026-08-20 entry to `COMPETITOR_WATCH.md` (Inkfluence AI, Chronicler naming collision, CharGen changelog lead). No change to channel priority ordering (r/worldbuilding → r/rpg_generators → r/DMAcademy) and no change to the drafted post copy — nothing today argues for either. The one real change worth flagging: this is now four consecutive automated check-ins with zero outreach action from Austin's side while three direct competitors (CharGen, Reality Forge, and by extension the broader "entity graph" category) keep shipping. The gap between "drafts have been ready since 2026-08-17" and "still nothing posted" is now the single largest risk to this plan, bigger than any competitor finding.

**Bottom line for Austin:** four days, zero posts, drafts unchanged and still ready. Today's finding worth knowing: the exact problem Chronicled solves (lore consistency, not just generation) is independently recognized as the real gap in this space right now — that's about as much external validation as this plan is going to get without a live post. The blocker has never been the copy or the channel; it's posting it.

---

## 2026-08-19 — Automated daily check-in, Day 3 still pending; third competitor confirmed, new low-friction channel found

**Session summary:** Third automated check-in. Still nothing moved on Austin's side — Action Items #1 and #2 are unchecked for a third straight day. This session's main development, again, was competitive intelligence plus one new growth-channel idea, not outreach progress (there's still nothing to report there).

**1. Previous post visibility check — still N/A, nothing posted yet.** Searched `"chronicled.world" reddit` and `site:reddit.com "Chronicled" TTRPG worldbuilding AI` — no indexed Reddit posts about Chronicled found, same as the prior two check-ins. Direct reddit.com fetch is still hard-blocked ("Claude Code is unable to fetch from www.reddit.com") — confirmed again this session, unchanged failure mode from 2026-08-18. So the "silent suppression" check this task exists to run still has nothing to check; that verification has to happen via Austin's own logged-out browser check once a post actually exists.

**2. Competitive landscape scan — real movement again:**
- **Reality Forge (reality-forge.com)** confirmed as a third direct competitor via independent roundup coverage — another "entity graph" tool that cross-references every NPC/place/faction/event so new generations don't contradict what already exists. Same wedge as Chronicled and CharGen. Direct fetch blocked (egress proxy), so pricing/exact scope unverified — flagged for Austin to check directly when he has a minute.
- **CharGen keeps shipping and remains the most resourced competitor**: became an MCP server in July 2026 (AI assistants can read/write a user's CharGen campaign directly — a more sophisticated integration play than anything in this space right now), shipped a sketch-guided generation tool, and ran a giveaway that closed 2026-08-16. Still no mention of Chronicled anywhere in their content.
- World Anvil: no material change since yesterday (Reading Challenge community event, ported UI settings — already logged).
- Full detail in `COMPETITOR_WATCH.md`'s 2026-08-19 entry.

**3. New opportunities:** Reddit is still fully inaccessible from this session, so no live thread-level engagement scan was possible again. Did surface one concrete, actionable lever while searching competitor coverage: **AI-tool directory sites** (theresanaiforthat.com confirmed to run open-submission "Worldbuilding"/"World-building" categories with 28–163 listed tools) are a free, passive discovery channel nobody has pursued yet. Unlike the Reddit posts, this doesn't require a public "here's my project" post — just filling out a listing form — so it's lower activation energy for a founder who's stalled three days running on the harder ask. Added as Action Item §4 #8 in `GROWTH_STRATEGY.md` and a new checklist item below. Also noted (not urgent): both CharGen and Friends & Fables are actively publishing their own "best AI worldbuilding tools" roundup/listicle blog posts as content marketing — a tactic class Chronicled could copy later once there's enough product maturity/screenshots to fill one out credibly.

**4. Real numbers:** None logged beyond the static 18 free-beta signups / 5–6 active testers. Still qualitative-only — numbers won't move until outreach actually goes out.

**5. Strategy adjustments made:** Logged Reality Forge and CharGen's MCP-server/sketch-tool shipments in `COMPETITOR_WATCH.md` and `GROWTH_STRATEGY.md` §2. Added the AI-directory-submission idea as a new, lower-friction parallel action in `GROWTH_STRATEGY.md` §4 (item #8) — explicitly framed as *in addition to*, not instead of, the still-unposted Reddit drafts, since it can't substitute for the reach a real post gets. No change to channel priority ordering (r/worldbuilding → r/rpg_generators → r/DMAcademy) — nothing today argues for reordering it, the blocker isn't which channel, it's that none have been touched yet.

**Bottom line for Austin:** three days in, the blocker hasn't moved — #1 and #2 are still sitting unposted while a third funded competitor (Reality Forge) and CharGen's continued shipping (MCP integration, sketch tool) both landed this week. If posting to Reddit itself is the friction point, the AI-directory submissions added today are a genuinely 10-minute, lower-stakes way to get *something* moving this week without touching that blocker directly.

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
