# Competitor Watch — Baseline (for future-day diffing)

**Baseline established:** 2026-08-17. Re-check quarterly or whenever a competitor announces a major change (pricing, new AI feature). When re-checking, add a new dated section below rather than overwriting this one, so drift is visible over time.

---

## World Anvil — primary competitor

- **URL:** worldanvil.com
- **Pricing (as of 2026-08-17):**
  - Freeman (free): 2 worlds, 5 articles, 2 maps, 2 timelines, 100 MB storage
  - Master: $4.50/mo or $54/yr — 10 worlds, unlimited articles, 2 GB storage, 4 co-authors, ad-free
  - Grandmaster ("Most Popular"): $8.25/mo or $99/yr, lifetime option — unlimited worlds, 5 GB, custom templates, random generators, API access
  - Sage (professional): $25/mo or $300/yr, lifetime option — white labeling, custom domain, 1,000 subscribers
- **AI generation:** none found on pricing/marketing pages as of this check.
- **Known weaknesses:**
  - Steep learning curve, frequently cited in third-party reviews as complex/overwhelming for new users.
  - April 2024 free-tier cutback (article cap dropped to 42) caused real, documented user backlash — still referenced in comparison/alternative content as a trust issue. Source: [World Anvil Blog — Update: Free Account Changes](https://blog.worldanvil.com/announcements/update-free-account-changes/).
  - Every article is hand-written — no generation engine, no lore-grounded consistency checking.
- **Sources:** [World Anvil Pricing](https://www.worldanvil.com/pricing), [World Anvil Blog — Free Account Changes](https://blog.worldanvil.com/announcements/update-free-account-changes/)

## Kanka — budget/open alternative

- **URL:** kanka.io
- **Pricing (as of 2026-08-17):**
  - Kobold (free): unlimited entries and campaigns, "free forever" — genuinely usable, not a crippled trial
  - Owlbear: $4.99/mo — 1 active premium campaign, ad-free, Discord access
  - Wyvern ("Best value"): $9.99/mo — 3 active premium campaigns
  - Elemental: $24.99/mo — 7 active premium campaigns
  - ~17% discount for annual billing
- **AI generation:** none found on pricing page.
- **Known weaknesses:** it's a wiki/campaign manager, not a content generator — nothing writes NPCs/items/lore for you. Positioned explicitly as the price-conscious World Anvil alternative, which limits room to compete purely on price.
- **Sources:** [Kanka Pricing](https://kanka.io/pricing)

## LegendKeeper — clean-UI alternative

- **URL:** legendkeeper.com
- **Pricing (as of 2026-08-17):**
  - Basic (free): view/export only, no real editing — weak free tier, 14-day Pro trial available
  - Pro: $9/mo, or $90/yr ($7.50/mo effective) — unlimited pages/maps/timelines/collaborators/storage
- **AI generation:** none found on pricing page. Still labeled Beta.
- **Known weaknesses:** free tier can't actually be used to build anything (view-only), pushing everyone toward the $9/mo tier fast. No generation engine.
- **Sources:** [LegendKeeper Pricing](https://www.legendkeeper.com/pricing/)

## Adjacent, not direct competitors (watch, don't chase)

- **Campfire** (campfirewriting.com) — worldbuilding/writing suite, but positioned at novelists/authors, not TTRPG GMs specifically. Different audience, not a head-to-head competitor for Chronicled's positioning.
- **Individual itch.io generators** (NPC generators, loot generators, etc.) — a large fragmented long tail of single-purpose tools, mostly free/cheap one-offs. Not a subscription competitor, but this is the audience already primed to want "a generator" — relevant for channel targeting (r/rpg_generators, itch.io TTRPG tag pages), not for pricing comparison.
- **RoleForge** (alpha, June 2026) and **DreamGen** — both position around AI-narrated/AI-GM'd play sessions (live roleplay, "Scenario Codex" session memory), not pre-session content generation filed into a browsable archive. Different job-to-be-done than Chronicled; watch in case either pivots toward prep/archive.
- **chatbrat.ai** — lets you build a persistent, chattable NPC to stress-test before the table. Adjacent (NPC-focused), not a wiki/archive competitor.

## ✅ 2026-08-18 update — CharGen confirmed as direct competitor; new competitor Friends & Fables found

**CharGen (char-gen.com) — confirmed, not just flagged.** char-gen.com and getchargen.com are still blocked to direct fetch by this environment's egress proxy (confirmed still blocked this session too), but CharGen's own changelog and feature pages, independently indexed and cross-corroborating, describe a "World Codex": every NPC, faction, settlement, region, and dungeon generated lands in one place, and factions/NPCs/settlements/regions/species are explicitly cross-linked via a relationship graph — click a faction, see its region and members. That is materially the same "grounded, cross-referencing" pitch Chronicled makes. Treat the wedge claim in `GROWTH_STRATEGY.md` §2 as retired, not just softened.

CharGen also runs its own comparison-content marketing (`char-gen.com/alternatives/world-anvil`, `char-gen.com/alternatives/kanka-legendkeeper`) — the same "why switch from World Anvil" play this project's drafts use. It's an active, resourced competitor, not a side project.

**Pricing correction:** the "$5/mo Guild tier" noted in the 2026-08-17 entry below was noise. CharGen's real pricing is a gold-credit *art-generation* system: free tier = 10 gold/day, Plus = $9.99/mo (900 gold + all art styles), Elite = $19.99/mo (2000 gold + unlimited Flux.Dev). No evidence of per-text-generation billing separate from the gold system.

**No mention of Chronicled anywhere in CharGen's own content** (checked their "Best AI Worldbuilding Tools 2026" roundup blog post via search-indexed content) — Chronicled isn't on their radar yet, for whatever that's worth.

**New: Friends & Fables (fables.gg)** — not previously tracked, surfaced this session. Free worldbuilding tools (`fables.gg/tools`, itself egress-blocked) reportedly cover NPCs, monsters, items, spells, factions, lore, quests, races, and classes — nearly Chronicled's exact category list — **completely free, no ads/restrictions**, with export allowed. Its core product is an AI-narrated multiplayer text-RPG platform (paid plans $19.95–$39.95/mo for larger parties/longer memory), so the free worldbuilding tools function as a lead-gen/loss-leader, not the main business — worth knowing since that changes how directly it actually competes on Chronicled's paid tier. Unconfirmed whether its generated content is cross-linked/grounded the way CharGen's and Chronicled's are (egress-blocked, couldn't verify). Needs a real look once fetch access allows it.

Also still on watch, lower priority: **DunMax** (mobile D&D world builder, AI NPC/faction/lore generation, not independently verified) and **StormScape** (encounter-building + AI narrative suggestions; also runs its own "World Anvil vs LegendKeeper vs Kanka vs StormScape" comparison content — same genre of competitor as CharGen, worth a closer look in a future cycle if it keeps showing up).

## 🆕 2026-08-19 update — Reality Forge confirmed as third direct competitor; CharGen ships MCP server integration

**New: Reality Forge (reality-forge.com)** — surfaced this session via search, independently described (by third-party roundup content, not its own marketing) as part of "the 2026 generation of tools" that build an **entity graph**: a searchable, persistent record of every person, place, faction, and event in a campaign, explicitly so a newly generated NPC or settlement can reference what already exists instead of inventing from scratch. That is, again, materially the same wedge Chronicled and CharGen both use — three tools now converging on "grounded, cross-referencing generation" as table stakes, not a differentiator. Direct fetch of reality-forge.com is blocked by this environment's egress proxy — pricing and exact feature scope are unverified, logged as a lead for Austin or a future unblocked session to check directly.

**CharGen keeps shipping, still the most active competitor to watch:** since the 2026-08-18 check-in, CharGen (a) became an **MCP server** (July 2026) — letting AI assistants (Claude, others) integrate directly with a user's CharGen campaign to read sessions/recaps/World Codex and create new NPCs/monsters/factions, a meaningfully more sophisticated integration play than anything Chronicled or the other competitors have; (b) shipped a **Sketch Tool** letting users guide AI generation with their own sketches; (c) ran a giveaway (closed 2026-08-16, prizes: free Session Summary, 150 gold, 3-month subscription chance) — an active user-acquisition/engagement tactic worth noting as a tactic class, not something to copy verbatim given Chronicled's much smaller base.

**World Anvil:** no material change since 2026-08-18 — still just the Reading Challenge community event and the ported professional-settings UI work already logged.

**New opportunity, not a competitor:** AI-tool directory sites (theresanaiforthat.com, and likely similar directories) run active "Worldbuilding"/"World-building" categories with 28–163 tools listed and open submission flows. This is a genuinely low-friction, zero-cost discovery channel that hasn't been explored yet — distinct from the Reddit-posting blocker since it doesn't require the same kind of public "here's my project" post. Flagged as a new action item; see `ACTION_ITEMS.md`.

**Consequence for messaging:** the "grounded/cross-referencing generation" wedge is now shared by at least three funded-enough-to-ship competitors (CharGen, Friends & Fables' tools, Reality Forge). Reconfirms the 2026-08-18 call to lean on Chronicled's actual remaining differentiators (private per-user archive, world-specific stat/skill system, preview-then-confirm regenerate, PDF/VTT export) rather than "we link things together" in any future comparison content.

## 🆕 2026-08-20 update — two more names on the map; CharGen's changelog headline unverified; no material change from World Anvil/Reality Forge

**New, adjacent (not direct): Inkfluence AI (inkfluenceai.com).** Surfaced while researching general worldbuilding-AI coverage. Core product is an AI *novel*-writing platform — flat-rate pricing ($9.99/mo Creator, 35 chapters; $19.99/mo Premium, unlimited), covering chapter generation, story bible, cover design, EPUB/PDF export, and audiobook narration. It does use the same grounding mechanic Chronicled/CharGen/Reality Forge do (a "story-bible-locked codex" re-injected into every generation so world rules don't drift), and its marketing explicitly lists "TTRPG designers" as one of three target audiences (alongside novelists and series authors) — but the product is built around producing book manuscripts, not a browsable per-category archive for running a game. Log as adjacent/watch, not a fourth direct competitor: the overlap is the grounding mechanic, not the job-to-be-done.

**New, not a competitor but a discoverability risk: "Chronicler."** Two things share this near-identical name and currently outrank anything findable for "Chronicled": `chronicler.pro` (a paid-looking but actually free, offline, local-Markdown worldbuilding wiki with Obsidian-vault support) and `github.com/mak-kirkland/chronicler` (its open-source repo, 690+ stars, 16,010+ installs, 98.7% Reddit upvote ratio per its own marketing — genuinely popular in this exact audience). Neither has AI generation or a hosted archive — not a functional competitor — but the name collision is real: search queries combining "worldbuilding" with anything close to "Chronicled" surface Chronicler first. Worth Austin being aware of for future SEO/comparison-content work; not an action item this week.

**CharGen — one unverified signal, no confirmed new feature.** char-gen.com's changelog page is still egress-blocked to direct fetch, but its indexed page title now reads "Campaign Studio: Write the Whole Campaign" — a possible new feature (campaign-level document generation?) not mentioned in the 2026-08-19 entry's roundup (MCP server, Sketch Tool, giveaway). Flagged for a future session with fetch access to confirm scope — logged as a lead, not a confirmed shipment, since the title alone isn't enough to characterize it.

**Reality Forge:** still fully egress-blocked (`reality-forge.com` and `www.reality-forge.com` both blocked this session); pricing page confirmed to exist via search-indexed metadata only ("AI Assisted Worldbuilding and RPG Campaign Management") — no tier/price detail available yet. Unchanged from 2026-08-19: still a lead to verify, not new information.

**World Anvil:** August 2026 newsletter (blog.worldanvil.com, egress-blocked, title-only via search) appears to be UI/community-event content consistent with what's already logged (professional article settings ported to new editor, Reading Challenge, Summer Camp merch) — no indication of a pricing or AI-feature change. No update needed to the baseline.

**No change to the "lean on real differentiators" recommendation** (private per-user archive, world-specific stat/skill system, preview-then-confirm regenerate, PDF/VTT export) — today's findings add texture (validate the pain point independently, note two new names) but don't change the competitive positioning call from 2026-08-18/19.

## 🆕 2026-08-21 update — CharGen ships "Campaign Studio"; the "catches contradictions" pitch is now a crowded genre, not a 3-way race

**CharGen's Campaign Studio** (the changelog-title lead flagged unconfirmed on 2026-08-20) is now a real, substantial feature, not just a title change: session continuity (recaps, structured session events, bounded transcript windows so you don't reload a whole recording), a "Campaign Map" linking notes/sessions/entities/quests/relationships, inline entity creation directly from the manuscript (select an unrecognized name in your notes, generate it from the 22-generator World Codex catalogue on the spot), and a full desktop+mobile UI with an AI "Assistant" panel. This is CharGen building toward a full session-prep-to-table workspace, not just cross-linked generation — the gap flagged on 2026-08-19 ("most-resourced, still shipping weekly") has widened again. Doesn't change the standing recommendation to lean on Chronicled's narrower differentiators rather than compete on feature breadth — if anything it strengthens the case, since matching CharGen's pace directly isn't realistic for a 5–10 hr/week solo operator.

**Separately, general search this session surfaced that "AI keeps your lore from contradicting itself" is now a genre-standard pitch, not a 3-competitor wedge.** Beyond the three already-tracked direct competitors (CharGen, Friends & Fables, Reality Forge), tools making essentially the same claim include **Inkwarden** (an AI companion that checks whether plot points contradict an established timeline/canon) and **Storyflow** (a map/faction/timeline canvas where the AI "catches contradictions as it grows"), alongside free alternatives already known (Fantasia Archive, Lore Forge, Fortelling). None deep-verified this session — logged as a landscape read, not new confirmed entries — but the practical takeaway for messaging: "we catch contradictions" is table stakes across this whole category now, reinforcing (not changing) the 2026-08-18/19 call to lead with Chronicled's more specific differentiators instead.

## 🆕 2026-08-22 update — two adjacent names found (session-memory and AI-GM tools, not content generators); compare.html brought current

**New, adjacent (not direct): Archivist AI (myarchivist.ai).** Turns live TTRPG sessions — Discord recordings, audio uploads, or notes — into recaps, structured timelines, and a searchable "Campaign Wiki" chatbot, across 35+ languages. Pricing: 30-day free trial (1 campaign, 2 sessions, 5 AI images, Core + Insight features), then add-ons (Campaign Pass $6/30 days for an extra campaign slot, Extra Session $2, text-only bulk packs). Its job-to-be-done is *session capture and recall* — what happened at the table — not generating new grounded content before the session the way Chronicled/CharGen/Reality Forge do. Logged as adjacent/watch: the "Campaign Wiki" framing is close enough to Chronicled's "the Archive" that it's worth knowing about, but it doesn't compete on content generation.

**New, adjacent (not direct): Jenova AI's "Roleplay Game Master".** A free (no card required), frontier-model-powered (GPT-5.4/Claude Opus 4.6 per their own marketing) AI-GM'd roleplay tool — persistent memory across sessions, adaptive NPCs, "virtual societies emerge" framing. Same bucket as already-tracked RoleForge/DreamGen: it's a live-play/AI-GM tool, not a pre-session content-generation-into-an-archive tool. No pricing tiers found beyond "free with full feature access." Logged as adjacent, not competing on Chronicled's actual job-to-be-done.

**Action taken this session (not just watching):** `marketing/compare.html` — the live public comparison page — was still only comparing Chronicled to World Anvil, Campfire, and Chronicler, four days after CharGen was confirmed as a real direct competitor (2026-08-18 entry above). Added CharGen as a full column on the live page (core model, AI generation pricing model, portrait/token art, lore-consistency mechanism, stat blocks, PDF export, best-fit framing), marking two rows "not confirmed" (computed stat blocks, PDF export) rather than guessing, consistent with the page's existing honesty framing. Reality Forge, Friends & Fables, and the newer "adjacent" names are not yet added to the live page — CharGen was prioritized because it's the most-verified, most-resourced, and most-likely to actually get raised by name in comments/questions.

**No material change from World Anvil this session** — no new pricing or feature signal found beyond what's already logged.

## Chronicled's current position vs. primary competitors

World Anvil, Kanka, and LegendKeeper: still no native AI generation as of this check; World Anvil's August 2026 update was UI/community-event only (professional settings ported to the new editor, a reading challenge) — no pricing or AI change. Chronicled at $5/mo for 25 generations/month (plus a no-card 10-generation trial) still undercuts Grandmaster ($8.25/mo) and LegendKeeper Pro ($9/mo) while including generation.

**The "no direct AI-native competitor" wedge is gone — CharGen confirmed, Friends & Fables newly added.** Stop using it in any copy, drafted or future. See `GROWTH_STRATEGY.md` §2 for what to lean on instead.

**Watch for:** a real (non-blocked) look at fables.gg's actual grounding behavior, and whether CharGen or Friends & Fables notice Chronicled once outreach posts go out. Check this section first on every re-check.
