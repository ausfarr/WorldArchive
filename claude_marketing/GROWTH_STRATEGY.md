# Chronicled — Growth Strategy

**Owner:** Austin | **Growth lead:** Claude (this thread's role — NOT product dev, see World Builder Dev project for that)
**Last updated:** 2026-08-21 (automated daily check-in)
**Status:** Day 5. Austin checked off Action Items #1/#2/#4/#5/#6 yesterday (2026-08-20) — the first movement since the paid launch — but logged no post URLs or numbers anywhere, and this session found zero external trace of either post via search (reddit.com itself is unfetchable from this environment, so this can't be confirmed or ruled out from here). **Next check-in's top priority: get the actual post URLs into `DAILY_LOG.md`.** Separately, and independent of the above: **Chronicled shipped v1.0.0 this week and dropped beta framing site-wide** (`marketing/index.html`, `marketing/pricing.html` — CTAs now read "Start Now," not "Sign Up"), but both ready-to-post Reddit drafts still describe the product as beta — that line needs updating in the drafts before/if either post goes out for real. Competitively, CharGen shipped a substantial new "Campaign Studio" (session continuity, entity linking, full desktop+mobile UI) — see §2 — and the broader "AI catches lore contradictions" pitch is now visibly a crowded genre, not a 3-competitor race. No change to channel priority ordering.

Read this file cold if you're a future session picking this up. It supersedes nothing in `world_forge_scope.md` (that's product) but sits alongside `session_addendum_marketing_launch_plan.md` (the Weeks 1–4 plan drafted before billing went live) — this doc is the next layer down: the actual channel research, competitor ammo, and this week's execution plan, written after billing went live.

---

## 0. Where things stand (confirmed with Austin this session)

- 18 free-beta signups, 5–6 active testers, rest cold.
- No email list beyond the 18. No social following. No ad budget.
- Billing live now: **10 free generations (no card) → $5/mo for 25 gen/month → $2 per 5-credit top-up pack, rolls over.**
- Nothing has been posted about Chronicled anywhere **since billing went live** — today's drafts (see `drafts/`) are the first outreach of the paid era.
- r/rpg_generators is Austin's gut pick for best channel, based on pre-paywall beta-era activity, not hard data from this launch.
- Austin has 5–10 hrs/week and already runs a separate daily session for product dev — this thread is growth/marketing only.

## 1. Audience map — where TTRPG worldbuilders/GMs actually are

