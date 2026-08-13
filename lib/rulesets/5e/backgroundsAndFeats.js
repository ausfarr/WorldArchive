// lib/rulesets/5e/backgroundsAndFeats.js
//
// R4 Phase 5: hand-authored fallback Background + Feat lists -- Phase 4
// (5e-bits/5e-database license verification) did NOT clear the source
// this phase originally hoped to ingest from (see
// session_addendum_r4_5e_completeness_shipped.md's Phase 4 section for
// the full comparison method/findings: the underlying game numbers
// checked out against the real official CC-BY-4.0 SRD 5.2.1 text, but
// the repository's own README blankets ALL of its content -- including
// src/2024/ -- under "Open Gaming License Version 1.0a" with no mention
// of CC-BY-4.0 anywhere, and its 2024 directory has no Spells data at
// all). Per this phase's own explicit fallback instruction, this is a
// TEMPORARY hand-authored version -- upgrade to a real SRD-sourced list
// once a properly CC-BY-4.0-labeled source is verified and ingested
// (see Phase 4's writeup for a promising lead already found: the
// your5e/5e-srd-markdown GitHub mirror, which explicitly carries the
// correct CC-BY-4.0 SRD 5.2.1 attribution its own README states).
//
// Same "coded default, not copied text" treatment as
// lib/rulesets/5e/starterRaces.js: background/feat NAMES and the
// skill-proficiency PAIRS/tool-proficiency assignments below are
// well-established, extremely widely reproduced 5e facts (the same kind
// of non-copyrightable mechanical data already treated this way
// elsewhere in this codebase -- see classFormulas.js's header), but
// every description/equipment/feature text below is written in this
// project's own original words, not copied from any published source.

const CORE_BACKGROUNDS = [
  {
    key: "acolyte",
    name: "Acolyte",
    skillProficiencies: ["insight", "religion"],
    toolProficiency: null,
    languagesNote: "Two languages of your choice, learned through religious study.",
    equipment: "A holy symbol, a prayer book or prayer wheel, 5 sticks of incense, vestments, a set of common clothes, and a pouch with 15 gp.",
    featureName: "Shelter of the Faithful",
    featureDescription: "You and your companions can receive free healing and care at temples, shrines, and other established religious communities that share your faith, and you have a place among the lower clergy with some standing."
  },
  {
    key: "charlatan",
    name: "Charlatan",
    skillProficiencies: ["deception", "sleight_of_hand"],
    toolProficiency: "Disguise kit and forgery kit",
    languagesNote: null,
    equipment: "A set of fine clothes, a disguise kit, tools of a chosen con (weighted dice, marked deck of cards, or a signet ring of an invented duke), and a pouch with 15 gp.",
    featureName: "False Identity",
    featureDescription: "You have created a second identity with established documentation, contacts, and disguises that lets you assume that persona convincingly."
  },
  {
    key: "criminal",
    name: "Criminal",
    skillProficiencies: ["deception", "stealth"],
    toolProficiency: "One type of gaming set, and thieves' tools",
    languagesNote: null,
    equipment: "A crowbar, a set of dark common clothes with a hood, and a pouch with 15 gp.",
    featureName: "Criminal Contact",
    featureDescription: "You have a reliable and trustworthy contact who acts as your liaison to a network of other criminals, keeping you informed of local news and rumors."
  },
  {
    key: "entertainer",
    name: "Entertainer",
    skillProficiencies: ["acrobatics", "performance"],
    toolProficiency: "One type of musical instrument or performance prop",
    languagesNote: null,
    equipment: "A musical instrument or other performance tool, the favor of an admirer, a costume, and a pouch with 15 gp.",
    featureName: "By Popular Demand",
    featureDescription: "You can always find a place to perform in exchange for free lodging and modest food, and your performances make you locally well known wherever you go."
  },
  {
    key: "folk-hero",
    name: "Folk Hero",
    skillProficiencies: ["animal_handling", "survival"],
    toolProficiency: "One type of artisan's tools, and land vehicles",
    languagesNote: null,
    equipment: "A set of artisan's tools tied to your trade, a shovel, an iron pot, a set of common clothes, and a pouch with 10 gp.",
    featureName: "Rustic Hospitality",
    featureDescription: "Common folk trust you on sight and will shelter you from the law or hide you from those hunting you, though they won't risk their lives for you."
  },
  {
    key: "guild-artisan",
    name: "Guild Artisan",
    skillProficiencies: ["insight", "persuasion"],
    toolProficiency: "One type of artisan's tools",
    languagesNote: null,
    equipment: "A set of artisan's tools tied to your trade, a letter of introduction from your guild, a traveler's clothes, and a pouch with 15 gp.",
    featureName: "Guild Membership",
    featureDescription: "As a member in good standing of an established guild, you receive lodging and food support from fellow guild members, and your guild will back you in minor legal disputes."
  },
  {
    key: "hermit",
    name: "Hermit",
    skillProficiencies: ["medicine", "religion"],
    toolProficiency: "Herbalism kit",
    languagesNote: "One language of your choice, learned during years of isolated study.",
    equipment: "A scroll case stuffed with notes from your studies, a winter blanket, a set of common clothes, an herbalism kit, and 5 gp.",
    featureName: "Discovery",
    featureDescription: "Your years of isolation granted you a unique insight -- a hidden truth about the multiverse, a lost historical fact, or a fragment of forbidden knowledge -- known to very few others."
  },
  {
    key: "noble",
    name: "Noble",
    skillProficiencies: ["history", "persuasion"],
    toolProficiency: "One type of gaming set",
    languagesNote: null,
    equipment: "A set of fine clothes, a signet ring, a scroll of pedigree, and a purse with 25 gp.",
    featureName: "Position of Privilege",
    featureDescription: "People assume you have the right to be wherever you are; the common folk try to accommodate you and avoid your displeasure, and other nobles treat you as a member of the same social sphere."
  },
  {
    key: "outlander",
    name: "Outlander",
    skillProficiencies: ["athletics", "survival"],
    toolProficiency: "One type of musical instrument",
    languagesNote: "One language of your choice, spoken by the people or creatures you traveled among.",
    equipment: "A staff, a hunting trap, a trophy from an animal you killed, a set of traveler's clothes, and a pouch with 10 gp.",
    featureName: "Wanderer",
    featureDescription: "You have an excellent memory for maps and geography, and can always recall the general layout of terrain, settlements, and other features around you."
  },
  {
    key: "sage",
    name: "Sage",
    skillProficiencies: ["arcana", "history"],
    toolProficiency: null,
    languagesNote: "Two languages of your choice, learned through scholarly research.",
    equipment: "A bottle of black ink, a quill, a small knife, a letter from a dead colleague posing an unanswered question, a set of common clothes, and a pouch with 10 gp.",
    featureName: "Researcher",
    featureDescription: "When you attempt to learn or recall a piece of lore, you often know where and from whom you can obtain it if you don't already have that information at hand."
  },
  {
    key: "sailor",
    name: "Sailor",
    skillProficiencies: ["athletics", "perception"],
    toolProficiency: "Navigator's tools, and water vehicles",
    languagesNote: null,
    equipment: "A belaying pin (club), 50 feet of silk rope, a lucky charm, a set of common clothes, and a pouch with 10 gp.",
    featureName: "Ship's Passage",
    featureDescription: "You can secure free passage on a sailing ship for yourself and your companions in exchange for performing menial work during the voyage."
  },
  {
    key: "soldier",
    name: "Soldier",
    skillProficiencies: ["athletics", "intimidation"],
    toolProficiency: "One type of gaming set, and land vehicles",
    languagesNote: null,
    equipment: "An insignia of rank, a trophy from a fallen enemy, a set of bone dice or deck of cards, a set of common clothes, and a pouch with 10 gp.",
    featureName: "Military Rank",
    featureDescription: "Soldiers loyal to your former military organization recognize your authority and influence, and outrank you if the organization is a going concern."
  },
  {
    key: "urchin",
    name: "Urchin",
    skillProficiencies: ["sleight_of_hand", "stealth"],
    toolProficiency: "Disguise kit and thieves' tools",
    languagesNote: null,
    equipment: "A small knife, a map of the city you grew up in, a pet mouse, a token from your parents, a set of common clothes, and a pouch with 10 gp.",
    featureName: "City Secrets",
    featureDescription: "You know the secret patterns and flow of cities and can find passages through the urban sprawl that others would miss, moving between locations at double speed while alone or leading others."
  }
];

