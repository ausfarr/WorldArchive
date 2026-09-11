# Session addendum: VTT token export (shipped)

## Why

`claude_marketing/COMPETITOR_WATCH.md` and `ACTION_ITEMS.md` have flagged
the same product-side idea across several daily check-ins (2026-08-27,
2026-08-29, 2026-08-31): CharGen ships a free, no-signup "Token Maker"
that crops a generated character portrait into a circle/hex/shield VTT
token. `ACTION_ITEMS.md`'s 2026-08-29 entry called out the crop-to-token
piece specifically as "the smallest shippable slice" of that gap — pure
browser-side image processing, no AI cost, versus the harder "keep this
face on regenerate" half of the same competitor feature set (which would
need to feed a saved portrait back into the Gemini imagegen call as a
reference and is a real product decision, not a quick win).

Chronicled already generates a portrait for 6 of 8 categories (NPCs,
Enemies, Items, Survivors, Classes, Locations — see
`routes/generateEntryImage.js`'s `CATEGORY_SAVE_FN`); it just never did
anything with that art beyond displaying it. This ships the flagged
"smallest slice": a one-click circular crop + download, entirely
client-side.

## What shipped

- `archive/js/portraitActions.js` — new `wirePortraitTokenButton()`,
  `addTokenDownloadButton()`, `downloadPortraitAsToken()`,
  `loadImageElement()`, `slugifyForFilename()`. Once a dossier page's
  portrait `<img>` finishes loading successfully, a "⬇ Download as VTT
  Token" button appears right below it. Clicking it:
  1. `fetch()`s the portrait as a blob (not a direct `<img>`→canvas draw
     — the portrait is served from Supabase's public storage bucket, a
     different origin, and drawing a cross-origin `<img>` onto a canvas
     without an explicit CORS negotiation taints the canvas, so
     `toBlob()` throws a `SecurityError` even though the bucket is
     public; a same-origin `blob:` URL sidesteps that).
  2. Draws it cover-fit into a 512×512 canvas, clips to a circle, and
     strokes a ring in the entry's own `--fac-color` (the same faction
     accent variable `render.js#renderDossier` already sets on `:root`
     for the page) — a token exported from a given world visibly belongs
     to that world instead of using a generic border color.
  3. Triggers a download of the resulting PNG named
     `<entry-name-slug>-token.png`.
- `archive/js/render.js` — one new call, `wirePortraitTokenButton(entry.id)`,
  added at the end of `renderDossier()`. Deliberately wired from here
  rather than baked into each of the 13 per-category/per-ruleset
  templates that build the `portraitBlock` `<img>` tag (`lib/entryTemplate.js`,
  `lib/enemyTemplate.js`, `lib/itemTemplate.js`, `lib/survivorTemplate.js`,
  `lib/classTemplate.js`, `lib/locationTemplate.js`, and the 5e/generic
  ruleset variants of each) — every one of those already emits the same
  `<img class="portrait-img" id="portrait-img-<id>">` shape, so hooking
  the button on from the one place that already knows how to find that
  element avoids the exact kind of "forgot to update N near-duplicate
  files" bug the PDF-export category-coverage fix earlier this week ran
  into.
- Also called from `portraitActions.js#replacePortraitSlotWithImage()`
  (the Generate/Upload success path) so a freshly generated or uploaded
  portrait gets the button immediately, no page reload needed.
- `archive/css/style.css` — `.portrait-token-btn`, styled to match the
  existing `.portrait-action-btn` look (uses `--fac-color` on hover, same
  as the Generate/Upload buttons).
- Version bump: `node scripts/bump-cache-version.js v1.2` (UI-affecting).

## What this deliberately does NOT do

- No hex/shield shape options, no upload-your-own-frame — CharGen's
  Token Maker has several; this ships the one shape (circle) that covers
  the overwhelming majority of VTT use. Easy to extend later if it turns
  out to matter.
- No "lock this likeness across a regenerate" — the harder half of the
  competitor gap flagged in `ACTION_ITEMS.md`, needs a real design
  decision (feeding a saved portrait back into `lib/imagegen.js`'s
  Gemini call as a reference) and its own generation-cost/cap
  implications. Left as a future idea, not started here.
- No server route, no new DB column, no migration — this is a pure
  read-and-transform of an image the app already serves publicly; there
  was nothing to persist.

## Testing

- `node scripts/testPipeline.js` / `testEnemyPipeline.js` — both still
  pass unchanged; confirms the `portrait-img` markup this feature
  depends on (`data-entry-id`, `id="portrait-img-<id>"`) is unaffected.
- `node --check` on both edited JS files.
- `npm start` (with dummy env vars) — boots cleanly, no crash.
- Not verified in an actual browser this session (no browser access to
  a live Supabase-backed world in this environment) — the CORS/canvas
  claim above (Supabase public storage buckets serve permissive CORS
  headers) is standard, documented Supabase behavior, not independently
  re-verified against this project's actual bucket. Worth a real
  click-through on the next session that has a live world to check
  against, especially the cross-origin fetch path.