| Channel | Size (approx) | Self-promo tolerance | Notes |
|---|---|---|---|
| r/worldbuilding | ~1.9M | Medium — allows sharing your own worldbuilding work/projects if the post is substantive (real content, not a bare link/ad); tool-as-ad posts get removed if they read as promotional first, worldbuilding second. **Verify current rule wording before posting — I could not browse live Reddit rule pages this session (fetch blocked); rules drift.** | Biggest reach by far. Audience is "people building worlds," not "people shopping for SaaS" — post has to be about the world, with the tool as a footnote/reveal, not the headline. |
| r/DMAcademy | ~700K | Low-medium — historically restricts direct product plugs to specific self-promo days/megathreads; posting a bare "check out my app" outside that window is a fast removal. | High-intent audience (people actively running games, feeling the pain Chronicled solves) but the gate is real. Confirm current self-promo mechanism (megathread vs. flair vs. banned outright) before posting. |
| r/rpg | ~500K | Medium, has a recurring self-promo thread historically | Broader than DMAcademy, more system-agnostic. Good secondary target. |
| r/rpg_generators | Niche (small, generator/tool-focused) | High — the sub's entire content model *is* people sharing generators/tools, so a Chronicled post is on-topic by default | See Section 3 — validated with a real caveat, not a clean yes. |
| r/BehindTheTables, r/dndnext, r/DnDBehindTheScreen | Small–medium | Varies, generally tool-tolerant if framed as a resource | Worth a staggered cross-post later, not week-one priority. |
| Discords: World Anvil's own server, "Tabletop Builders," system-specific homebrew Discords | Varies | **Low for World Anvil's own Discord** (you're pitching a competitor inside their house — high risk of ban/backlash, skip) | Generic TTRPG-tool Discords are workable for soft mentions once there's a demo asset, not a cold pitch. |
| YouTube/Twitch (Bob World Builder, WASD20, Dungeon Dudes-style channels) | Large audiences, high production bar | N/A — this is outreach/partnership, not posting | High potential ceiling (one creator mention = real traffic) but high effort (pitching creators, providing assets) and slow. Rank low for a 5–10 hr/week solo operator right now; revisit once there's a polished demo GIF and 1–2 real user testimonials to send along with the pitch. |
| X/Twitter build-in-public | Small following (starting from ~0) | High tolerance, that's the whole genre | Low effort per post (repurpose CHANGELOG entries), compounds slowly. Good background habit, not a launch driver. |
| Product Hunt / Show HN | One-shot events | High tolerance if genuinely useful/novel | Best saved for after 1–2 weeks of Reddit traction produces real user quotes — a cold PH launch with zero social proof underperforms. |

**Bottom line on audience:** r/worldbuilding is the biggest lever available for free, r/DMAcademy is the highest-intent audience if the self-promo gate can be threaded, and r/rpg_generators is the "easiest to post in" but not necessarily "best converting" — see below.

## 2. Competitor analysis

Full baseline data lives in `COMPETITOR_WATCH.md` (update that file, not this section, when re-checking pricing later). Summary:

| Competitor | Price | Free tier | AI generation? | Known weakness |
|---|---|---|---|---|
| **World Anvil** | $4.50–$25/mo ($54–$300/yr), lifetime option | Yes, but **got sharply cut in an April 2024 change** — free article cap dropped to 42, sparked real user backlash ("the 42 article limit is extremely inconvenient," multiple users called it unfair) | **No native AI content generation** found on their pricing/marketing surfaces | Complex, steep learning curve (widely reported in reviews); free-tier trust was damaged by the 2024 cutback, still cited in comparison content; no auto-generated, lore-grounded content — you fill in every article by hand. |
| **Kanka** | Free tier ("Kobold") is generous and permanent — unlimited entries/campaigns; paid $4.99–$24.99/mo for bigger uploads/perks | Yes, genuinely usable free forever | **No AI generation** | Positioned as the budget/open alternative to World Anvil — good on price, but it's a wiki, not a content engine. Nothing writes for you. |
| **LegendKeeper** | $9/mo ($7.50/mo annual), free tier is view/export-only (no real free editing) | Weak — free tier can't really build anything | **No AI generation** | Clean editor, but same category as the others: manual wiki + maps. Beta-labeled, no generation engine. |

**"Why switch" language Austin can use directly:**

- *"World Anvil, Kanka, and LegendKeeper are all blank-page wikis — you still have to write every NPC, faction, and item yourself. Chronicled generates them for you, grounded in your own world's lore so nothing contradicts itself, and files them into a browsable archive automatically."*
- *"World Anvil cut its free tier hard in 2024 (42-article cap) after years of a more generous free plan — worth knowing if you're free-tier-dependent there."*
- *"None of the big three worldbuilding tools have real AI content generation built in as of today — that's the actual gap Chronicled fills, not just 'another wiki.'"*
- On price: Chronicled's $5/mo undercuts World Anvil's popular Grandmaster tier ($8.25/mo) and LegendKeeper ($9/mo) while including generation, not just hosting.

**2026-08-18 update — the "no direct competitor" claim is now false, treat it as retired.** Two competitors confirmed this session (direct page fetch is still blocked by this environment's egress rules for both domains, but independent search-indexed pages — changelog, feature, and blog pages — corroborate each other enough to move past "unverified"):
- **CharGen** (char-gen.com) ships a "World Codex": NPCs, factions, settlements, regions, and dungeons all land in one place and are explicitly cross-linked via a relationship graph ("click a faction, see its region and members; the world threads itself together"). This is materially the same wedge Chronicled uses. CharGen's own pricing is a gold-credit *art* system (Plus $9.99/mo, Elite $19.99/mo) — the "$5/mo Guild tier" figure flagged in the 2026-08-17 log was confirmed noise, not real; drop it from any future mention.
- **Friends & Fables** (fables.gg) — newly surfaced this session, not previously tracked. Its worldbuilding tools (NPCs, monsters, items, spells, factions, lore, quests, races, classes — nearly Chronicled's exact category list) are **completely free**, no ads or restrictions, and exportable. Whether its content is cross-linked/grounded the way CharGen's and Chronicled's is couldn't be verified (fables.gg is also egress-blocked), but the free-tier breadth alone makes it a real comparison point people will raise. Added to `COMPETITOR_WATCH.md`.

**Consequence for messaging:** stop planning any copy around "nobody else does grounded/linked generation" — neither drafted Reddit post currently makes that claim (checked both this session, they don't), so no draft edits were needed, but any *future* comparison content or blog posts need a sharper wedge than "we link things together." Chronicled's actual remaining differentiators worth leaning on: a private per-user multi-tenant archive (not a shared/public codex), a world-specific stat/skill system layered over the generation prompts, regenerate-with-preview-then-confirm (nothing overwrites silently), and PDF/VTT-ready export (baked battle-map grids, per-category/per-entry PDF). Worth a future session fleshing this into an actual comparison-page draft once Austin has bandwidth — not urgent while posts #1/#2 still haven't gone out.

**2026-08-19 update — third direct competitor confirmed (Reality Forge), and CharGen's gap is widening, not narrowing.** Reality Forge (reality-forge.com, unverified pricing — egress-blocked) is a third tool building the same "entity graph" / cross-referencing generation Chronicled leans on, per independent roundup coverage. Separately, CharGen shipped an MCP server integration (AI assistants can read/write its campaign data directly) and a sketch-guided generation tool since the 2026-08-18 check-in — it is visibly the best-resourced competitor in this space and still shipping weekly. Full detail in `COMPETITOR_WATCH.md`'s 2026-08-19 entry. No change to the "why switch" copy recommendation above — if anything it strengthens the case for leading with Chronicled's narrower, real differentiators (private archive, world-specific stats, preview-then-confirm, PDF/VTT export) rather than competing head-on with CharGen's build velocity.

### 2a. 2026-08-20 update — the pain point Chronicled solves is now independently confirmed as the real gap, not just Austin/Claude's read of it

General-web search this session (not competitor marketing, not this project's own copy) turned up multiple independent sources converging on the same diagnosis: *"the biggest unsolved problem with AI worldbuilding tools in 2026 isn't idea generation — it's memory and consistency... [tools] fail at consistency checking — catching contradictions rather than confidently inventing new lore that conflicts with previous information."* That's Chronicled's exact wedge, described by people with no reason to be talking about Chronicled. Two consequences:
- The messaging in both ready-to-post Reddit drafts (lead with "stop my world's lore from contradicting itself," not "AI") is validated, not just a guess — worth citing this if Austin wants more conviction before finally posting.
- Two more names surfaced while chasing this, logged in `COMPETITOR_WATCH.md`'s 2026-08-20 entry: **Inkfluence AI** (inkfluenceai.com) — a novel-writing platform ($9.99–$19.99/mo) with the same "story-bible-locked codex, re-injected into every generation" grounding mechanic, but TTRPG is one of several supported verticals, not its core audience — adjacent, not a head-to-head competitor. And **"Chronicler"** (chronicler.pro / github.com/mak-kirkland/chronicler) — a free, offline, non-AI worldbuilding wiki with a near-identical name to Chronicled that currently dominates search results for "chronicle-something + worldbuilding." Not a functional competitor (no AI, no generation, no hosted archive), but a real SEO/brand-confusion risk worth Austin's awareness — anyone googling "Chronicled worldbuilding" mid-search-typo risk lands on a different, unrelated free tool.

## 3. r/rpg_generators — validated, with a real caveat

**Honest limitation up front:** live Reddit browsing was blocked for this session (fetch requests to reddit.com were rejected) — I could not pull actual post/comment history or current subscriber counts to hard-validate the "best channel by feel" claim with fresh data. What follows is built from: (a) an internal note already in this project from a prior tester-feedback session, and (b) general knowledge of how that community behaves.

**The one hard data point available:** a prior session's tester feedback logged a real comment from that community context along the lines of *"if it's using AI, it's not going to get a positive response"* — flagged at the time as "not necessarily representative (that subreddit skews toward a vocal AI-skeptic contingent), but a real enough product question to log."

**Verdict:** don't abandon r/rpg_generators, but don't crown it either. Two things are true at once:
1. It's structurally the easiest sub to post in — tool-sharing *is* the content there, so there's no self-promo gate to clear like DMAcademy has.
2. It's also the community most likely to react negatively to "AI-generated" as the headline, per the one real signal already collected.

**Resolution (matches Austin's call this session):** post there, but lead with the *problem solved* (worldbuilding consistency, auto-organized archive) rather than "AI" as the hook — see the drafted post in `drafts/reddit_post_rpg_generators.md`. Treat this post as a real test, not a rerun of "the channel that felt good" — track its actual comment sentiment and conversion this time, log it in `DAILY_LOG.md`, and let that (not the old feel) decide whether it stays the priority channel going forward.

**Recommended actual priority, revised from Austin's instinct:** r/worldbuilding first (biggest reach, natural fit for a "sharing my world + here's the tool" post, no AI-skeptic bias baked into the sub's identity the way r/rpg_generators has), r/rpg_generators second (as a real test, not an assumption), r/DMAcademy third (highest intent but gated — needs the self-promo mechanism confirmed first).

## 4. Prioritized action plan (effort vs. impact, 5–10 hrs/week, $0 budget)

Ranked highest ROI first:

1. **Post in r/worldbuilding today.** (Draft ready — `drafts/reddit_post_worldbuilding.md`.) Highest reach, lowest gate, zero cost. ~30 min to post + tune, then engage comments over 48 hrs (~1–2 hrs spread out).
2. **Post in r/rpg_generators today, same day, non-identical framing.** (Draft ready — `drafts/reddit_post_rpg_generators.md`.) Cheap to test, resolves the open channel-priority question with real data instead of feel. ~15 min to post.
3. **Confirm r/DMAcademy's current self-promo mechanism, then post within the week.** (Draft ready — `drafts/reddit_post_dmacademy.md` — needs Austin to check the sub's current pinned rules/megathread before use, since a wrong-format post there gets removed, not just ignored.) Highest-intent audience of the three.
4. **Start the X/Twitter build-in-public habit this week.** (Starter thread drafted — `drafts/twitter_build_in_public_thread.md`.) ~15 min/week ongoing, repurposes CHANGELOG material Austin's already writing. Low effort, compounds.
5. **Stagger 1–2 more subreddit cross-posts (r/rpg, r/BehindTheTables) over the following week**, each reframed, not copy-pasted. ~30 min each.
6. **Product Hunt / Show HN launch — hold until Weeks 1–2 above produce real comments/upvotes/signups to cite.** Don't burn the one-shot cold.
7. **YouTube/Twitch creator outreach — hold until a polished demo GIF + 1–2 real testimonials exist.** High ceiling, high effort, wrong stage right now.
8. **New, added 2026-08-19 — Submit Chronicled to AI-tool directories (theresanaiforthat.com and similar).** These sites run active, open-submission "Worldbuilding"/"World-building" categories (theresanaiforthat.com alone lists 28–163 tools in the two adjacent categories) — free, passive, discovery-only listings, not a public "look at my project" post, so it doesn't carry the same activation energy that's stalled #1/#2 for three days. Low ceiling per listing but near-zero effort and it compounds with SEO over time. Ranks below the Reddit posts on impact, but ranks above them on "likely to actually get done this week" — worth doing in parallel, not instead of, #1/#2. Needs Austin's own account/email to submit (Claude can find/shortlist the directories but can't create the listing).

### What Austin does personally this week
- Post the two Reddit drafts today (r/worldbuilding, r/rpg_generators) under his own account — Claude can't post as him.
- Reply to comments for the first 48 hours on each — this is the highest-leverage personal time investment; posts that go quiet after posting underperform posts where the OP is visibly present.
- Check r/DMAcademy's current self-promo rule/megathread status (5 min) before that post goes out.
- Decide go/no-go on the DM Chronicled's own beta testers a screenshot/quote ask (template drafted, optional — see `drafts/tester_reengagement_dm.md`) if any of the 5–6 active testers have usable content.

### What Claude handles/drafts
- All Reddit post copy (done, see `drafts/`).
- Twitter build-in-public thread starter (done).
- Ongoing: competitor re-checks (`COMPETITOR_WATCH.md`), daily log entries, next batch of post drafts once this round's results are known.

## 5. Metrics to track (so "best channel" stops being a feel)

Log in `DAILY_LOG.md` after each post: channel, post time, upvotes/comments at 24h and 48h, click-throughs if trackable (use a UTM-tagged link per channel — e.g. `chronicled.world?utm_source=reddit&utm_campaign=worldbuilding_launch`), and signups/trials started in that window. After the r/worldbuilding + r/rpg_generators same-day test, compare the two directly — that's the first real data point on Austin's channel instinct.
