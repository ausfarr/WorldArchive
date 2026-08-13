// lib/rulesets/5e/starterRaces.js
//
// R4 Phase 3: hand-authored starter list of the ~9 core PHB/SRD races --
// sensible defaults a world can edit/replace/extend via the Stats &
// Skills wizard step, same "coded default, not ingested SRD text"
// treatment already given to the DMG CR table and PF2e's Building
// Creatures tables (see classFormulas.js's header comment for that
// precedent). Ability score increases/sizes/speeds are well-established,
// extremely widely reproduced 5e mechanical facts; trait descriptions
// below are written in this project's own words describing the general
// mechanical CONCEPT (e.g. "reroll a natural 1"), not copied from any
// WotC-published text -- deliberately conservative pending Phase 4's
// license verification of any real ingested SRD text.
//
// choiceNote covers the two races whose ability bonus includes a
// player-choice component in real 5e (Human's variant array and
// Half-Elf's floating +1s) -- represented as a flat default here (the
// simplest correct starting point noted in the scope doc) with a note
// explaining the real rule for a GM who wants to apply it by hand.

const STARTER_5E_RACES = [
  {
    key: "human",
    name: "Human",
    abilityScoreIncrease: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    choiceNote: null,
    size: "Medium",
    speed: 30,
    traits: [{ name: "Versatile", description: "No strong mechanical specialty -- humans adapt readily to any class or path." }],
    flavor: "Adaptable and widespread, found in nearly every corner of the world in every walk of life."
  },
  {
    key: "elf",
    name: "Elf",
    abilityScoreIncrease: { dex: 2 },
    choiceNote: null,
    size: "Medium",
    speed: 30,
    traits: [
      { name: "Darkvision", description: "Can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light (no color)." },
      { name: "Fey Ancestry", description: "Advantage on saving throws against being charmed, and magic can't put them to sleep." },
      { name: "Trance", description: "Doesn't need to sleep; instead meditates deeply for 4 hours a day to gain the same benefit a human gets from 8 hours of sleep." }
    ],
    flavor: "Long-lived and keenly attuned to magic and the natural world."
  },
  {
    key: "dwarf",
    name: "Dwarf",
    abilityScoreIncrease: { con: 2 },
    choiceNote: null,
    size: "Medium",
    speed: 25,
    traits: [
      { name: "Darkvision", description: "Can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light (no color)." },
      { name: "Dwarven Resilience", description: "Advantage on saving throws against poison, and resistance to poison damage." },
      { name: "Stonecunning", description: "Unusually keen instincts and knowledge concerning the stonework of the underground." }
    ],
    flavor: "Sturdy and enduring, with a deep cultural connection to stone, metal, and craft."
  },
  {
    key: "halfling",
    name: "Halfling",
    abilityScoreIncrease: { dex: 2 },
    choiceNote: null,
    size: "Small",
    speed: 25,
    traits: [
      { name: "Lucky", description: "When rolling a 1 on the d20 for an attack roll, ability check, or saving throw, may reroll the die and must use the new roll." },
      { name: "Brave", description: "Advantage on saving throws against being frightened." },
      { name: "Halfling Nimbleness", description: "Can move through the space of any creature that is a size larger than itself." }
    ],
    flavor: "Small, quick, and quietly resilient, valuing comfort, community, and good luck."
  },
  {
    key: "dragonborn",
    name: "Dragonborn",
    abilityScoreIncrease: { str: 2, cha: 1 },
    choiceNote: null,
    size: "Medium",
    speed: 30,
    traits: [
      { name: "Breath Weapon", description: "Can exhale destructive energy in a shape and damage type tied to its draconic ancestry, once per short/long rest." },
      { name: "Damage Resistance", description: "Resistance to the damage type associated with its draconic ancestry." }
    ],
    flavor: "Descended from or shaped by dragons, carrying a martial, honor-bound culture."
  },
  {
    key: "gnome",
    name: "Gnome",
    abilityScoreIncrease: { int: 2 },
    choiceNote: null,
    size: "Small",
    speed: 25,
    traits: [
      { name: "Darkvision", description: "Can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light (no color)." },
      { name: "Gnome Cunning", description: "Advantage on Intelligence, Wisdom, and Charisma saving throws against magic." }
    ],
    flavor: "Small, inventive, and endlessly curious, with a natural affinity for illusion and tinkering."
  },
  {
    key: "half-elf",
    name: "Half-Elf",
    abilityScoreIncrease: { cha: 2, str: 1, dex: 1 },
    choiceNote: "Real rule: +2 Charisma, plus +1 to two OTHER ability scores of the player's choice -- represented here with a default choice (STR/DEX); a GM can reassign the two +1s freely.",
    size: "Medium",
    speed: 30,
    traits: [
      { name: "Darkvision", description: "Can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light (no color)." },
      { name: "Fey Ancestry", description: "Advantage on saving throws against being charmed, and magic can't put them to sleep." },
      { name: "Skill Versatility", description: "Gains proficiency in two skills of its choice." }
    ],
    flavor: "Caught between two worlds, drawing on both human adaptability and elven grace."
  },
  {
    key: "half-orc",
    name: "Half-Orc",
    abilityScoreIncrease: { str: 2, con: 1 },
    choiceNote: null,
    size: "Medium",
    speed: 30,
    traits: [
      { name: "Darkvision", description: "Can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light (no color)." },
      { name: "Relentless Endurance", description: "When reduced to 0 hit points but not killed outright, can instead drop to 1 hit point, once per long rest." },
      { name: "Savage Attacks", description: "On a melee critical hit, rolls one additional damage die." }
    ],
    flavor: "Strong and resilient, often navigating a world quick to judge them by their ancestry."
  },
  {
    key: "tiefling",
    name: "Tiefling",
    abilityScoreIncrease: { cha: 2, int: 1 },
    choiceNote: null,
    size: "Medium",
    speed: 30,
    traits: [
      { name: "Darkvision", description: "Can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light (no color)." },
      { name: "Hellish Resistance", description: "Resistance to fire damage." },
      { name: "Infernal Legacy", description: "Knows a minor innate spell tied to its fiendish heritage, usable a limited number of times per day." }
    ],
    flavor: "Marked by an infernal bloodline, often regarded with suspicion despite having no more choice in their nature than anyone else."
  }
];

module.exports = { STARTER_5E_RACES };
