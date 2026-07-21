const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Item Name",
  "category": "Weapon | Armor | Consumable | QuestItem",
  "rarity": "Common | Uncommon | Rare | Legendary — REQUIRED for Weapon/Armor, null for Consumable/QuestItem",
  "flavor": "1-3 sentences: what it looks like, where it might be found, any history",
  "weaponSkill": "one of: Heavy Weapons | Light Weapons | Polearm | Unarmed | Ballistics | Archery | Catalysts — Weapon category only, else null",
  "weaponType": "specific physical form, e.g. 'War Cleaver' — Weapon category only, else null",
  "weaponRoll": "integer within the WEAPON_ROLL range for the chosen weaponSkill (see ranges below) — Weapon category only, else null",
  "relevantStat": "BODY | REFLEX | KNOWLEDGE — whichever attribute the item's flavor implies (heavy→BODY, precise→REFLEX, tech→KNOWLEDGE) — Weapon category only, else null",
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
| Ballistics | Pistol, Rifle (Echo-Shielded ONLY — rare, flag it in flavor) | 14-18 |
| Archery | Bow, Crossbow, Throwing Knives, Sling | 8-12 |
| Catalysts | Battery Rod, Focus Crystal, Charge Coil, Signal Wand | 9-13 |`;

function buildItemContentSystemPrompt({ rosterContext, name, category, rarity }) {
  return `You are generating an item for "Echoes of the Neon," a tactical RPG set in a subterranean industrial-horror colony after a societal collapse. This covers unique/found items only — NOT reproducible crafting recipes. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

CATEGORIES (pick based on the user's input, or infer from context):
- Weapon: a specific, individual found/looted weapon. Gets full stats. Must respect the no-guns rule (low-velocity melee/thrown by default; Ballistics/guns are a rare Echo-Shielded exception — flag it explicitly in the flavor text if used).
- Armor: defensive/utility gear. Gets Damage Reduction stats if combat-worn, or can be utility-only.
- Consumable: single-use item (Medkit, throwable, utility). ONE effect line + AP cost (usually 1) — NEVER a full stat block.
- QuestItem: narrative-only, no stats at all. Focus on where it's found and why it matters.

RARITY (Weapon/Armor only — null for Consumable/QuestItem):
- Common: ordinary scavenged item. Simple stats, no special effect.
- Uncommon: one minor bonus effect on top of base stats. Default to this if the user hasn't implied a rarity — pure Common items are rarely interesting enough to generate on request.
- Rare: a real secondary mechanical effect (reliable status application, conditional bonus, meaningful utility property).
- Legendary: a genuinely UNIQUE effect not used by any other item in the existing roster (check the roster below) — must come with a short lore note on its history/prior owner, woven into the flavor text.

WEAPON SKILL & WEAPON_ROLL (Weapon category only): every weapon needs a Weapon Skill (the category the player invests in) and a Weapon Type (the specific flavorful form — invent freely as long as it clearly maps to one skill). Pick a weaponRoll integer within that skill's canonical range:
${WEAPON_ROLL_RANGES_TEXT}
If a concept doesn't cleanly fit any of the seven skills, pick the closest one rather than inventing an eighth.

ARMOR (Armor category only): pick an effectorTier 1 (light) to 4 (heavy) reflecting how heavy/protective the piece is.

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
