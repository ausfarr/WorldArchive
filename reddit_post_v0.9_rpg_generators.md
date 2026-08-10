**Target subreddit:** r/rpg_generators
**Suggested post type:** Text post (not link) — keep the pitch in your own words, link in a comment or at the very bottom, per that sub's usual norm of not leading with self-promo.

---

## Suggested title options (pick one)

1. Someone here told me "if it's using AI, it's not going to get a positive response" — so I spent the last stretch building a version of my tool that doesn't need it at all
2. Took some blunt feedback from this sub seriously: my worldbuilding tool now has a fully manual mode, zero AI required
3. Update on Chronicled: manual entry, random tables, and an account-wide "turn off AI" switch, after feedback from this sub

---

## Post body

A while back I posted about [Chronicled](https://chronicled.world), the worldbuilding/campaign archive tool I've been building — generates NPCs, enemies, items, factions, locations, etc. and auto-files everything into a browsable wiki for your world. Someone in this sub left a comment that stuck with me: something like *"if it's using AI, it's not going to get a positive response here."* Fair. I didn't want to argue with that, I wanted to actually fix it.

So the last chunk of work has been making the whole thing genuinely AI-optional, not just "AI with an asterisk." Here's what shipped:

**Full manual entry mode.** Every category — NPCs, enemies, items, factions, locations, everything — can now be built entirely by hand from a blank entry. Same forms as before, just starting empty instead of AI-filled. Zero API calls, zero cost, zero cap usage.

**Roll Randomly.** A third option next to "Generate with AI" and "Enter Manually" — instant, free, table-driven generation (weighted tables + templates, no model call at all). It reads your world's genre from setup and reskins itself: a fantasy world rolls enchanted blades and cursed ruins, a post-apocalyptic world rolls scrap-fused scavenger gear, without you touching a setting. Good for a quick placeholder or when you just want a spark, not a finished NPC.

**An actual "AI off" switch.** New account-level toggle in Settings. Flip it and every AI-spend surface disables itself account-wide — not just hidden buttons, enforced on the backend too, so there's no way to accidentally trigger a generation. Manual Entry and Roll Randomly keep working exactly the same with it off.

**World setup itself is AI-optional now too**, not just the content categories. The two spots that used to auto-generate things during setup (a world mood board/faction art, and expanding factions into deeper lore) now ask first instead of just doing it.

Still very much a beta, still very much a solo side project (~5-10 hrs/week), and I'm not going to pretend the AI generation isn't still the core of what makes it useful for a lot of people — but if that's a dealbreaker for you specifically, the tool should now actually work for you, not just claim to.

Full changelog: chronicled.world/changelog.html

Genuinely curious if this lands better, or if there's still friction I'm not seeing — say so, that's how the last round of changes happened.
