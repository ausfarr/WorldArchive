# Session addendum: Location generation's missing lore grounding (shipped)

## The bug

`routes/generateLocation.js` grounds its Location-generation prompt in a
world's saved lore the same way every other category does:

```js
const loreContext = await getLoreContext(worldId, { category: "locations", faction });
```

`lib/loreContext.js#getRelevantLoreSections` decides which `lore_sections`
rows are "relevant" to that call:

```js
return sections.filter((s) => {
  if (s.core) return true;
  const factionTags = s.faction_tags || [];
  if (factionTags.length > 0) {
    return faction ? factionTags.includes(faction) : false;
  }
  const categoryTags = s.category_tags || [];
  return category ? categoryTags.includes(category) : false;
});
```

Core sections (Overview/Geography/Peoples/Glossary -- `core: true`) are
always included, for every category, unconditionally. Everything else only
gets included if its `category_tags` array happens to contain the
requested category string.

The problem: nothing in this codebase ever wrote `"locations"` into a
non-core section's `category_tags`. There are exactly two places that
decide a section's `category_tags` at write time, and both were written
before Locations existed as a fully-fledged content category with its own
lore-grounded generator, and neither was ever revisited when it did:

1. **`lib/loreParsing.js`** -- used when a DM imports an existing lore
   document. `ALL_CATEGORIES` (the master list, also the "no keyword
   matched, default to everything" fallback) and `TOPIC_CATEGORY_MAP`
   (keyword -> which categories a section title implies) both omitted
   `"locations"` entirely.
2. **`routes/wizardLore.js`** -- used when the wizard generates a lore doc
   fresh from Step 1's draft, against a known fixed schema (so no
   keyword-guessing needed). `GENERATED_SECTION_META`'s `resources`,
   `culture`, `technologyOrSupernatural`, and `history` entries all listed
   `categoryTags` for other categories but never `"locations"`.

Net effect: a Location entry (say, "The ruins of the Old Capital," or "The
Cinder Quarter") could only ever be generated against Overview/Geography/
Peoples/Glossary lore. A DM's carefully written History section explaining
who founded a city, or a Faction/Politics section explaining who currently
controls a district, or a Culture section describing local customs, or a
Resources section describing a region's trade economy, or a
Technology/Magic section describing the setting's arcane rules -- none of
it ever reached a Location generation prompt. No error, no visible
symptom -- the generation just silently had less to work with than every
other category, for every world, since Locations shipped.

This is the same "category list drift" bug class already fixed three times
elsewhere in this codebase this cycle: `routes/export.js`'s
`VALID_CATEGORIES` (PDF export 400'd on Session Packets, silently dropped
Spells), `lib/pdfExport.js`'s `CATEGORY_ORDER` (same, for whole-world
export), `archive/js/render.js`'s `CATEGORY_TARGETS` (World Status Panel
NaN for every 5e-ruleset world), and `lib/roster.js` (Spell generation's
roster context missing the shared cost cap). Each time, a category was
added to the live app after some other hand-maintained list of categories
was written, and that list was never updated. Worth treating as a known
recurring failure mode rather than four unrelated one-off bugs -- any new
content category should be checked against every category-keyed list in
the codebase, not just the "main" ones (`routes/entries.js`'s
`VALID_CATEGORIES`, `lib/entryLinker.js`'s `ALL_CATEGORIES`), before being
considered fully wired up.

## The fix

Added `"locations"` to both lists' relevant entries:

- `lib/loreParsing.js`: `ALL_CATEGORIES` now includes `"locations"`
  (fixes the "no keyword matched" fallback, and the `core:true` topics
  that already used `ALL_CATEGORIES` directly). The five non-core topic
  entries that plausibly matter to a location description --
  resource/econom, cultur/religion, technolog/magic, histor/founding, and
  faction/politic -- each got `"locations"` added to their `categories`
  array. `peoples?/population/demograph` was deliberately left as-is
  (`["npcs", "survivors", "enemies"]`) -- population/demographic lore is
  about *who*, which fits the existing "who" categories better than a
  place description; this mirrors the same category selectivity every
  other topic entry already has (e.g. `technolog` doesn't include
  `factions`).
- `routes/wizardLore.js`: `GENERATED_SECTION_META`'s `resources`,
  `culture`, `technologyOrSupernatural`, and `history` entries each got
  `"locations"` added to their `categoryTags`. `geography`'s (core, so it
  doesn't affect filtering either way) also got it added, for display
  accuracy -- `archive/wizard-lore.html` shows a section's `category_tags`
  to the user directly (`Categories: ${...}`), so an inaccurate list there
  is a real (if minor) user-facing inconsistency, not just an internal
  detail. `peoples` was left alone, matching the loreParsing.js choice
  above for consistency between the two paths.
- `routes/wizardLore.js` now also exports `GENERATED_SECTION_META` off the
  router object (`module.exports.GENERATED_SECTION_META = ...`) purely so
  the new regression test can assert against the real object instead of
  duplicating it inline where it could silently drift again. Harmless --
  Express routers are plain functions, so attaching an extra property
  doesn't change how `server.js` mounts the route.

## What this doesn't touch

- `scripts/ingestWorldBible.js`'s own `detectCategoryTags` (a *separate*,
  Echoes-specific category-tagging function for the legacy hardcoded World
  Bible ingestion script) was checked and is unrelated -- `lib/worldBible.js`
  (the module it feeds) has zero live `require()` callers anywhere in the
  app; the per-tenant wizard/generation path this bug affects goes through
  `lib/loreContext.js` + `lib/loreRepo.js`'s `lore_sections` table
  exclusively. Not touched, since it's dead code outside this bug's scope.
- `faction_tags` filtering (the other branch of
  `getRelevantLoreSections`) is unaffected -- Locations generation doesn't
  pass a `faction`-scoped section-matching concern here beyond what
  already existed; this fix is about `category_tags` only.

## Verification

New `scripts/testLocationLoreGrounding.js` (pure-function, offline, no DB
needed): asserts `detectCategoryTagsAndCore()` tags `"locations"` for
representative History/Faction-Politics/Culture/Resources/Technology
titles (and confirms each is still correctly non-core, so the test isn't
passing by accident via a core-section false positive), asserts the
unmatched-title fallback includes `"locations"`, and asserts
`GENERATED_SECTION_META`'s four non-core entries (plus `geography` for
display accuracy) all include `"locations"`. Verified failing against the
pre-fix code (direct tag assertions fail; the `GENERATED_SECTION_META`
import crashes outright since it wasn't exported yet) and passing against
the fix. Full existing offline suite (every `scripts/test*.js` except
`testTenantIsolation.js`, which needs real Supabase credentials) still
passes unchanged. `npm start` boots cleanly with placeholder env vars.

Not touched: no UI-visible change (this is prompt-grounding data only, no
route response shape or frontend code changed), so no
`bump-cache-version.js` run needed.
