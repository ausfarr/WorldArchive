# Procedural (Table-Driven) Generation — Scoping Proposal

**Status: proposal for review. No code changes included. Read-only investigation.**

This document scopes a possible third entry-creation path — procedural/non-AI
generation via weighted random tables and templating — alongside the existing
"Generate with AI" and "Create Manually" paths. Zero API cost, zero LLM
involvement, instant.

---

## 0. Correction to the brief's premises

The task brief cited two "existing precedents" to study. Both turned out not
to exist the way they were described, which changes what this proposal can
honestly point to as prior art. Flagging this up front rather than quietly
building the proposal on a false foundation:

**The Survivor "personality quirk" is not a table, and is not mechanical.**
It was renamed `bond` and deliberately reworked to be pure narrative flavor.
`prompts/survivorContentPrompt.js:53-57` defines its schema as
`{ name, effect, flavorLine }`, and the accompanying instruction
(`prompts/survivorContentPrompt.js:77`) is explicit:

> "BOND: exactly one per PC — a roleplay hook or narrative complication for
> the GM... NOT a mechanical stat modifier. This character's real mechanics
> live in their class and attributes; the Bond is flavor with table-usable
> weight, not a numeric bonus/penalty."

There is no array/JSON list of quirks anywhere in the repo — it's generated
freeform, inline, by the same Claude call that produces the rest of the
survivor. (Side finding, not in scope to fix here: `lib/fieldAssistFields.js:113-115`
and `archive/js/render.js:799-801` still carry stale "Darkest-Dungeon
mechanical quirk" hint text from before this rework — a real drift bug worth
a follow-up cleanup ticket.)

**The Base + Effector + Binder crafting system is not part of this
application.** It exists only as a separate Claude Code *skill*
(`echoes-crafting-generator`), living entirely outside the `worldarchive`
repo as prompt-only markdown instructions for an AI to follow, with no JSON
schema, no component table enforced by any validator, and no executable
damage formula. The app's own item prompt explicitly disclaims it —
`prompts/itemContentPrompt.js:3-6`: "Generic unique/found item generator...
NOT reproducible crafting recipes."

**What the app actually has, and what this proposal uses as its real
precedent instead**, is smaller but more useful: two pure, deterministic
formula functions that already run independent of any AI call, already
produce numbers that render identically regardless of how an entry's prose
was authored, and already ship in production:

- `lib/statFormulas.js`'s `computeDerivedStats(attributes, tier)` — given
  raw `{body, reflex, knowledge, presence, sanity, fate}` ints and a tier,
  computes `maxHealth = round(body*2 + sanity*2 + BASE)`, `maxEnergy`,
  `dodgeChance`, `critChance`, `accuracy`, `moveSpeed` (`lib/statFormulas.js:25-46`,
  `BASE = 10`). Zero dependency on narrative content.
- `lib/itemFormulas.js`'s `WEAPON_ROLL_RANGES` — a genuine fixed table, 7
  canonical weapon-skill keys ("Heavy Weapons", "Light Weapons", "Polearm",
  "Unarmed", "Ballistics", "Archery", "Catalysts") each mapped to a
  `[min, max]` damage range (`lib/itemFormulas.js:3-11`) — plus
  `computeArmorDR(effectorTier) = effectorTier*5 + BASE/2`
  (`lib/itemFormulas.js:13-19`) and `clampDamageRange()`, which sanity-clamps
  a weapon's damage into its skill's canonical range
  (`lib/itemFormulas.js:27-38`). This is real, running code, consumed today
  by `lib/itemTemplate.js:26-67`'s `buildItemBodyHtml` to render the Stats
  table on every Weapon/Armor item, AI-generated or not.

These two modules are the actual template to imitate: small pure functions
and small fixed tables, decoupled from prose, already proven to slot into
the existing render/write pipeline.

---

## 1. What the write path requires (why a third path is cheap to bolt on)

Confirmed by reading `lib/entriesRepo.js`, `routes/confirmEntry.js`, and
`archive/js/render.js`:

- The `entries` table is generic: `world_id, category, entry_id, name,
  subtitle, faction, tags_json, body_html, raw_json, locked, created_at,
  updated_at` (`lib/entriesRepo.js:9-19`). `raw_json` is canonical; the rest
  are query-convenience mirrors written by `upsertEntry()`
  (`lib/entriesRepo.js:52-72`).
