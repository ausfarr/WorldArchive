# Session addendum: "Make VTT Token" (shipped)

## Why

Tracked repeatedly in `claude_marketing/ACTION_ITEMS.md` and
`COMPETITOR_WATCH.md` starting 2026-08-27 (CharGen's Token Maker), and
resurfaced almost every subsequent daily check-in as "the smallest
shippable slice" of the broader portrait-editing gap CharGen kept
widening (Face Swap/Inpainting/Background Removal, Character Reference
Workflow, direct VTT-token handoff). The marketing thread's own framing:
Chronicled already generates a portrait for every NPC/Enemy/Class/Item/
Survivor/Location entry (`lib/imagegen.js` → Gemini), but has no way to
turn that art into something a GM can actually drop onto a VTT map —
this closes exactly that gap, and only that gap. The bigger idea flagged
alongside it (a "keep this face on regenerate" identity-lock feature)
is a real Gemini-imagegen-reference-image change and explicitly out of
scope here — not attempted this session.

## What shipped

- New `archive/js/vttToken.js` — self-contained, no new backend route.
  Adds a "Make VTT Token" button to `#entry-export-zone` on any dossier
  page that renders portrait art (checked via presence of `.portrait-img`
  or `.portrait-slot` in the DOM, rather than hardcoding the category
  list a second time — factions/logs/etc. never render either element).
- Clicking it opens a small modal (same inline-styled overlay pattern as
  `openImportCharacterModal()` in `archive/js/render.js`) with a live
  `<canvas>` preview, four shape choices (circle, rounded square, hex,
  heater-shield — matching CharGen's shape set), and a border-color
  picker. "Download Token" exports a 512×512 PNG via `canvas.toBlob`.
- `renderDossier()` (`archive/js/render.js`) calls `wireVttTokenTool(entry)`
  right after the existing `wireEntryExportButton(entry)` call.
- `dossier.html` loads the new script after `worldArtActions.js`.
  `scripts/bump-cache-version.js`'s `CACHE_BUSTED_SCRIPTS` list got
  `"vttToken"` added (per that script's own comment: add a new
  `archive/js/*.js` file the day it's created) and the app was bumped to
  `v1.1.2` via `node scripts/bump-cache-version.js v1.1.2`.

## Implementation notes worth knowing

- **Cover-fit cropping.** The source portrait is scaled so its shorter
  dimension fills the 512px square, centering the overflow on the
  longer axis — matches `.portrait-img`'s own `object-fit: cover` CSS,
  so the token shows the same crop the dossier page already displays as
  "the portrait," not a surprising re-crop.
- **Border rendering trick.** Each shape's clip path is applied via
  `ctx.clip()` before `ctx.stroke()`, with `lineWidth` doubled — the
  outer half of the stroke gets clipped away, leaving a clean ring flush
  with the token's edge without needing a separate inset path per shape.
- **Border color default.** Deliberately a neutral brass/gold
  (`#d4af37`), not the entry's faction accent color. The accent color is
  only ever set as a CSS custom-property reference (`facColorVar()` in
  `render.js` returns either a resolved hex or the literal string
  `"var(--neon-cyan)"`), and a canvas `strokeStyle` can't consume
  unresolved `var()` syntax — resolving it correctly would mean reading
  `getComputedStyle` on a custom property that may itself reference
  another custom property, which browsers don't reliably resolve for
  `getPropertyValue()` on custom properties. Not worth the fragility for
  a first version; the color picker lets the user override it in two
  clicks anyway.
- **Tainted-canvas fallback, not a hard requirement.** Portraits load
  from a public Supabase Storage bucket via `getPublicUrl()`
  (`lib/fileWriter.js`), which does send permissive CORS headers today,
  but nothing in this codebase depends on that guarantee elsewhere. The
  modal loads a *fresh* `Image()` with `crossOrigin = "anonymous"` (not
  the already-rendered `<img>`, which was never given `crossOrigin` and
  would silently produce a tainted canvas). `redraw()` wraps the
  `drawVttToken()` + `canvas.toBlob()` call in try/catch — a tainted
  canvas throws a `SecurityError` synchronously on `toBlob`, caught and
  surfaced as an inline message pointing the user at "right-click → Save
  Image" instead of a silent failure or a crashed modal.
- **No portrait yet.** If `.portrait-img` isn't in the DOM, or is but
  hasn't finished loading (`naturalWidth === 0` — i.e. the entry is
  still showing `portraitActions.js`'s pending-generate/upload slot), the
  button click shows a plain `alert()` telling the user to generate or
  upload a portrait first, rather than opening an empty/broken modal.

## Verified

- `node -c archive/js/vttToken.js`, `render.js`, and
  `scripts/bump-cache-version.js` — no syntax errors.
- `npm start` boots clean (confirmed against real Supabase/Gemini env
  vars already present in this session; `STRIPE_SECRET_KEY`/
  `STRIPE_WEBHOOK_SECRET` are not set in this environment at all — a
  pre-existing gap unrelated to this change, worked around locally with
  dummy values only to confirm boot, not something this PR touches or
  fixes).
- `curl` confirmed `dossier.html` and the new `js/vttToken.js` both serve
  `200` from the running server.
- `node scripts/testPipeline.js` — still passes unchanged (this change
  doesn't touch any generation route, included as a sanity check since
  `render.js` is shared).
- Not manually exercised in a browser this session (no browser available
  in this environment) — the shape-drawing math (cover-fit scale,
  clip-then-stroke border trick) was reasoned through carefully rather
  than empirically screenshotted; worth a quick visual check next time a
  human has the app open.

## Not done / explicitly out of scope

- No "keep this portrait's likeness across regenerate" identity lock —
  that's a real Gemini imagegen-reference-image change, a bigger lift,
  and a separate flagged idea in `ACTION_ITEMS.md`.
- No server-side persistence of generated tokens — this is a pure
  download utility, nothing is written to `entries` or Storage.
- Border color doesn't default to the world's own faction accent color
  (see above) — flagged as a possible future refinement, not attempted.
