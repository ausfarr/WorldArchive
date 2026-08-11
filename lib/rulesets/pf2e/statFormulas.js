// lib/rulesets/pf2e/statFormulas.js
//
// Real Pathfinder 2e (Remaster) math: the GM Core's "Building Creatures"
// budget tables (level -1 through 24, four tiers -- Extreme/High/
// Moderate/Low, plus Terrible/Abysmal for a couple of categories) for
// Armor Class, Hit Points, Perception/Saving Throws, Strike attack
// bonus, Strike damage dice, Skill bonus, Spellcasting DC/attack, and
// Area Damage dice.
//
// UNLIKE 5e's Challenge Rating (see lib/rulesets/5e/statFormulas.js),
// this is NOT a reverse-engineering formula that estimates a level from
// proposed stats -- PF2e's own design method is the opposite direction
// and much more mechanically confident: you pick a target LEVEL and a
// TIER per category, and the table gives you the exact number to use.
// There's no "estimate, then guess how close it is" step the way 5e's CR
// math requires -- see buildCreatureBudget() below. This makes PF2e's
// Homebrew tier arguably MORE deterministic than 5e's, once a level is
// chosen.
//
// DATA PROVENANCE: the four BUDGET tables below were extracted
// PROGRAMMATICALLY (not hand-transcribed, to eliminate transcription
// error) from github.com/miki4920/pf2e-monster-maker's src/Values.ts --
// an MIT-licensed Foundry VTT module that implements "the tables
// provided in [PF2e's] core rules" (its own README's description).
// Legal basis for using this without an ORC-license concern: these are
// game-balance/mechanical threshold numbers, not literary rules text --
// the same category of content as the 5e DMG's CR table this project
// already uses via an equivalent MIT-licensed reference (see
// lib/rulesets/5e/statFormulas.js's header comment for the identical
// reasoning). This does NOT license any actual monster stat block
// content (names, flavor, specific creature numbers) -- see
// SESSION_LOG.md's PF2e research entry for why Import/Reflavor stay
// blocked while this unblocks Homebrew-tier generation specifically.
//
// VERIFICATION CAVEAT (documented honestly, matching this project's
// "test before you trust" standard): unlike the 5e CR table, a second
// independent PF2e data source could not be reached from this sandboxed
// environment to cross-check every value (paizo.com, aonprd.com, and
// several community PF2e tool sites are all blocked by this build
// environment's network egress policy -- see SESSION_LOG.md). Confidence
// here rests on: (1) the table's internal consistency (monotonically
// increasing across all 26 levels, every category, no anomalies of the
// kind that caught the 5e reference's CR-25 bug), (2) the source
// project's explicit, specific claim to implement "the tables provided
// in core rules," and (3) spot-checks against this author's general
// PF2e knowledge (e.g., a Level 1 Moderate creature having ~20 HP and
// AC 15 matches). Austin should spot-check a few rows against his own
// GM Core before trusting this for real published content.