- `POST /api/confirm-entry` (`routes/confirmEntry.js`) is **already the
  single shared write path** for AI-confirm, AI-regenerate-confirm, edits,
  *and* Manual Mode creation — dispatched through a `WRITERS` map keyed by
  category, with Factions getting special-cased Roundup/relationship-sync
  logic. Nothing else about the route is category-specific.
- The minimum contract a zero-AI-call entry must satisfy is `{id, category,
  raw: {id, name}}`, plus `raw.factionKey` for Factions and
  `raw.createdManually` for Locations (`archive/js/render.js`'s
  `buildBlankEntryStub`). Every `build*BodyHtml` function does
  `field || fallback` throughout — there is no server-side per-field schema
  validator to satisfy beyond that.

**Implication:** a procedural generator does not need a new route, a new DB
column, or any dossier/render/edit UI changes. It only needs to build a
`raw` object with the same field names each category's existing template
already expects, and POST it through the existing `/api/confirm-entry`
endpoint — indistinguishable, at the storage and rendering layer, from a
hand-typed Manual Mode entry.

---

## 2. Per-category viability

Field breakdowns verified directly against each `lib/*Template.js` file.

| Category | Template file | Prose share | Verdict | Table-viable fields | Must stay AI/manual |
|---|---|---|---|---|---|
| **Items** | `lib/itemTemplate.js` | ~30-40% (Weapon/Armor/Consumable); QuestItem is prose-only | **Strong fit** | `category`, `weaponSkill`/`weaponType`, `damageMin`/`damageMax` (already formula-clamped), `effectorTier`→DR (already formula-computed), `rarity`, `appliesStatus`, `rarityEffect` (pool-selected per rarity), short `flavor` (template+pool) | `whereFoundWhyMatters` (QuestItem), Legendary-tier uniqueness lore |
| **Bestiary/Enemies** | `lib/enemyTemplate.js` | ~35-40% | **Strong fit** | `tier` enum, 6 raw attributes (budget-rolled per `TIER_BUDGET`, formula-derived stats already exist), `abilities[].{name,kind}` (pool-selected), `combatNotes` short phrases (pool) | ability `.flavor`/`.effect`/`.scaling` prose, `phaseChange.description`, `designNotes` |
| **Classes** | `lib/classTemplate.js` | ~30-35% | **Strong fit, but low volume** | `archetype`, `primaryAttribute`/`secondaryAttribute`, `coreResourceName`, tier titles/themes (pool), leveled ability names+kinds (pool) | ability `.effectText`, `whyItWorks[]` paragraphs, `capstoneQuote` — and only a handful of classes exist per world, so authoring depth matters more than breadth here |
| **Survivors** | `lib/survivorTemplate.js` | ~40-50% | **Partial fit** | `name`/`callsign` (pool), `className` (pick from world's classes), 6 attributes (budget-rolled, same shape as Enemies but `computeDerivedStats` is never called for Survivors today — a pre-existing gap, not something to fix in this scope), `personality.trait` (pool) | `backstory`, `personality.{contradiction,wants,actuallyNeeds}`, `bond.*` — these are the character, not filler |
| **NPCs** | `lib/entryTemplate.js` | ~60-65% | **Partial fit** | `traits[]` (pool), `speech.{register,rhythm,tic,neverSay}` (pool), `roleArchetype`, `age` | `physicalDescription`, `contradiction`, `wants`/`actuallyNeeds`, `questHook`, full `dialogue` tree — an NPC without these reads as a name tag, not a character |
| **Locations** | `lib/locationTemplate.js` | ~50-55% | **Partial fit** | `regionBiome` (pool), `dangerTags[]` (pool) | `descriptorLine`, `notableFeatures`, `hooksSecrets` — a location's whole value is what's actually there |
| **Logs** | `lib/logTemplate.js` | ~80-90% | **Poor fit** | `logType` enum, `characters` list (pool from roster), `locationContext` | `bodyText` — this field *is* the entry; a procedurally-templated found-text log reads as obviously fake in a way a table-rolled item stat block does not |
| **Factions** | `lib/factionTemplate.js` | ~90% | **Poor fit** | none meaningfully | Everything — 10 prose fields (origin, philosophy, hierarchy, territory, goals, tensions, iconography, economy), no numeric stats at all, and only 4-5 factions exist per world total. Procedural generation has no real job to do here. |

Honest summary: procedural generation is a genuinely good fit for
**Items and Enemies** (both already have formula-consuming numeric fields
in production), a workable **partial** fit for Classes, Survivors, NPCs, and
Locations (proceduralize the structured skeleton, leave prose fields for a
follow-up manual edit or an AI field-assist call), and a **poor fit** for
Logs and Factions, which should not get a procedural mode in v1 — forcing
one would just produce recognizably hollow entries.

---

## 3. Proposed architecture

### 3.1 New module

`lib/proceduralGenerators.js` — a single dispatcher,
`generateProcedurally(worldId, category, opts)`, mirroring the *shape* of
the existing `routes/generateX.js` handlers (reads world context, returns an
entry-shaped object) but with no `fetch`/Claude call anywhere in it. One
function per category internally (`generateItemProcedurally`,
`generateEnemyProcedurally`, etc.), each returning the same `raw` object
shape its category's `build*BodyHtml`/`WRITERS` entry already expects.

Not per-category files: the actual selection/weighting/templating logic is
small and shared (weighted-pick, pool-filter-by-tag, template-string
substitution) — one file with clearly separated per-category sections keeps
that shared logic from being duplicated 8 times, consistent with how
`lib/entriesRepo.js` centralizes the generic CRUD other files build on top
of instead of each category rolling its own Supabase calls.

### 3.2 Table storage: JSON data files, not in-code arrays

New `data/proceduralTables/<category>.json` per category (e.g.
`data/proceduralTables/items.json`). Rationale:

- This is **authored content**, not logic — same category of thing as
  `lore/world_bible_sections.json` (already a JSON data file in this repo,
  not inlined in a `.js` file), not like `WEAPON_ROLL_RANGES` (a small fixed
  mechanical constant that legitimately belongs in code because
  `clampDamageRange()` depends on its exact keys).
  `lib/proceduralGenerators.js` only holds selection/weighting logic and
  `require()`s the JSON tables — same separation this codebase already uses
  between `prompts/` (what to ask) and `lib/` (how to build/store).
- Easy to grow without touching JS, and it keeps the diff for "add 20 more
  weapon flavor rows" reviewable as a pure data change.

### 3.3 Table format

Weighted-entry arrays per field-slot:

```json
{
  "value": "Rebar Maul",
  "weight": 3,
  "tags": ["heavy", "improvised"]
}
```

`tags` allow conditional pools — e.g. only surface certain flavor lines when
the roll already picked a `Ferro-Kings`-flavored Base — the same lightweight
grounding idea `lib/worldFlavor.js` uses to filter faction-aware prompt
content, just done via array filtering instead of prompt text. Name/flavor
assembly uses simple `{slot}` placeholder template strings with pool
substitution — no new templating library/dependency.

### 3.4 Output & integration

- Build the same `raw` shape the category's existing `build*BodyHtml`
  already reads.
- POST it through the **existing** `/api/confirm-entry` route — no new write
  path, no new DB column, no dossier/edit-UI changes, since output is
  structurally identical to a Manual Mode entry.
- Frontend: a third button ("Generate Procedurally" or similar) next to
  "Generate with AI" / "Create Manually" on each supported category's
  generate flow. Not added to Factions or Logs per §2.
- For **Partial-fit** categories, the generated entry ships with its
  structured fields filled and its prose fields left as short placeholder
  text (or empty, prompting the user toward the existing per-field "Help me"
  AI-assist already built for Manual Mode, `routes/fieldAssist.js`) — this
  reuses an existing feature rather than inventing a new hybrid-generation
  mode.

---

## 4. Sample table: Items

Items chosen over NPCs — it has real running formula code
(`lib/itemFormulas.js`) to build against today, where NPCs have no numeric
precedent at all. 18 rows below, spanning all 7 `weaponSkill` keys plus
Armor and Consumable, in the JSON-table shape from §3.3. This is a *content*
table, meant to be handed to a world's own flavor pass (renaming
`weaponType`/`flavor` to match setting) — the `weaponSkill` keys and damage
ranges are fixed system constants per `lib/itemFormulas.js` and must stay
exactly as shown.

