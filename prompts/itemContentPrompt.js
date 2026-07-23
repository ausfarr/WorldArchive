// prompts/itemContentPrompt.js
//
// Generic unique/found item generator. Replaces the Echoes-specific
// version, which hardcoded the setting name and the "no conventional
// guns / Neon atmosphere" weapon rule (dropped entirely, same call as
// enemies' Hex-Tongue — see this session's chat).
//
// The seven weaponSkill categories and their WEAPON_ROLL guide ranges
// stay fixed — they're generic combat-category names (Heavy Weapons,
// Archery, etc.), not narrative Echoes content, and
// lib/itemFormulas.js's clampDamageRange() keys off these exact strings,
// so renaming them would break the guide rather than just reskin it
// (same "skinnable mechanics, fixed keys" treatment as the six core
// attributes).
//
// Damage is two numbers (damageMin/damageMax) the model generates
// directly per weapon, grounded by the range guide below -- not derived
// from a formula. An earlier version computed a fake "critical hit"
// ceiling from a single generated roll; this replaces that with the
// model just picking a believable min/max spread itself, same way it
// already picks other flavor-grounded numbers elsewhere in this schema.

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Item Name",
  "category": "Weapon | Armor | Consumable | QuestItem",
  "rarity": "Common | Uncommon | Rare | Legendary — REQUIRED for Weapon/Armor, null for Consumable/QuestItem",
  "flavor": "1-3 sentences: what it looks like, where it might be found, any history",
  "weaponSkill": "one of: Heavy Weapons | Light Weapons | Polearm | Unarmed | Ballistics | Archery | Catalysts — Weapon category only, else null",
  "weaponType": "specific physical form, e.g. 'War Cleaver' — Weapon category only, else null",
  "damageMin": "integer — the low end of this weapon's damage range, grounded in the WEAPON_ROLL guide below for its weaponSkill category — Weapon category only, else null",
  "damageMax": "integer greater than damageMin — the high end of this weapon's damage range for this specific weapon. Should read as a believable spread, not identical to min and not absurdly larger — widen the spread for higher rarity. Weapon category only, else null",
  "relevantStat": "this world's own label for whichever attribute the item's flavor implies (heavy→BODY-equivalent, precise→REFLEX-equivalent, tech→KNOWLEDGE-equivalent — see ATTRIBUTE LABELS below) — Weapon category only, else null",
  "appliesStatus": "a status effect name, or null if none — Weapon category only",
  "effectorTier": "integer 1-4 (1=light, 4=heavy) — Armor category only, else null",
  "rarityEffect": "the bonus effect this rarity adds — REQUIRED for Uncommon+ Weapon/Armor, null for Common or non-Weapon/Armor categories",
  "apCost": "integer, almost always 1 — Consumable category only, else null",
  "effect": "plain description of what it does — Consumable category only, else null",
  "whereFoundWhyMatters": "2-3 sentences: location/context and narrative significance — QuestItem category only, else null",
  "designNotes": "1 sentence: how this avoids duplicating a named item, Legendary effect, or quest item already generated"
}`;

const WEAPON_ROLL_RANGES_TEXT = `| Weapon Skill | Example Types | WEAPON_ROLL range |
|---|---|---|
| Heavy Weapons | Axe, Sledgehammer, Maul, War Cleaver | 16-20 |
| Light Weapons | Knife, Dagger, Shiv, Box Cutter | 6-9 |
| Polearm | Spear, Staff, Pike, Halberd | 11-14 |
| Unarmed | Fists, Knuckle Wraps, Claws, Grapple Rig | 4-7 |
| Ballistics | Pistol, Rifle, and other firearms | 14-18 |
| Archery | Bow, Crossbow, Throwing Knives, Sling | 8-12 |
| Catalysts | Battery Rod, Focus Crystal, Charge Coil, Signal Wand | 9-13 |`;

function buildItemContentSystemPrompt({ settingContext, loreContext, statLabelsText, rosterContext, name, category, rarity, existingContent }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  return `You are generating an item for a tabletop/game world archive. This covers unique/found items only — NOT reproducible crafting recipes. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

SETTING (stay consistent with this — including whether/how firearms or other high-tech weapon types fit this world; some settings restrict them, some don't, follow the lore below):
${settingContext}

CATEGORIES (pick based on the user's input, or infer from context):
- Weapon: a specific, individual found/looted weapon. Gets full stats.
- Armor: defensive/utility gear. Gets Damage Reduction stats if combat-worn, or can be utility-only.
- Consumable: single-use item (Medkit, throwable, utility). ONE effect line + AP cost (usually 1) — NEVER a full stat block.
- QuestItem: narrative-only, no stats at all. Focus on where it's found and why it matters.

RARITY (Weapon/Armor only — null for Consumable/QuestItem):
- Common: ordinary scavenged item. Simple stats, no special effect.
- Uncommon: one minor bonus effect on top of base stats. Default to this if the user hasn't implied a rarity — pure Common items are rarely interesting enough to generate on request.
- Rare: a real secondary mechanical effect (reliable status application, conditional bonus, meaningful utility property).
- Legendary: a genuinely UNIQUE effect not used by any other item in the existing roster (check the roster below) — must come with a short lore note on its history/prior owner, woven into the flavor text.

WEAPON SKILL & DAMAGE RANGE (Weapon category only): every weapon needs a Weapon Skill (the category the player invests in) and a Weapon Type (the specific flavorful form — invent freely as long as it clearly maps to one skill). Pick damageMin from within that skill's canonical range below, then pick a damageMax above it that feels like a believable spread for this specific weapon (wider for higher rarity):
${WEAPON_ROLL_RANGES_TEXT}
If a concept doesn't cleanly fit any of the seven skills, pick the closest one rather than inventing an eighth.

ATTRIBUTE LABELS (this world's own names for the underlying mechanical attributes — use these, not generic terms, when writing relevantStat or any attribute reference in flavor text):
${statLabelsText}

ARMOR (Armor category only): pick an effectorTier 1 (light) to 4 (heavy) reflecting how heavy/protective the piece is.

WORLD LORE — GROUND TRUTH (stay consistent with this; don't contradict it):
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}
${regenerateBlock}
EXISTING ROSTER (avoid repeating a named item, and ESPECIALLY avoid repeating a Legendary unique effect already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the category/rarity"}
Category: ${category || "infer from context, or choose one that fills a gap in the existing roster"}
Rarity: ${rarity || "default to Uncommon for Weapon/Armor unless context implies otherwise; null for Consumable/QuestItem"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildItemContentSystemPrompt };
