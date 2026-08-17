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

## ⚠ 2026-08-17 update — possible direct competitor found, needs manual verification

Web search (not a direct page fetch — char-gen.com is blocked by this environment's egress proxy, so this is unverified at the source) surfaced **CharGen** (char-gen.com / getchargen.com) as a "World Codex" + Region Generator producing regions, settlements, factions, NPCs, and plot hooks, explicitly **linked together** — the same "AI-generated content grounded in and cross-referencing the same world" pitch Chronicled makes. Search snippets describe a free tier plus a paid Guild tier around $5/mo, but those exact numbers (2 worlds / 42 articles) suspiciously match World Anvil's Freeman limits, so treat the pricing detail as **low-confidence, likely search-summary noise** until someone opens char-gen.com/tools and getchargen.com directly.

**This matters:** if real, it directly contradicts the "no direct AI-native, lore-grounded generator" wedge claim below and the "no direct competitor found" line in `GROWTH_STRATEGY.md` §2 that outreach copy leans on. **Action needed:** Austin (or a future session with working browser/fetch access) should open both CharGen URLs, confirm what it actually does and costs, and report back — don't lead marketing copy with "nobody else does this" until that's resolved one way or the other.

Also surfaced, lower priority: **DunMax** ("D&D World Builder," mobile app) — claims AI generation of NPCs/cities/factions/lore. Smaller footprint, not independently verified, logged for awareness only.

## Chronicled's current position vs. primary competitors

World Anvil, Kanka, and LegendKeeper: still no native AI generation as of this check. World Anvil's April 2026 update added quality-of-life features (Autolinker, larger image uploads, advanced search) to the free Freeman tier, but the 42-article cap itself was not reversed — a partial goodwill gesture, not a full walk-back of the 2024 cut. Chronicled at $5/mo for 25 generations/month (plus a no-card 10-generation trial) still undercuts Grandmaster ($8.25/mo) and LegendKeeper Pro ($9/mo) while including generation.

**The "no direct AI-native competitor" wedge is no longer a clean claim** — see the CharGen flag above. Re-verify before repeating it in outreach copy.

**Watch for:** CharGen verification (top priority next check), and any of the big three shipping AI generation — either would need a strategy update, not just a note. Check this section first on every re-check.
