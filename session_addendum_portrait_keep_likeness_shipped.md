# Session addendum: portrait regenerate + "keep likeness" reference image

## Why

`claude_marketing/ACTION_ITEMS.md` and `COMPETITOR_WATCH.md` have been
tracking, since 2026-08-27/28/31, a real gap between Chronicled's portrait
handling and CharGen's: CharGen shipped a "Character Reference Workflow"
that locks a character's identity/likeness once and reuses it across future
generations, on top of an already-existing Token Maker and in-place editing
tools (Face Swap/Inpaint/Background Removal). Chronicled generates a
portrait per entry (`routes/generateEntryImage.js`, decoupled from entry
creation per `CLAUDE.md`) but had no equivalent: once a portrait existed,
there was literally no UI path to a new one short of deleting the Storage
object and letting the resulting 404 fall through to the "pending" slot's
Generate/Upload flow (`archive/js/portraitActions.js`'s
`handlePortraitError`). And even ignoring that gap, regenerating a portrait
at all had no way to preserve the character's established face -- every
regenerate was a from-scratch generation.

This ships the smallest slice that answers both: a real "regenerate this
portrait" affordance, plus a "keep likeness" option that reuses the
existing portrait as a Gemini reference image.

## What changed

### `lib/imagegen.js` — `referenceImage` option on `generateImage()`

