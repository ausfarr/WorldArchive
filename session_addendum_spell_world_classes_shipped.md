# Session addendum: spells use world classes, 5e Item crash, admin bypass

## 1. 5e Item generation crash

`routes/generateItem.js`'s 5e handler called `save5eItemEntry()` in its
Import and Homebrew/Reflavor save paths but never required it (from
`lib/rulesets/5e/itemRepo.js`). Every 5e item generation threw
`save5eItemEntry is not defined` *after* the model call. The catch block
refunded the points, but the user got nothing. Fixed by adding the import.

A sweep for the same class of bug found nothing else:
- ESLint `no-undef` over `routes/ lib/ middleware/ prompts/ server.js`
  found only these two references.
- A script checked every destructured `const { a, b } = require("./...")`
  against the module's real exports. No missing exports.

## 2. Spells attach only to existing classes

**Why it happened.** The Homebrew spell prompt's schema example was
literally `"classes": ["Wizard", "Sorcerer"]`, and the prompt never showed
the model the world's classes. `spell.classes` is a Category A link field
(`lib/entryLinkRegistry.js`), so `lib/entryLinker.js` turned each unmatched
name into a locked ghost Class placeholder. A cyberpunk world ended up with
"Wizard"/"Rogue" spells *and* empty Wizard/Rogue entries on its Classes page.

**New rule** (`lib/rulesets/5e/spellClasses.js`, used by every spell path):

| Path | World has classes | World has no classes |
|---|---|---|
| Homebrew | Model picks 1–3 from the listed classes. Code drops anything else (`filterToWorldClasses`). | Model invents one class (`newClass: {name, concept}`). It is saved as a locked placeholder with `subtitle` = concept. |
| Reflavor | Same as Homebrew. The SRD class list is only a hint about the caster type. | Same as Homebrew. |
| Import (no AI) | Keeps only SRD classes that exactly match a world class. | `[]`. No stub, because nothing can invent a fitting one. |
| Roll Randomly (procedural) | Keeps seed-table matches. If none match, picks one random world class. | `[]`. |

- Locked placeholders count as existing classes, so a stub is only ever
  invented while the world has zero classes.
- Matching uses the entry linker's `normalizeNameForMatch`, so every kept
  name is guaranteed to link rather than spawn a ghost.
- The prompt rule is split in two. The static "never default to D&D class
  names" line sits in the cacheable block. The world's own list (or the
  "invent one" instruction) goes in the dynamic block.

**Regenerate previews defer the stub (Austin's call).** A regenerate
returns a preview without writing anything, so a stub a preview invents
isn't created then. `resolveSpellClasses(..., { deferStub: true })` puts it
on the previewed spell as `pendingClassStub`. `routes/confirmEntry.js`
calls `commitPendingClassStub()` *before* linking, so the spell links to the
stub instead of spawning a ghost with no concept. That call creates the
stub and strips the field so it's never persisted. If a class was added
between preview and confirm, the "only when none exist" rule wins: no stub
is created, and its name is dropped from the spell. A rejected preview
leaves nothing behind.

**Filling the stub.** `routes/generateClass.js`'s 5e Homebrew path passes a
locked placeholder's `subtitle` into `buildHomebrewClassSystemPrompt` as
`concept`. The full class is built around the pitch the spell was written
for. Ordinary ghosts have a null subtitle, so nothing changes for them.

## 3. Fill In now keeps the placeholder's identity (5e/generic)

The Fill In button only posts `{ fillExistingId }`. The Echoes handlers
already fell back to the placeholder's name. The 5e and generic
enemy/item/class/spell handlers did not, so the model invented an unrelated
entry and saved it under the placeholder's id (e.g. a "Wizard" ghost filled
as "Neon Hacker"). Two changes fix this:
- On a locked fill with no name given, `name` defaults to the
  placeholder's name.
- After a Homebrew fill, the saved name is forced back to the
  placeholder's name, as the Echoes handlers already do, because other
  entries link to it by that name. Import and Reflavor keep their SRD-based
  names.

## 4. Smaller generation fixes

- **Spell regenerate gate.** `routes/generateSpell.js` was the only
  generate route that never called `requireSubscriptionToRegenerate`. It
  now does.
- **Reflavor refunds.** In the enemy, item, class and spell routes, the
  Reflavor "no srdLibraryId" (400) and "unknown SRD id" (404) early returns
  kept the points. They now call `req.refundGeneration()`, which is
  idempotent.

## 5. Admin bypass

`lib/adminAccess.js` already held the admin allowlist (used for admin
routes and "view as"). Admins now also bypass:
- `lib/regenerateGate.js`: regenerate without a subscription.
- `middleware/enforceGenerationCap.js`: both the text/field-assist cap and
  the image cap. Nothing is spent and no `refundGeneration` is attached.
  Every route already guards refund calls with `if (req.refundGeneration)`.
- `middleware/enforceEntryCap.js`: `checkEntryCap`/`reserveEntryCapSlot`
  take an optional `userEmail`, passed from the middleware and from
  `routes/confirmEntry.js`.
- `GET /api/billing/status` returns `{ state: "admin" }`, and Settings shows
  "Admin account — unlimited ..." instead of a quota readout that would
  never move.

Admin "view as" can't be abused through this. `req.userEmail` is always
the admin's own, and `middleware/blockAdminViewMutations.js` already rejects
every mutation made while viewing someone else's world.

To add another admin, add their email to `ADMIN_EMAILS` in
`lib/adminAccess.js`.

## Tests

`node scripts/testSpellWorldClasses.js` runs the real spell, class and item
routes against `scripts/lib/fakeSupabase.js`, with Anthropic mocked and
`BILLING_ENABLED=true`. It covers the item crash, no-classes stubs,
off-list class filtering, Import/Reflavor/procedural paths, stub Fill (name
and concept) the regenerate preview -> confirm stub flow (including a class added mid-preview), and each admin bypass. Every other `scripts/test*.js`, except
the ones that need a live DB, still passes.
