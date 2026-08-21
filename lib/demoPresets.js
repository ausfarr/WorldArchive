// lib/demoPresets.js
//
// Lightweight genre grounding for the unauthenticated demo generator
// (routes/demo.js) -- one short seed paragraph per preset, standing in
// for the settingContext a real world's Wizard Step 1 would normally
// provide (lib/worldFlavor.js's getSettingContext). Deliberately NOT
// Echoes of the Neon (the admin-only proprietary setting AND its
// mechanical system -- see session_addendum_demo_mode_scope.md's
// "Correction to the task brief's premises") -- these three are generic
// enough to match what the public product's 5e/Generic rulesets
// actually target, no full world bible, no roster, no faction system.

const DEMO_PRESETS = {
  "high-fantasy": {
    label: "High Fantasy",
    settingContext: "Genre & tone: High fantasy adventure -- knights, wizards, ancient ruins, and a world where magic is a known, respected force. Scale: a continent of rival kingdoms, old empires, and untamed wilderness between them. Inspirations/touchstones: classic sword-and-sorcery tabletop campaigns."
  },
  "sci-fi-cyberpunk": {
    label: "Sci-Fi / Cyberpunk",
    settingContext: "Genre & tone: Near-future cyberpunk -- megacorporations, neon-lit sprawl, black-market cybernetics, and a widening gap between the augmented rich and everyone else. Scale: one dense, vertical city-state, run more by corporate boards than any elected government. Inspirations/touchstones: classic cyberpunk tabletop and fiction."
  },
  "post-apocalyptic": {
    label: "Post-Apocalyptic",
    settingContext: "Genre & tone: Post-apocalyptic survival -- civilization collapsed a generation ago, and what's left is scavenged, rebuilt, and fought over. Scale: scattered settlements across a ruined regional landscape, connected by dangerous open road. Inspirations/touchstones: classic post-collapse survival fiction and tabletop campaigns."
  }
};

function getDemoPreset(key) {
  return DEMO_PRESETS[key] || null;
}

function listDemoPresets() {
  return Object.entries(DEMO_PRESETS).map(([key, p]) => ({ key, label: p.label }));
}

// A small, genre-agnostic Generic-ruleset attribute system (see
// lib/rulesets/generic/statFormulas.js) so demo Enemies get real
// code-computed derived stats -- not model-invented numbers -- without
// depending on any world's own wizard-configured system. Real content,
// not a placeholder; adjust freely if the numbers feel off in practice.
const DEMO_GENERIC_SYSTEM = {
  useFormula: true,
  attributes: [
    { key: "power", label: "Power" },
    { key: "speed", label: "Speed" },
    { key: "mind", label: "Mind" },
    { key: "grit", label: "Grit" }
  ],
  derivedStats: [
    { key: "health", label: "Health", attributeKey: "grit", coefficient: 4, base: 10 },
    { key: "damage", label: "Damage", attributeKey: "power", coefficient: 1, base: 2 }
  ]
};

module.exports = { DEMO_PRESETS, getDemoPreset, listDemoPresets, DEMO_GENERIC_SYSTEM };