```json
[
  { "weaponSkill": "Heavy Weapons", "weaponType": "Rebar Maul", "flavorTemplate": "A length of construction rebar bent into a crude head, {condition}.", "rarityWeights": { "Common": 5, "Uncommon": 3, "Rare": 1 } },
  { "weaponSkill": "Heavy Weapons", "weaponType": "Fire-Axe", "flavorTemplate": "A firefighter's axe, {condition}, still bearing a faded department decal.", "rarityWeights": { "Common": 4, "Uncommon": 4, "Rare": 1 } },
  { "weaponSkill": "Heavy Weapons", "weaponType": "Sledge Warhammer", "flavorTemplate": "A demolition sledgehammer re-gripped for combat, head {condition}.", "rarityWeights": { "Common": 3, "Uncommon": 3, "Rare": 2, "Legendary": 1 } },
  { "weaponSkill": "Light Weapons", "weaponType": "Box Cutter", "flavorTemplate": "A retractable-blade utility knife, {condition}, kept honed out of habit.", "rarityWeights": { "Common": 6, "Uncommon": 2 } },
  { "weaponSkill": "Light Weapons", "weaponType": "Kitchen Cleaver", "flavorTemplate": "A cook's cleaver, {condition}, still smelling faintly of the last kitchen it left.", "rarityWeights": { "Common": 5, "Uncommon": 3, "Rare": 1 } },
  { "weaponSkill": "Light Weapons", "weaponType": "Shiv", "flavorTemplate": "A sharpened length of scrap wrapped in tape for grip, {condition}.", "rarityWeights": { "Common": 6, "Uncommon": 2 } },
  { "weaponSkill": "Polearm", "weaponType": "Rebar Spear", "flavorTemplate": "Rebar lashed to a mop handle, {condition}, point filed narrow.", "rarityWeights": { "Common": 5, "Uncommon": 3, "Rare": 1 } },
  { "weaponSkill": "Polearm", "weaponType": "Riot Baton (extended)", "flavorTemplate": "A collapsible riot baton wired to stay locked open, {condition}.", "rarityWeights": { "Common": 3, "Uncommon": 4, "Rare": 2 } },
  { "weaponSkill": "Unarmed", "weaponType": "Knuckle Wraps", "flavorTemplate": "Hand-wrapped cloth reinforced with washers, {condition}.", "rarityWeights": { "Common": 6, "Uncommon": 2 } },
  { "weaponSkill": "Unarmed", "weaponType": "Grapple Rig", "flavorTemplate": "A harness-mounted grapple claw, {condition}, meant for climbing before it was repurposed.", "rarityWeights": { "Common": 3, "Uncommon": 3, "Rare": 2 } },
  { "weaponSkill": "Ballistics", "weaponType": "Break-Action Pistol", "flavorTemplate": "A single-shot pistol salvaged from a display case, {condition}.", "rarityWeights": { "Common": 5, "Uncommon": 3, "Rare": 1 } },
  { "weaponSkill": "Ballistics", "weaponType": "Sawn-Down Rifle", "flavorTemplate": "A hunting rifle with the stock cut down for close quarters, {condition}.", "rarityWeights": { "Common": 3, "Uncommon": 4, "Rare": 2, "Legendary": 1 } },
  { "weaponSkill": "Archery", "weaponType": "Recurve Bow", "flavorTemplate": "A recurve bow strung with braided cable, {condition}.", "rarityWeights": { "Common": 5, "Uncommon": 3, "Rare": 1 } },
  { "weaponSkill": "Archery", "weaponType": "Pipe Crossbow", "flavorTemplate": "A crossbow built from plumbing pipe and a car-door spring, {condition}.", "rarityWeights": { "Common": 4, "Uncommon": 4, "Rare": 1 } },
  { "weaponSkill": "Catalysts", "weaponType": "Charge Coil", "flavorTemplate": "A hand-wound induction coil, {condition}, that hums when gripped.", "rarityWeights": { "Common": 3, "Uncommon": 4, "Rare": 2, "Legendary": 1 } },
  { "weaponSkill": "Catalysts", "weaponType": "Signal Wand", "flavorTemplate": "A repurposed antenna rig, {condition}, tuned to something that isn't radio.", "rarityWeights": { "Common": 3, "Uncommon": 3, "Rare": 2 } },
  { "armorSlot": "Body", "weaponType": "Padded Undersuit", "effectorTierRange": [1, 2], "flavorTemplate": "A quilted undersuit, {condition}, worn as a base layer under heavier gear.", "rarityWeights": { "Common": 5, "Uncommon": 3, "Rare": 1 } },
  { "armorSlot": "Body", "weaponType": "Riot Vest", "effectorTierRange": [3, 4], "flavorTemplate": "A police-issue riot vest, {condition}, plates visibly reinforced with scrap.", "rarityWeights": { "Common": 3, "Uncommon": 4, "Rare": 2, "Legendary": 1 } }
]
```