Gemini's image model (`gemini-3.1-flash-image`, the "Nano Banana" family)
does image-conditioned editing when given an existing image alongside text
instructions, not just from-scratch generation from text alone. Added an
optional `referenceImage: { buffer, mimeType }` to `generateImage()`'s
options; when present, `attemptGenerateImage()` puts its `inlineData` part
in `contents[0].parts` *before* the text part (order matters — an
`inlineData` part after `cache_control`-style ordering isn't the concern
here, but Gemini's own multimodal convention is image-then-instruction).
Omitting it (every existing call site) is byte-for-byte the same
text-only request as before this change — no behavior change for NPC/enemy/
item/survivor/class/location generation, faction banners, the world mood
board, or map backdrops/anchors.

### `routes/generateEntryImage.js` — `keepLikeness` option

`POST /entries/:category/:id/generate-image` now reads an optional
`keepLikeness` boolean off the request body. When true:

1. `extractExistingPortraitUrl(entry.bodyHtml)` scrapes the entry's
   *currently rendered* portrait URL straight out of its bodyHtml, the same
   way `lib/roster.js`'s `buildEnemyRosterContext` already scrapes ability
   names out of bodyHtml rather than tracking them as a separate field —
   there's no dedicated `imageUrl` column/field anywhere; every
   `save*Entry()` writer only ever threads `imageUrl` through as a function
   parameter to build `bodyHtml`, never stores it standalone. Every
   category's `lib/*Template.js` portraitBlock renders the `<img>` in the
   same fixed attribute order (`class`, `id`, `data-category`,
   `data-entry-id`, `data-label`, `src`, `alt`), so one regex covers all
   six portrait-bearing categories. Falls back to the local
   `images/<id>.png` placeholder path when no portrait has ever been
   generated (see `saveNpcEntry` & co.'s `imageUrl || images/<id>.png`) —
   filtered out since that 404s and isn't a real image.
2. `fetchReferenceImage()` fetches those bytes. Best-effort: a reference
   image is a quality nice-to-have, not a hard requirement, so a fetch
   failure (network hiccup, the Storage object unexpectedly gone) falls
   through to a normal from-scratch generation rather than failing the
   whole regenerate.
3. If a reference image was found, the art-prompt text gets one appended
   sentence telling the model to edit the reference rather than invent a
   new face, and `generateImage()` is called with `referenceImage` set.

`keepLikeness:false`/omitted, or `keepLikeness:true` with no existing
portrait to reuse, both behave exactly as the route did before this change
— text-only generation, same as always.

Cost: no change. This doesn't add a Claude or Gemini call — it's the same
one art-prompt call + one image call as before, the reference image just
rides along inside the existing image call's payload. The one added cost is
a plain HTTP fetch of the entry's own already-generated portrait (no
external API, no cap interaction).

### `archive/js/portraitActions.js` — regenerate-with-likeness UI

Previously this file only ever handled the "portrait is MISSING" case
(`handlePortraitError`, fired by an `<img onerror=...>` when `imageUrl` was
null or the object was deleted). There was no code path at all for
regenerating a portrait that successfully rendered.

Added `initExistingPortraitControls()` (runs on `DOMContentLoaded`, and
again after `replacePortraitSlotWithImage()` swaps a pending slot back into
a real `<img>`): finds every `img.portrait-img[data-entry-id]` on the page
and wraps it in a `.portrait-wrap` div with a hover-revealed
`.portrait-regen-overlay` — a "Keep likeness" checkbox (checked by default,
since the common case for hitting this button at all is wanting a tweak,
not an unrelated new face) and a "⟳ Regenerate" button. Clicking it POSTs
to the same `/generate-image` route with `{ keepLikeness }` and swaps the
`<img src>` to the new URL with a cache-busting `?t=<timestamp>` query
param — necessary because `lib/fileWriter.js`'s `saveImage()` always
upserts the *same* Storage object path (`{worldId}/{entryId}.png`), so
without cache-busting the browser would keep showing its cached copy of the
old image at the unchanged URL.

The overlay carries the `ai-action` class, so `body.ai-disabled` (the
account-level AI toggle) and `body.admin-view-mode` both hide it the same
way they already hide every other AI-spend control
(`archive/css/style.css`'s existing `.ai-action` selector list — no new CSS
rule needed there).

### `archive/css/style.css` — `.portrait-wrap`/`.portrait-regen-*`

New rules only; nothing existing changed. `.portrait-wrap` gives the
wrapper `position: relative` so the overlay can be absolutely positioned
over the bottom of the image; the overlay itself is `opacity: 0` by default
and `opacity: 1` on `:hover`/`:focus-within` (keyboard-accessible) or while
a regenerate is in flight (`.is-busy`, added/removed by the JS so a slow
generation doesn't visually "close" if the mouse leaves the image).

### Testing

New `scripts/testKeepLikenessPortrait.js` — mocks `global.fetch` for the
Anthropic (art-prompt) and Gemini (image) calls, plus the reference-image
fetch itself (a fake `fake-storage.test` host), and drives the real
`POST /api/entries/npcs/:id/generate-image` route end to end via
`scripts/lib/fakeSupabase.js`. Three cases: `keepLikeness:true` with a real
existing portrait (asserts the Gemini request actually carried the
`inlineData` part, and that its bytes match what was fetched);
`keepLikeness:false` (asserts text-only, unchanged from before this
feature); `keepLikeness:true` with no portrait ever generated (asserts it
falls through to text-only rather than erroring).

This was the first test in the repo to exercise `lib/fileWriter.js`'s
`saveImage()` under `fakeSupabase.js` — its `storage.from(bucket)` stub
had `getPublicUrl`/`list`/`remove` but no `upload()`, so `saveImage()`
would have thrown `upload is not a function` immediately. Added a
no-op-success `upload()` stub to the shared fake (purely additive; every
other script using `fakeSupabase.js` is unaffected — verified against
`testPipeline.js`, `testEnemyPipeline.js`, `testEntryMetaPatchRace.js`,
`testCampaignStructureRaces.js`, `testEntryDriftSuggestions.js`, and
`testEntryLinker.js`, all still passing unchanged).

## Not done / explicitly out of scope this round

- No migration — no new DB field. The existing portrait URL is read out of
  `bodyHtml` on demand rather than given its own column, matching the
  existing "scrape it out of bodyHtml" pattern `lib/roster.js` already
  uses for enemy ability names.
- No changes to `enforceImageGenerationCap` — a `keepLikeness` regenerate
  still costs exactly one image-generation unit, same as any other
  portrait generation; there's no new spend category to meter separately.
- Factions and logs still have no portraits at all (unchanged, out of
  scope — see `routes/generateEntryImage.js`'s `CATEGORY_SAVE_FN`).

## Merged 2026-09-23 (v1.6), with three changes

Built 2026-09-06 on `claude/hopeful-rubin-eok7k7` (PR #82), then left unmerged
for 17 days. It was reviewed and merged during the Sept 1-21 backlog cleanup
with three changes:

- **Reference fetch restricted to this project's Storage.**
  `fetchReferenceImage()` fetches whatever portrait URL the regex finds in
  stored `bodyHtml`, which makes a server-side fetch of an arbitrary URL
  possible if a foreign `<img src>` ever got into that HTML. That can't
  happen today, because every portrait URL comes from
  `lib/fileWriter.js#getPublicUrl()`. The route now refuses anything outside
  `<SUPABASE_URL>/storage/v1/object/public/` and caps the reference at 10 MB.
  New Test 4 in `scripts/testKeepLikenessPortrait.js` checks that a
  metadata-endpoint URL is never fetched.
- **Coexists with the VTT Token Maker** (`archive/js/tokenMaker.js`, merged
  the same day). The regenerate overlay wraps the portrait in `.portrait-wrap`.
  The token button now anchors below that wrapper whichever of the two runs
  first, so it never lands inside the overlay area.
- **Token source follows a regenerate.** The token maker reads `img.src` when
  you click it, and the regenerate code sets a cache-busted `src`, so a token
  made after a regenerate uses the new portrait.