const ARMOR_CLASS = {"0":{"extreme":19,"high":16,"moderate":15,"low":13},"1":{"extreme":19,"high":16,"moderate":15,"low":13},"2":{"extreme":21,"high":18,"moderate":17,"low":15},"3":{"extreme":22,"high":19,"moderate":18,"low":16},"4":{"extreme":24,"high":21,"moderate":20,"low":18},"5":{"extreme":25,"high":22,"moderate":21,"low":19},"6":{"extreme":27,"high":24,"moderate":23,"low":21},"7":{"extreme":28,"high":25,"moderate":24,"low":22},"8":{"extreme":30,"high":27,"moderate":26,"low":24},"9":{"extreme":31,"high":28,"moderate":27,"low":25},"10":{"extreme":33,"high":30,"moderate":29,"low":27},"11":{"extreme":34,"high":31,"moderate":30,"low":28},"12":{"extreme":36,"high":33,"moderate":32,"low":30},"13":{"extreme":37,"high":34,"moderate":33,"low":31},"14":{"extreme":39,"high":36,"moderate":35,"low":33},"15":{"extreme":40,"high":37,"moderate":36,"low":34},"16":{"extreme":42,"high":39,"moderate":38,"low":36},"17":{"extreme":43,"high":40,"moderate":39,"low":37},"18":{"extreme":45,"high":42,"moderate":41,"low":39},"19":{"extreme":46,"high":43,"moderate":42,"low":40},"20":{"extreme":48,"high":45,"moderate":44,"low":42},"21":{"extreme":49,"high":46,"moderate":45,"low":43},"22":{"extreme":51,"high":48,"moderate":47,"low":45},"23":{"extreme":52,"high":49,"moderate":48,"low":46},"24":{"extreme":54,"high":51,"moderate":50,"low":48},"-1":{"extreme":18,"high":15,"moderate":14,"low":12}};
const HIT_POINTS = {"0":{"high":18,"moderate":15,"low":12},"1":{"high":25,"moderate":20,"low":15},"2":{"high":38,"moderate":30,"low":23},"3":{"high":56,"moderate":45,"low":34},"4":{"high":75,"moderate":60,"low":45},"5":{"high":94,"moderate":75,"low":56},"6":{"high":119,"moderate":95,"low":71},"7":{"high":144,"moderate":115,"low":86},"8":{"high":169,"moderate":135,"low":101},"9":{"high":194,"moderate":155,"low":116},"10":{"high":219,"moderate":175,"low":131},"11":{"high":244,"moderate":195,"low":146},"12":{"high":269,"moderate":215,"low":161},"13":{"high":294,"moderate":235,"low":176},"14":{"high":319,"moderate":255,"low":191},"15":{"high":344,"moderate":275,"low":206},"16":{"high":369,"moderate":295,"low":221},"17":{"high":394,"moderate":315,"low":236},"18":{"high":419,"moderate":335,"low":251},"19":{"high":444,"moderate":355,"low":266},"20":{"high":469,"moderate":375,"low":281},"21":{"high":500,"moderate":400,"low":300},"22":{"high":538,"moderate":430,"low":323},"23":{"high":575,"moderate":460,"low":345},"24":{"high":625,"moderate":500,"low":375},"-1":{"high":9,"moderate":7,"low":5}};
const PERCEPTION_OR_SAVE = {"0":{"extreme":10,"high":9,"moderate":6,"low":3,"terrible":1},"1":{"extreme":11,"high":10,"moderate":7,"low":4,"terrible":2},"2":{"extreme":12,"high":11,"moderate":8,"low":5,"terrible":3},"3":{"extreme":14,"high":12,"moderate":9,"low":6,"terrible":4},"4":{"extreme":15,"high":14,"moderate":11,"low":8,"terrible":6},"5":{"extreme":17,"high":15,"moderate":12,"low":9,"terrible":7},"6":{"extreme":18,"high":17,"moderate":14,"low":11,"terrible":8},"7":{"extreme":20,"high":18,"moderate":15,"low":12,"terrible":10},"8":{"extreme":21,"high":19,"moderate":16,"low":13,"terrible":11},"9":{"extreme":23,"high":21,"moderate":18,"low":15,"terrible":12},"10":{"extreme":24,"high":22,"moderate":19,"low":16,"terrible":14},"11":{"extreme":26,"high":24,"moderate":21,"low":18,"terrible":15},"12":{"extreme":27,"high":25,"moderate":22,"low":19,"terrible":16},"13":{"extreme":29,"high":26,"moderate":23,"low":20,"terrible":18},"14":{"extreme":30,"high":28,"moderate":25,"low":22,"terrible":19},"15":{"extreme":32,"high":29,"moderate":26,"low":23,"terrible":20},"16":{"extreme":33,"high":30,"moderate":28,"low":25,"terrible":22},"17":{"extreme":35,"high":32,"moderate":29,"low":26,"terrible":23},"18":{"extreme":36,"high":33,"moderate":30,"low":27,"terrible":24},"19":{"extreme":38,"high":35,"moderate":32,"low":29,"terrible":26},"20":{"extreme":39,"high":36,"moderate":33,"low":30,"terrible":27},"21":{"extreme":41,"high":38,"moderate":35,"low":32,"terrible":28},"22":{"extreme":43,"high":39,"moderate":36,"low":33,"terrible":30},"23":{"extreme":44,"high":40,"moderate":37,"low":34,"terrible":31},"24":{"extreme":46,"high":42,"moderate":38,"low":36,"terrible":32},"-1":{"extreme":9,"high":8,"moderate":5,"low":2,"terrible":0}};
const STRIKE_BONUS = {"0":{"extreme":10,"high":8,"moderate":6,"low":4},"1":{"extreme":11,"high":9,"moderate":7,"low":5},"2":{"extreme":13,"high":11,"moderate":9,"low":7},"3":{"extreme":14,"high":12,"moderate":10,"low":8},"4":{"extreme":16,"high":14,"moderate":12,"low":9},"5":{"extreme":17,"high":15,"moderate":13,"low":11},"6":{"extreme":19,"high":17,"moderate":15,"low":12},"7":{"extreme":20,"high":18,"moderate":16,"low":13},"8":{"extreme":22,"high":20,"moderate":18,"low":15},"9":{"extreme":23,"high":21,"moderate":19,"low":16},"10":{"extreme":25,"high":23,"moderate":21,"low":17},"11":{"extreme":27,"high":24,"moderate":22,"low":19},"12":{"extreme":28,"high":26,"moderate":24,"low":20},"13":{"extreme":29,"high":27,"moderate":25,"low":21},"14":{"extreme":31,"high":29,"moderate":27,"low":23},"15":{"extreme":32,"high":30,"moderate":28,"low":24},"16":{"extreme":34,"high":32,"moderate":30,"low":25},"17":{"extreme":35,"high":33,"moderate":31,"low":27},"18":{"extreme":37,"high":35,"moderate":33,"low":28},"19":{"extreme":38,"high":36,"moderate":34,"low":29},"20":{"extreme":40,"high":38,"moderate":36,"low":31},"21":{"extreme":41,"high":39,"moderate":37,"low":32},"22":{"extreme":43,"high":41,"moderate":39,"low":33},"23":{"extreme":44,"high":42,"moderate":40,"low":35},"24":{"extreme":46,"high":44,"moderate":42,"low":36},"-1":{"extreme":10,"high":8,"moderate":6,"low":4}};
const STRIKE_DAMAGE = {"0":{"extreme":"1d6+3","high":"1d6+2","moderate":"1d4+2","low":"1d4+1"},"1":{"extreme":"1d8+4","high":"1d6+3","moderate":"1d6+2","low":"1d4+2"},"2":{"extreme":"1d12+4","high":"1d10+4","moderate":"1d8+4","low":"1d6+3"},"3":{"extreme":"1d12+8","high":"1d10+6","moderate":"1d8+6","low":"1d6+5"},"4":{"extreme":"2d10+7","high":"2d8+5","moderate":"2d6+5","low":"2d4+4"},"5":{"extreme":"2d12+7","high":"2d8+7","moderate":"2d6+6","low":"2d4+6"},"6":{"extreme":"2d12+10","high":"2d8+9","moderate":"2d6+8","low":"2d4+7"},"7":{"extreme":"2d12+12","high":"2d10+9","moderate":"2d8+8","low":"2d6+6"},"8":{"extreme":"2d12+15","high":"2d10+11","moderate":"2d8+9","low":"2d6+8"},"9":{"extreme":"2d12+17","high":"2d10+13","moderate":"2d8+11","low":"2d6+9"},"10":{"extreme":"2d12+20","high":"2d12+13","moderate":"2d10+11","low":"2d6+10"},"11":{"extreme":"2d12+22","high":"2d12+15","moderate":"2d10+12","low":"2d8+10"},"12":{"extreme":"3d12+19","high":"3d10+14","moderate":"3d8+12","low":"3d6+10"},"13":{"extreme":"3d12+21","high":"3d10+16","moderate":"3d8+14","low":"3d6+11"},"14":{"extreme":"3d12+24","high":"3d10+18","moderate":"3d8+15","low":"3d6+13"},"15":{"extreme":"3d12+26","high":"3d12+17","moderate":"3d10+14","low":"3d6+14"},"16":{"extreme":"3d12+29","high":"3d12+18","moderate":"3d10+15","low":"3d6+15"},"17":{"extreme":"3d12+31","high":"3d12+19","moderate":"3d10+16","low":"3d6+16"},"18":{"extreme":"3d12+34","high":"3d12+20","moderate":"3d10+17","low":"3d6+17"},"19":{"extreme":"4d12+29","high":"4d10+20","moderate":"4d8+17","low":"4d6+14"},"20":{"extreme":"4d12+32","high":"4d10+22","moderate":"4d8+19","low":"4d6+15"},"21":{"extreme":"4d12+34","high":"4d10+24","moderate":"4d8+20","low":"4d6+17"},"22":{"extreme":"4d12+37","high":"4d10+26","moderate":"4d8+22","low":"4d6+18"},"23":{"extreme":"4d12+39","high":"4d12+24","moderate":"4d10+20","low":"4d6+19"},"24":{"extreme":"4d12+42","high":"4d12+26","moderate":"4d10+22","low":"4d6+21"},"-1":{"extreme":"1d6+1","high":"1d4+1","moderate":"1d4","low":"1d4"}};
const SKILL_BONUS = {"0":{"extreme":9,"high":6,"moderate":5,"low":3,"terrible":2},"1":{"extreme":10,"high":7,"moderate":6,"low":4,"terrible":3},"2":{"extreme":11,"high":8,"moderate":7,"low":5,"terrible":4},"3":{"extreme":13,"high":10,"moderate":9,"low":7,"terrible":5},"4":{"extreme":15,"high":12,"moderate":10,"low":8,"terrible":7},"5":{"extreme":16,"high":13,"moderate":12,"low":10,"terrible":8},"6":{"extreme":18,"high":15,"moderate":13,"low":11,"terrible":9},"7":{"extreme":20,"high":17,"moderate":15,"low":13,"terrible":11},"8":{"extreme":21,"high":18,"moderate":16,"low":14,"terrible":12},"9":{"extreme":23,"high":20,"moderate":18,"low":16,"terrible":13},"10":{"extreme":25,"high":22,"moderate":19,"low":17,"terrible":15},"11":{"extreme":26,"high":23,"moderate":21,"low":19,"terrible":16},"12":{"extreme":28,"high":25,"moderate":22,"low":20,"terrible":17},"13":{"extreme":30,"high":27,"moderate":24,"low":22,"terrible":19},"14":{"extreme":31,"high":28,"moderate":25,"low":23,"terrible":20},"15":{"extreme":33,"high":30,"moderate":27,"low":25,"terrible":21},"16":{"extreme":35,"high":32,"moderate":28,"low":26,"terrible":23},"17":{"extreme":36,"high":33,"moderate":30,"low":28,"terrible":24},"18":{"extreme":38,"high":35,"moderate":31,"low":29,"terrible":25},"19":{"extreme":40,"high":37,"moderate":33,"low":31,"terrible":27},"20":{"extreme":41,"high":38,"moderate":34,"low":32,"terrible":28},"21":{"extreme":43,"high":40,"moderate":36,"low":34,"terrible":29},"22":{"extreme":45,"high":42,"moderate":37,"low":35,"terrible":31},"23":{"extreme":46,"high":43,"moderate":38,"low":36,"terrible":32},"24":{"extreme":48,"high":45,"moderate":40,"low":38,"terrible":33},"-1":{"extreme":8,"high":5,"moderate":4,"low":2,"terrible":1}};
const SPELLCASTING_DC_ATTACK = {"0":{"extreme":11,"high":8,"moderate":5},"1":{"extreme":12,"high":9,"moderate":6},"2":{"extreme":14,"high":10,"moderate":7},"3":{"extreme":15,"high":12,"moderate":9},"4":{"extreme":17,"high":13,"moderate":10},"5":{"extreme":18,"high":14,"moderate":11},"6":{"extreme":19,"high":16,"moderate":13},"7":{"extreme":21,"high":17,"moderate":14},"8":{"extreme":22,"high":18,"moderate":15},"9":{"extreme":24,"high":20,"moderate":17},"10":{"extreme":25,"high":21,"moderate":18},"11":{"extreme":26,"high":22,"moderate":19},"12":{"extreme":28,"high":24,"moderate":21},"13":{"extreme":29,"high":25,"moderate":22},"14":{"extreme":31,"high":26,"moderate":23},"15":{"extreme":32,"high":28,"moderate":25},"16":{"extreme":33,"high":29,"moderate":26},"17":{"extreme":35,"high":30,"moderate":27},"18":{"extreme":36,"high":32,"moderate":29},"19":{"extreme":38,"high":33,"moderate":30},"20":{"extreme":39,"high":34,"moderate":31},"21":{"extreme":40,"high":36,"moderate":33},"22":{"extreme":42,"high":37,"moderate":34},"23":{"extreme":43,"high":38,"moderate":35},"24":{"extreme":44,"high":40,"moderate":37},"-1":{"extreme":11,"high":8,"moderate":5}};
const ABILITY_MODIFIER_BUDGET = {"0":{"extreme":4,"high":3,"moderate":2,"low":0,"terrible":-4,"abysmal":-5},"1":{"extreme":5,"high":4,"moderate":3,"low":1,"terrible":-4,"abysmal":-5},"2":{"extreme":5,"high":4,"moderate":3,"low":1,"terrible":-4,"abysmal":-5},"3":{"extreme":5,"high":4,"moderate":3,"low":1,"terrible":-4,"abysmal":-5},"4":{"extreme":6,"high":5,"moderate":3,"low":2,"terrible":-4,"abysmal":-5},"5":{"extreme":6,"high":5,"moderate":4,"low":2,"terrible":-4,"abysmal":-5},"6":{"extreme":7,"high":5,"moderate":4,"low":2,"terrible":-4,"abysmal":-5},"7":{"extreme":7,"high":6,"moderate":4,"low":2,"terrible":-4,"abysmal":-5},"8":{"extreme":7,"high":6,"moderate":4,"low":3,"terrible":-4,"abysmal":-5},"9":{"extreme":7,"high":6,"moderate":4,"low":3,"terrible":-4,"abysmal":-5},"10":{"extreme":8,"high":7,"moderate":5,"low":3,"terrible":-4,"abysmal":-5},"11":{"extreme":8,"high":7,"moderate":5,"low":3,"terrible":-4,"abysmal":-5},"12":{"extreme":8,"high":7,"moderate":5,"low":4,"terrible":-4,"abysmal":-5},"13":{"extreme":9,"high":8,"moderate":5,"low":4,"terrible":-4,"abysmal":-5},"14":{"extreme":9,"high":8,"moderate":5,"low":4,"terrible":-4,"abysmal":-5},"15":{"extreme":9,"high":8,"moderate":6,"low":4,"terrible":-4,"abysmal":-5},"16":{"extreme":10,"high":9,"moderate":6,"low":5,"terrible":-4,"abysmal":-5},"17":{"extreme":10,"high":9,"moderate":6,"low":4,"terrible":-4,"abysmal":-5},"18":{"extreme":10,"high":9,"moderate":6,"low":5,"terrible":-4,"abysmal":-5},"19":{"extreme":11,"high":10,"moderate":6,"low":5,"terrible":-4,"abysmal":-5},"20":{"extreme":11,"high":10,"moderate":7,"low":6,"terrible":-4,"abysmal":-5},"21":{"extreme":11,"high":10,"moderate":7,"low":6,"terrible":-4,"abysmal":-5},"22":{"extreme":11,"high":10,"moderate":8,"low":6,"terrible":-4,"abysmal":-5},"23":{"extreme":11,"high":10,"moderate":8,"low":6,"terrible":-4,"abysmal":-5},"24":{"extreme":13,"high":12,"moderate":9,"low":7,"terrible":-4,"abysmal":-5},"-1":{"extreme":4,"high":3,"moderate":2,"low":0,"terrible":-4,"abysmal":-5}};
const AREA_DAMAGE = {"0":{"unlimited":"1d6","limited":"1d10"},"1":{"unlimited":"2d4","limited":"2d6"},"2":{"unlimited":"2d6","limited":"3d6"},"3":{"unlimited":"2d8","limited":"4d6"},"4":{"unlimited":"3d6","limited":"5d6"},"5":{"unlimited":"2d10","limited":"6d6"},"6":{"unlimited":"4d6","limited":"7d6"},"7":{"unlimited":"4d6","limited":"8d6"},"8":{"unlimited":"5d6","limited":"9d6"},"9":{"unlimited":"5d6","limited":"10d6"},"10":{"unlimited":"6d6","limited":"11d6"},"11":{"unlimited":"6d6","limited":"12d6"},"12":{"unlimited":"5d8","limited":"13d6"},"13":{"unlimited":"7d6","limited":"14d6"},"14":{"unlimited":"4d12","limited":"15d6"},"15":{"unlimited":"6d8","limited":"16d6"},"16":{"unlimited":"8d6","limited":"17d6"},"17":{"unlimited":"8d6","limited":"18d6"},"18":{"unlimited":"9d6","limited":"19d6"},"19":{"unlimited":"7d8","limited":"20d6"},"20":{"unlimited":"6d10","limited":"21d6"},"21":{"unlimited":"10d6","limited":"22d6"},"22":{"unlimited":"8d8","limited":"23d6"},"23":{"unlimited":"11d6","limited":"24d6"},"24":{"unlimited":"11d6","limited":"25d6"},"-1":{"unlimited":"1d4","limited":"1d6"}};