Supporting shared pools (not repeated per row above — pulled by the
generator at roll time):

```json
{
  "condition": [
    { "value": "still holding its edge", "weight": 3 },
    { "value": "pitted with rust along the spine", "weight": 3 },
    { "value": "wrapped in fresh tape at the grip", "weight": 2 },
    { "value": "scarred from a fight it clearly lost once", "weight": 2 },
    { "value": "unnervingly well-maintained for something scavenged", "weight": 1 }
  ],
  "appliesStatus": [
    { "value": null, "weight": 6 },
    { "value": "Bleed", "weight": 2 },
    { "value": "Stun", "weight": 1 },
    { "value": "Slow", "weight": 1 }
  ],
  "rarityEffect_Uncommon": [
    { "value": "Deals +1 damage against the Bleed status.", "weight": 1 },
    { "value": "Grants +5% accuracy on the first attack each combat.", "weight": 1 }
  ]
}
```

`damageMin`/`damageMax` are not authored per row — they're rolled from the
row's `weaponSkill` key straight through the existing
`WEAPON_ROLL_RANGES`/`clampDamageRange()` in `lib/itemFormulas.js`, and
`effectorTier` picks within `effectorTierRange` for armor rows, feeding the
existing `computeArmorDR()`. This is the concrete point where the new
procedural module hands off to code that already exists and is already
proven correct — no new formula to invent for Items.