// Real, widely-known general-purpose feats -- taking one at an ASI level
// (see classFormulas.js's ABILITY_SCORE_IMPROVEMENT_LEVELS) is the
// existing real-rule alternative to a flat ability score increase.
// Prerequisite-gated feats (e.g. Heavily/Moderately Armored) are
// deliberately left out to keep this a safe default list any class/
// concept can pick from without a prerequisite-checking system.
const CORE_FEATS = [
  {
    key: "alert",
    name: "Alert",
    description: "Always ready for danger: a bonus to initiative, and immunity to being caught flat-footed (Surprised) while conscious."
  },
  {
    key: "athlete",
    name: "Athlete",
    description: "Physically trained: easier climbing, standing up from prone costs less movement, and better running jumps."
  },
  {
    key: "durable",
    name: "Durable",
    description: "Hardy and tough: increased Constitution, and healing from a short rest regains a minimum amount of Hit Points."
  },
  {
    key: "dual-wielder",
    name: "Dual Wielder",
    description: "A master of fighting with two weapons: a bonus to Armor Class while wielding two melee weapons, and no requirement that the weapons be light."
  },
  {
    key: "great-weapon-master",
    name: "Great Weapon Master",
    description: "Skilled with heavy weapons: on scoring a critical hit or reducing a creature to 0 Hit Points, can make one extra attack; can trade attack accuracy for extra damage with heavy weapons."
  },
  {
    key: "lucky",
    name: "Lucky",
    description: "Fortune favors you: a small pool of luck points usable to reroll an attack roll, ability check, or saving throw -- yours or an attacker's against you."
  },
  {
    key: "mobile",
    name: "Mobile",
    description: "Exceptionally speedy and agile: increased movement speed, no difficult-terrain penalty when dashing, and melee attacks don't provoke retaliation from the target.",
  },
  {
    key: "resilient",
    name: "Resilient",
    description: "Trained to overcome one weakness: increased score in a chosen ability, plus proficiency in saving throws using that ability."
  },
  {
    key: "sentinel",
    name: "Sentinel",
    description: "Adept at intercepting foes: enemies that move away from you within reach still take an opportunity attack at full speed, and a hit with an opportunity attack stops the target's movement."
  },
  {
    key: "tough",
    name: "Tough",
    description: "Physically hardened: maximum Hit Points increase, and increase again every time a new level is gained."
  }
];

module.exports = { CORE_BACKGROUNDS, CORE_FEATS };
