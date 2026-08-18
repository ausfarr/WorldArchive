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

## Chronicled's current position vs. primary competitors

World Anvil, Kanka, and LegendKeeper: still no native AI generation as of this check; World Anvil's August 2026 update was UI/community-event only (professional settings ported to the new editor, a reading challenge) — no pricing or AI change. Chronicled at $5/mo for 25 generations/month (plus a no-card 10-generation trial) still undercuts Grandmaster ($8.25/mo) and LegendKeeper Pro ($9/mo) while including generation.

**The "no direct AI-native competitor" wedge is gone — CharGen confirmed, Friends & Fables newly added.** Stop using it in any copy, drafted or future. See `GROWTH_STRATEGY.md` §2 for what to lean on instead.

**Watch for:** a real (non-blocked) look at fables.gg's actual grounding behavior, and whether CharGen or Friends & Fables notice Chronicled once outreach posts go out. Check this section first on every re-check.
