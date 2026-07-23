# Image generation — round 2 fix + real error visibility

Extract into repo root, overwriting existing files at these paths:

```
lib/imagegen.js
lib/categoryPageTemplate.js
routes/generate.js
routes/generateEnemy.js
routes/generateSurvivor.js
archive/npcs/index.html
archive/enemies/index.html
archive/survivors/index.html
```

## What changed

1. **`lib/imagegen.js`**: switched from the older `?key=API_KEY` query-param
   auth style to the `x-goog-api-key` header — every current Google example
   I could find (dated within the last few weeks) uses the header method.
   This is an educated fix, not a confirmed diagnosis — see #2.

2. **The real fix, honestly**: the previous round's fix (responseModalities)
   was a guess that clearly wasn't the whole story, since it's still
   failing. Rather than guess a third time, every route that generates
   art (NPCs, enemies, survivors) now returns the ACTUAL error message
   from the Gemini API directly in the response (`imageError` field) and
   displays it in the status text on the page for ~6 seconds before
   reloading, instead of only logging it to Railway's server console
   (which requires digging through logs to see).

## After deploying: generate one NPC and read the actual error

Whatever shows up after "— portrait failed: ..." is the real, specific
reason (bad API key, wrong permissions, quota exceeded, model not
enabled for your key, safety filter, etc.) — send that back and I can
fix the *actual* problem instead of guessing at Google's API surface
from search results. This also means from now on, any future image
failures are visible to you directly without needing Railway log access
at all.
