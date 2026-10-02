# Session addendum — scroll-driven landing page test

**Status: experiment, hidden, not linked from anywhere.** A side-by-side test of
a full cinematic scroll-driven version of the chronicled.world landing page, to
help decide whether it should eventually replace `marketing/index.html`.
Nothing in the live site was changed. `CHANGELOG.md` and `marketing/version.js`
were deliberately left alone (it's a test, not a release).

## Files (all new)

| File | Purpose |
| --- | --- |
| `marketing/scroll-test.html` | The test page. Generated mechanically from `index.html` so copy and images are identical. |
| `marketing/css/scroll.css` | Loads after `style.css`; reuses its tokens and card classes. |
| `marketing/js/scroll.js` | All scene logic (GSAP + ScrollTrigger). |
| `session_addendum_scroll_test.md` | This file. |

Untouched (verified with `git diff` against the pre-experiment commit):
`marketing/index.html`, `marketing/css/style.css`, `marketing/js/demo-widget.js`,
`marketing/js/reveal.js`, `marketing/js/waitlist-form.js`,
`marketing/sitemap.xml`, `marketing/robots.txt`, `server.js`.

## How to view it

- **Locally:** `python3 -m http.server -d marketing 8000`, then open
  `http://localhost:8000/scroll-test.html`. Any static file server works; there
  is no build step.
- **Production:** `https://chronicled.world/scroll-test.html` once the marketing
  static site redeploys with these files. Production is a Render static site
  behind Cloudflare; `/compare` and `/compare.html` both return 200 with the same
  ETag, so `/scroll-test` should resolve too. **Not verified**: the files weren't
  deployed during this work, and I don't know which branch the marketing site
  deploys from (nothing in the repo says), so the branch may need to be merged
  before it's reachable.
- `server.js` only serves `archive/` (the app), so the page is not reachable on
  `app.chronicled.world`; no routes were touched.

## How to delete it

Delete the four files above and nothing else:

```
git rm marketing/scroll-test.html marketing/css/scroll.css marketing/js/scroll.js session_addendum_scroll_test.md
```

A repo-wide search confirmed nothing else references them (the only matches are
the files' own comments). No sitemap entry, no nav link, no CHANGELOG entry, no
`version.js` change to revert.

## Constraint compliance

- `noindex` meta, canonical → `https://chronicled.world/`, not in `sitemap.xml`.
- Same copy, same three images; header, nav, and footer markup reused unchanged.
- Vanilla JS. GSAP + ScrollTrigger **3.15.0** from cdnjs, pinned, with SRI
  hashes and `crossorigin`. No other libraries, no smooth-scroll hijacking —
  native scroll stays native.
- `demo-widget.js` reused unchanged and loaded as on `index.html`.
  `waitlist-form.js` is **not** loaded: no page on the live site uses it today,
  `index.html` included.
- Only `transform`/`opacity` are animated per frame (verified, see Perf).

## What each scene does

Pinning (desktop mode) applies at **≥901px wide and ≥680px tall**; everything
else gets simple one-shot reveals (see Decisions).

1. **Hero** — pinned ~1 viewport. Headline words scrub from a dim "ghost" to full
   ink, an opacity-driven halo layer makes "archive" glow, the VEX-7 sheet tilts
   in 3D and settles flat, the portrait zooms ~14% inside a crop box.
2. **How it works** — pinned ~2.2 viewports. A progress line draws across the four
   flow steps; each lights up in turn and stays lit; File 01/02/03 swap in one
   grid cell (Export, step 4, keeps File 03 since there are only three cards).
3. **Categories** — pinned ~3.5 viewports. Vertical scroll drives a horizontal
   track; the centred card scales to 1.1× and the rest drop to 0.9× / 0.4
   opacity. One scrubbed value drives track and card state together. Brief hold
   on the last card.
4. **Demo** — entrance transition only. No pin, no scroll listeners, no pointer
   handling; `clearProps` removes the transform once it lands. Verified: the
   widget runs, "Run it again" works, and a mouse wheel over it still scrolls the
   page.
5. **Live** — pinned ~1.6 viewports. The two existing frames stack in one grid
   cell and crossfade (each keeps its own URL bar, so markup is unchanged); the
   screenshot pans ~30% of its overflow inside a fixed-height window.
6. **Sample** — pinned ~2.1 viewports. Copy stays put; derived-stat rows land one
   by one with a formula highlight that hands off row to row, then the ability
   card slides in.
7. **Origin** — scrubbed word by word (25% → full ink) as the passage scrolls
   past; "Echoes of the Neon" fades to pink via a duplicate layer. **Not pinned**
   — at pull-text size it's taller than a short viewport and a pin would clip it.
8. **CTA** — headline scrubs up to scale 1 (`clamp()` triggers, because it's the
   last short section); button gets one glow that settles at ~0.4 and never loops.

Plus: a pink scroll-progress bar under the header, and nav active state
(`How it works` = how + categories; `Try it` = demo, live, sample, origin).

## Decisions worth knowing about

- **901px breakpoint, not 768px.** `style.css` already collapses the hero and nav
  at 900px; a stacked hero is taller than the viewport and a pin would clip it.
  So 768–900px gets the simple treatment, as does any desktop window under 680px
  tall. Tested at 768×1024, 820×1180, 900×700, 901×900, 1024×768.
- **Staged layouts are class-gated.** `.is-staged` is added by JS only inside the
  desktop media query and removed on revert; all hidden/initial states are armed
  from JS (`html.js-scroll`), never in the HTML or unconditional CSS. Decoration
  overlays (halo, pink words, formula highlights, button glow) default to
  `opacity:0` in CSS so they can't show outside a scene that drives them.
- **Ghost headline kept at 18%** at scroll 0 (user's call) so the first screen
  still reads; the CTA and intro copy never hide.
- **Anchors/hash:** nav jumps are instant (a smooth jump would scrub through every
  scene), and `scroll.js` registers each pinned scene so a click or an initial
  `#hash` lands on the scene start rather than a wrong DOM position.
- **`reveal.js` is not loaded** (it would fight GSAP over transforms); mobile
  reveals reuse the existing `.reveal` classes via GSAP.
- **The analytics beacon is omitted** so test traffic doesn't pollute real numbers.

## Bugs found along the way (and fixed)

- The page-wide progress/spy trigger was measured before pin-spacers existed and
  stopped updating mid-page → `end:'max'`, `refreshPriority:-1`.
- The demo widget grows ~315px when run, leaving every pin below it mispositioned
  → `ResizeObserver` on the widget re-measures (read-only; `demo-widget.js`
  untouched).
- `style.css`'s 0.15s `transform` transition on `.step`/`.cat-card` lagged
  GSAP-driven transforms → disabled in staged scenes.
- ~100 staggered `from()` tweens only armed the first word's dim state at load →
  explicit `set` + `fromTo`.
- `quickSetter` writes aren't reverted by `matchMedia`, so resizing desktop →
  mobile left the category cards stuck at desktop scale/opacity → cleared in the
  cleanup.
- A pinned scene taller than the viewport is clipped → hero and How/Live/Sample
  compress to fit down to the 680px floor (content ≤ viewport at 1024×700,
  1280×680, 1280×720, 1366×768, 1440×900, 1920×1080).

## Pre-existing issues on the live `index.html` (not changed there)

- **Flow diagram wraps 2×2 at ≥761px.** 7 children (4 steps + 3 arrows) in 4
  equal columns, so arrows spill onto a second row. Fixed in `scroll.css` only
  (`grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr`); worth porting to
  `style.css` regardless of this experiment.
- **Section `h2`s have very loose line-height** (body's 1.6 inherited), most
  visible on two-line headings like "Real math. Real consistency."
- **Small tap targets on mobile** (from `style.css`, unchanged here): header
  "Start Now" is 97×35px, the "See how it works" ghost link is ~20px tall,
  footer links ~17px tall.

## Robustness results

Tested in Chromium (Playwright) at 1440×900 and 375×812, plus the sizes above.

- **`prefers-reduced-motion`:** `scroll.js` returns before touching the DOM — no
  pins, no scrubbing, no bar, no overlays; all content visible, normal static stack.
- **No JS:** 79 content elements checked, 0 hidden, no horizontal overflow.
- **CDN blocked / GSAP fails:** same as reduced motion (script bails out).
- **Mobile (<901px):** 0 pin-spacers, 0 `.is-staged`, no horizontal overflow; all
  `.reveal`/`.cat-card`/etc. fully visible after scrolling; demo works.
- **Resize desktop → mobile → desktop mid-session:** after the cleanup fix,
  0 stuck elements; pins re-arm on return.
- **Anchors:** every section lands correctly (including after running the demo),
  and direct loads with `#how`, `#categories`, `#live`, `#sample`, `#origin`.

## Perf pass

**Caveat: headless Chromium with software rendering, one machine.** Frame pacing
here says nothing about a real GPU, Safari, Firefox, or a phone. Treat it as
"nothing obviously pathological", not "smooth everywhere".

- Frame pacing: p95 at 16.7ms (vsync) in almost every scene, with and without 4×
  CPU throttling. A handful of 33ms frames appeared (e.g. 3 in Categories on the
  unthrottled run, 1 in the hero on the throttled run); they didn't reproduce
  consistently, so likely noise, but I can't rule out real jank.
- Layout: single-digit layout counts per scene; total layout time ≤ 11ms. No
  thrash. Style recalcs scale with scroll distance, in line with `index.html`.
- **Only `opacity`/`transform`/`translate`/`rotate`/`scale` are written inline
  mid-pin** in all five pinned scenes. `position/top/left/width/height/...` appear
  only when a pin engages or releases (ScrollTrigger's own pin mechanics).
- Script time is roughly 4–8× the static page's during scrubbing (e.g. Categories
  ~237ms over 3,119px at 4× throttle vs ~30ms per 1,636px on `index.html`).
- **Compositor layers:** ~50 at hero/categories, ~96 at Live. Origin was 129 with
  `will-change:opacity` on ~99 words vs 31 without, with no measurable frame-time
  difference → the hint was removed.
- **Cost of adopting it:** GSAP + ScrollTrigger ≈ 117KB raw / **46KB gzipped**
  (cdnjs), plus `scroll.js` 8.8KB gz and `scroll.css` 3.2KB gz, replacing
  `reveal.js` (0.6KB gz). Page height at 1440×900 goes from **5,808px to
  15,788px (2.7×)** — about 17 viewport-heights of scrolling instead of 6.4.
  Mobile height is unchanged (9,007 → 9,009px).

## Not tested — read before deciding

- **Only Chromium.** No Safari (iOS especially), Firefox, or real devices. Possible
  risks: `inset`/`clamp()` support on older browsers, iOS `100vh` toolbar behaviour
  (phones get the simple mode, but iPads ≥901px wide would pin), trackpad
  momentum scrolling through long pins.
- No Lighthouse/CLS/LCP run, no real-GPU paint profiling (the `text-shadow` halo
  and the CTA's large `box-shadow` are painted once and then faded by opacity,
  but that wasn't profiled).
- No accessibility review beyond reduced-motion and no-JS (e.g. keyboard focus
  passing through pinned/dimmed scenes; the dimmed Categories cards are hard to
  read at 0.4 opacity).
- Production routing, as noted above.

## If this were promoted to replace `index.html`

Swap the four differences between the two files back (title, `noindex`, restore
the analytics beacon, drop `scroll.css`/GSAP tags or keep them), port the
flow-diagram fix and `h2` line-height into `style.css`, retire `reveal.js`, then
decide on self-hosting GSAP vs the cdnjs `<script>` (the site has no CSP today),
and re-test in Safari and on real devices first. Product questions this
experiment can't answer: whether a 2.7× longer page converts better or worse
than the current one, and whether the ghost-headline first impression helps or
hurts.