const LEVELS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

// Role presets from the same source (its Building-Creatures "roadmaps"
// -- pre-set tier assignments per category matching common monster
// archetypes). Given to the Homebrew prompt as real, verified starting
// points rather than the model guessing tier combinations freely.
const ROLE_TEMPLATES = {
  brute: { perception: "low", str: "extreme", con: "high", dex: "low", int: "low", wis: "low", cha: "low", ac: "low", fort: "high", ref: "low", will: "low", hp: "high", strikeBonus: "moderate", strikeDamage: "extreme" },
  magicalStriker: { strikeBonus: "high", strikeDamage: "high", spellcasting: "high" },
  skirmisher: { dex: "high", fort: "low", ref: "high" },
  sniper: { perception: "high", dex: "high", fort: "low", ref: "high", hp: "low", strikeBonus: "high", strikeDamage: "high" },
  soldier: { str: "high", ac: "high", fort: "high", strikeBonus: "high", strikeDamage: "high" },
  spellcaster: { int: "high", wis: "high", cha: "high", fort: "low", will: "high", hp: "low", strikeBonus: "low", strikeDamage: "low", spellcasting: "high" }
};

function clampLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return 1;
  return Math.max(-1, Math.min(24, Math.round(n)));
}

// Generic table lookup with a safe fallback to 'moderate' (or the
// closest available tier) if a caller asks for a tier a category
// doesn't define (e.g. hitPoints has no "extreme" tier -- matches the
// source table's own DefaultCreatureStatistics availableOptions per
// category).
function lookup(table, level, tier) {
  const row = table[String(clampLevel(level))];
  if (!row) return null;
  if (row[tier] !== undefined) return row[tier];
  if (row.moderate !== undefined) return row.moderate;
  const firstKey = Object.keys(row)[0];
  return row[firstKey];
}

