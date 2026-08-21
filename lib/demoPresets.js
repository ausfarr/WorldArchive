// lib/demoPresets.js
//
// Lightweight genre grounding for the unauthenticated demo generator
// (routes/demo.js) -- one short seed paragraph per preset, standing in
// for the settingContext a real world's Wizard Step 1 would normally
// provide (lib/worldFlavor.js's getSettingContext). Deliberately NOT
// Echoes of the Neon (the admin-only proprietary setting -- see
// session_addendum_demo_mode_scope.md) -- these three are genre-neutral
// grounding for the real 5e Homebrew Enemy pipeline and the ruleset-
// agnostic NPC pipeline (both in routes/demo.js), no full world bible,
// no roster, no faction system.

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

module.exports = { DEMO_PRESETS, getDemoPreset, listDemoPresets };