---

## 5. Content-authoring burden & repetition thresholds

Honest estimate of table depth needed before a 20+-entry roster in one world
starts feeling repetitive to its player:

- **Items** — needs the deepest pool. With ~18 `weaponType` rows like §4
  plus a ~5-entry `condition` pool and a handful of `rarityEffect` variants
  per rarity tier, combinatorics give a lot of surface variety, but flavor
  *phrasing* repeats fast if the `condition` pool stays this small — by
  entry #15-20 a user will start noticing "still holding its edge" appear
  twice. Realistic floor before repetition stops being noticeable: **~40-60
  weaponType rows and ~15-20 condition/flavor snippets**, roughly 3x what's
  drafted above.
- **Enemies** — similar pressure to Items, plus ability-name/effect pools
  per role/tier. Same rough floor, ~40-60 rows split across `abilities[]`
  name pools and `combatNotes` phrase pools, because unlike Items, two
  enemies with an identical ability *and* identical flavor phrase in the
  same roster reads as a bug, not a coincidence.
- **Classes** — low *volume* pressure (a world typically has a handful of
  classes total, not 20+), but high *depth* pressure per class: each class
  needs a full 4-tier leveled-ability table, and there's no shortcut —
  authoring one credible procedural class table is closer in effort to
  authoring one full class by hand than it is to adding a few rows to an
  Item pool.
- **Survivors / NPCs** — cheap breadth-wise (trait/speech-tic pools are easy
  to write many of), but the failure mode is sharper: the moment two
  Survivors in the same roster share a rolled `class` + `personality.trait`
  combination, it reads as an obvious duplicate in a way a repeated item
  flavor line doesn't, because these are named individual characters, not
  loot. Two options worth flagging rather than deciding here: (a) weight
  rolls against roster overlap, mirroring the duplicate-avoidance
  `lib/roster.js` already does for AI generation, or (b) scope procedural
  Survivors/NPCs to background/filler roster entries only, not named
  quest-relevant characters — which is arguably the more honest use of a
  non-AI path anyway.
- **Locations** — moderate; `regionBiome` and `dangerTags[]` pools are cheap
  to write ~20-30 deep, and because Locations are typically fewer per world
  than Items/Enemies, repetition pressure is lower.

Net: **Items and Enemies are where the real authoring investment has to go**
if procedural mode is meant to be used for volume (20+ entries in a single
world); Classes is expensive per-unit but low-volume; Survivors/NPCs/
Locations are cheap to stand up but need an explicit decision about whether
procedural mode targets background filler or named characters, since the
tables that make cheap filler diverse are not the same tables that make a
named character feel intentional.
