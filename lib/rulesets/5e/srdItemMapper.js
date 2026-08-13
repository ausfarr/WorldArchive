// lib/rulesets/5e/srdItemMapper.js
//
// R5 Phase 5: converts a srd_library row's raw ingested data_json (see
// scripts/ingestSrd5eFull.js's parseWeapons/parseArmor/parseAdventuringGear/
// parseTools -- four different subtypes sharing srd_library.category =
// 'items', distinguished by data_json.itemType) into the shape
// lib/rulesets/5e/itemTemplate.js already expects for `resolvedStats` --
// the exact structure routes/generateItem.js's existing
// resolveItemStats()/lookupWeapon()/lookupArmor() produce from
// itemFormulas.js's hand-typed tables. Same role as
// lib/rulesets/5e/srdMonsterMapper.js plays for Bestiary Import/Reflavor.

function parseCostToGp(text) {
  if (!text || /varies/i.test(text) || text.trim() === "—") return null;
  const m = String(text).match(/([\d.,]+)\s*(CP|SP|EP|GP|PP)/i);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, ""));
  const unit = m[2].toUpperCase();
  const toGp = { CP: 0.01, SP: 0.1, EP: 0.5, GP: 1, PP: 10 };
  return Number.isFinite(amount) ? amount * toGp[unit] : null;
}

function parseWeightToLb(text) {
  if (!text || /varies/i.test(text) || text.trim() === "—") return null;
  const m = String(text).match(/([\d.\/]+)\s*lb/i);
  if (!m) return null;
  if (m[1].includes("/")) {
    const [num, den] = m[1].split("/").map(Number);
    return den ? num / den : null;
  }
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// "1d8 Slashing" -> { damageDice: "1d8", damageType: "slashing" }
function parseDamage(text) {
  const m = String(text || "").match(/^([\dd+]+)\s+(\w+)/i);
  if (!m) return { damageDice: text || null, damageType: null };
  return { damageDice: m[1], damageType: m[2].toLowerCase() };
}

// "16" -> {baseAc:16, dexBonus:'none'} | "11 + Dex modifier" -> {baseAc:11,
// dexBonus:'full'} | "12 + Dex modifier (max 2)" -> {baseAc:12,
// dexBonus:'max2'} | "+2" (Shield's AC column) -> {baseAc:2, dexBonus:'none'}
function parseArmorClass(text) {
  const raw = String(text || "").trim();
  const numMatch = raw.match(/(\d+)/);
  const baseAc = numMatch ? Number(numMatch[1]) : null;
  let dexBonus = "none";
  if (/dex modifier/i.test(raw)) {
    dexBonus = /max 2/i.test(raw) ? "max2" : "full";
  }
  return { baseAc, dexBonus };
}

function parseStrengthRequirement(text) {
  const m = String(text || "").match(/Str\s+(\d+)/i);
  return m ? Number(m[1]) : 0;
}

// Weapons/Armor tables' Properties column has no top-level commas inside
// parens (e.g. "Ammunition (Range 80/320; Arrow), Two-Handed" uses a
// semicolon inside the parenthetical), so a plain comma split is safe here
// -- unlike magic item type descriptors, which scripts/ingestSrd5eFull.js
// handles separately with a paren-aware splitter.
function parsePropertiesList(text) {
  if (!text || text.trim() === "—") return [];
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

function mapSrdItemMechanics(dataJson) {
  const itemType = dataJson.itemType;

  if (itemType === "weapon") {
    const { damageDice, damageType } = parseDamage(dataJson.damage);
    return {
      itemType,
      resolvedStats: {
        damageDice,
        damageType,
        category: dataJson.category || null,
        properties: parsePropertiesList(dataJson.properties)
      },
      valueGp: parseCostToGp(dataJson.cost),
      weightLb: parseWeightToLb(dataJson.weight),
      description: dataJson.mastery && dataJson.mastery !== "—" ? `Weapon Mastery: ${dataJson.mastery}.` : null
    };
  }

  if (itemType === "armor") {
    const { baseAc, dexBonus } = parseArmorClass(dataJson.armorClass);
    return {
      itemType,
      resolvedStats: {
        baseAc,
        dexBonus,
        strengthMin: parseStrengthRequirement(dataJson.strength),
        stealthDisadvantage: dataJson.stealth === "Disadvantage",
        category: dataJson.category || null
      },
      valueGp: parseCostToGp(dataJson.cost),
      weightLb: parseWeightToLb(dataJson.weight),
      description: null
    };
  }

  // gear / tool -- itemTemplate.js's resolvedStatsBlock() has no branch
  // for these itemTypes (same as it already has none for Echoes-only
  // types like 'potion'/'wondrous'), so resolvedStats stays null and the
  // item card just shows Value/Weight/Description, which is all real
  // mundane gear/tools have anyway.
  const toolFields = [
    dataJson.ability ? `Ability: ${dataJson.ability}.` : null,
    dataJson.utilize ? `Utilize: ${dataJson.utilize}.` : null,
    dataJson.craft ? `Craft: ${dataJson.craft}.` : null,
    dataJson.variants ? `Variants: ${dataJson.variants}.` : null
  ].filter(Boolean).join(" ");

  return {
    itemType,
    resolvedStats: null,
    valueGp: parseCostToGp(dataJson.cost),
    weightLb: parseWeightToLb(dataJson.weight),
    description: dataJson.description || toolFields || null
  };
}

module.exports = { mapSrdItemMechanics, parseCostToGp, parseWeightToLb };