function abilityModifier(level, tier) {
  return lookup(ABILITY_MODIFIER_BUDGET, level, tier || "moderate");
}
function armorClass(level, tier) {
  return lookup(ARMOR_CLASS, level, tier || "moderate");
}
function hitPoints(level, tier) {
  return lookup(HIT_POINTS, level, tier || "moderate");
}
function perceptionOrSave(level, tier) {
  return lookup(PERCEPTION_OR_SAVE, level, tier || "moderate");
}
function strikeBonus(level, tier) {
  return lookup(STRIKE_BONUS, level, tier || "moderate");
}
function strikeDamage(level, tier) {
  return lookup(STRIKE_DAMAGE, level, tier || "moderate");
}
function skillBonus(level, tier) {
  return lookup(SKILL_BONUS, level, tier || "moderate");
}
function spellcastingDcAttack(level, tier) {
  return lookup(SPELLCASTING_DC_ATTACK, level, tier || "moderate");
}
function areaDamage(level, kind) {
  const row = AREA_DAMAGE[String(clampLevel(level))];
  return row ? row[kind] : null;
}

// Resolves a full creature's numeric budget from a level + per-category
// tier assignment map (e.g. { ac: 'high', hp: 'moderate', str: 'extreme', ... }).
// Every category not present in `assignments` defaults to 'moderate' --
// matching the source table's own default (DefaultCreatureStatistics),
// which is also the right default for "the model didn't specify, use
// the safest middle-of-the-road value" callers like the Homebrew route.
function buildCreatureBudget(level, assignments = {}) {
  const a = (key, fallback = "moderate") => assignments[key] || fallback;
  return {
    level: clampLevel(level),
    abilities: {
      str: abilityModifier(level, a("str")),
      dex: abilityModifier(level, a("dex")),
      con: abilityModifier(level, a("con")),
      int: abilityModifier(level, a("int")),
      wis: abilityModifier(level, a("wis")),
      cha: abilityModifier(level, a("cha"))
    },
    armorClass: armorClass(level, a("ac")),
    hitPoints: hitPoints(level, a("hp")),
    perception: perceptionOrSave(level, a("perception")),
    savingThrows: {
      fort: perceptionOrSave(level, a("fort")),
      ref: perceptionOrSave(level, a("ref")),
      will: perceptionOrSave(level, a("will"))
    },
    strikeBonus: strikeBonus(level, a("strikeBonus")),
    strikeDamage: strikeDamage(level, a("strikeDamage")),
    spellcastingDcAttack: assignments.spellcasting ? spellcastingDcAttack(level, assignments.spellcasting) : null
  };
}

module.exports = {
  LEVELS,
  ROLE_TEMPLATES,
  clampLevel,
  abilityModifier,
  armorClass,
  hitPoints,
  perceptionOrSave,
  strikeBonus,
  strikeDamage,
  skillBonus,
  spellcastingDcAttack,
  areaDamage,
  buildCreatureBudget
};
