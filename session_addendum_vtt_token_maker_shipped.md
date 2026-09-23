# VTT Token Maker (combined) — shipped

**Date:** 2026-09-23 · **Version:** v1.5 · **Files:** `archive/js/tokenMaker.js` (new),
`archive/js/portraitActions.js`, `archive/js/render.js`, `archive/dossier.html`,
`scripts/bump-cache-version.js`

## Why this exists

A browser-side "crop a portrait into a VTT token" tool closes the gap against
CharGen's free Token Maker that `claude_marketing/` flagged for weeks. Because
the scheduled dev runs couldn't see each other's unmerged branches, the idea
got built **three times**:

| Build | Where | What it had |
|---|---|---|
| Original | `main`, late Aug (`portraitActions.js`) | One-click "Download as VTT Token": circle only, cover-fit, faction-accent ring, fetch-to-blob load, every portrait category |
| `claude/hopeful-rubin-fv5rv4` | Sept 11 (`tokenMaker.js`) | Modal with circle/hex/shield, **interactive pan + zoom**, ring on/off; character portraits only |
| `claude/hopeful-rubin-w83u0u` | Sept 8 (`vttToken.js`) | Modal with circle/**rounded square**/hex/shield, cover-fit only, **border color picker**, **flush ring** |

Neither branch was merged verbatim. This is new work built from all three, and
it is now the single token entry point on the dossier page.

## What was taken from where

- **Base (fv5rv4):** the modal, the pan/zoom interaction, zoom that keeps the
  frame's center fixed, and one draw routine shared by the preview and the
  512px export.
- **From w83u0u:** the Rounded Square shape, a color picker for the ring, and
  its flush-ring technique. fv5rv4 stroked the ring centered on the shape edge,
  so half of it was clipped by the canvas edge (circle) or drawn outside the
  silhouette (hex/shield). Stroking at double width inside the active clip
  keeps a full-width ring entirely inside every shape.
- **From main's original button:**
  - **Image loading.** Fetch the portrait into a same-origin `blob:` URL
    before drawing. Both branches used `crossOrigin = "anonymous"` on a fresh
    `Image`, which works while Supabase Storage sends CORS headers, but can
    still taint the canvas if a cached copy of the page's own `<img>` (loaded
    without `crossorigin`) is reused. A blob URL can't taint the canvas. The
    `toBlob()` failure path is still caught and shown to the user.
  - **Default ring color.** The entry's faction accent (`--fac-color`).
  - **Coverage.** Every category that renders a portrait. fv5rv4 limited
    itself to character portraits, which would have silently removed the
    token button from Item and Location dossiers.
  - **Wiring.** The load-then-wire logic (no button on a broken portrait) and
    the same two call sites (`render.js#renderDossier`,
    `portraitActions.js#replacePortraitSlotWithImage`). This replaces fv5rv4's
    MutationObserver.
- **New in the combination:** pan is clamped so the image always covers the
  frame (fv5rv4 let a drag leave a transparent gap inside the token), drag
  distance is scaled when the canvas is CSS-shrunk on narrow screens, Escape
  closes the modal, and the source `blob:` URL is revoked on close.

## Removed

From `portraitActions.js`: the old section `wirePortraitTokenButton` /
`addTokenDownloadButton` / `downloadPortraitAsToken`, plus its private helpers
`loadImageElement` and `slugifyForFilename`, which had no other callers. The
`.portrait-token-btn` class is reused for the new entry-point button, so the
dossier layout is unchanged.

## Verified

Headless Chromium against a harness page that loads the real `render.js` and
`tokenMaker.js`, with the portrait served from a second origin that sends CORS
headers (standing in for Supabase Storage):

- exactly one token button on the page
- all four shapes clip correctly (transparent corners, solid center)
- zoom and drag move the image, and an over-drag is clamped
- the download is a 512×512 PNG named from the entry title
- Escape closes the modal
- no horizontal overflow at 390px

Not verified: a logged-in dossier against real Supabase Storage, because
Supabase and the CDN auth script are blocked from the build sandbox.
