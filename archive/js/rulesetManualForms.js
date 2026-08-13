// archive/js/rulesetManualForms.js
//
// Ruleset Recovery, Phase R3 -- real per-ruleset Manual Entry forms for
// 5e/generic worlds. Loaded AFTER js/render.js (see the <script> tags at
// the bottom of archive/enemies|classes|items|survivors|spells/index.html)
// on exactly those 5 category pages -- render.js's own Echoes-shaped
// forms (showEnemyEditForm, showClassEditForm, showItemEditForm,
// showSurvivorEditForm) are NOT modified anywhere in this file or
// render.js itself; this file only overrides the two small DISPATCH
// points that decide which form builder to call:
//
//   - handleManualCreateClick(category) -- "Enter Manually" on a
//     category's own index page
//   - editEntry(categoryPath, id, btnEl) -- "Edit" on an already-saved
//     entry's card
//
// Both are plain top-level `function` declarations in render.js, which
// (same as any classic, non-module <script>) attach to the shared global
// scope -- redeclaring them here, in a script tag loaded after render.js,
// cleanly overrides them for every page that loads this file, while
// leaving render.js itself byte-for-byte untouched and leaving every
// OTHER category page (npcs/locations/factions/logs -- ruleset-agnostic,
// out of this session's scope) running the original, unmodified
// functions exactly as before. This mirrors routes/confirmEntry.js's own
// established pattern: branch dispatch around the untouched Echoes path,
// never fork or edit it.
//
// FORMULA DUPLICATION NOTE: this is a plain static-HTML/JS frontend with
// no build step (per CLAUDE.md) and no bundler to share server-side
// modules with the browser, so a few small, genuinely constant 5e tables
// (proficiency bonus by level, hit-die averages, spell slot counts, the
// SRD weapon/armor lookup) are copied verbatim below, each commented
// with its canonical source file. This is the same "code computes it,
// never hand-typed as if authoritative" principle every generation route
// already follows -- just re-run client-side, since a manually-typed
// entry has no server-side generation step to run it through the way
// Homebrew AI generation and the procedural generators do. If those
// canonical files ever change, these copies need updating too -- flagged
// here for whoever touches lib/rulesets/5e/*.js next.

// ---------- Copied constants (see header note above) ----------

// From lib/rulesets/5e/classFormulas.js
const CMF_PROFICIENCY_BONUS_BY_LEVEL = { 1:2,2:2,3:2,4:2,5:3,6:3,7:3,8:3,9:4,10:4,11:4,12:4,13:5,14:5,15:5,16:5,17:6,18:6,19:6,20:6 };
const CMF_SUBCLASS_UNLOCK_LEVEL = { cleric:1, sorcerer:1, warlock:1, druid:2, wizard:2, barbarian:3, bard:3, fighter:3, monk:3, paladin:3, ranger:3, rogue:3 };
const CMF_FULL_CASTER_SPELL_SLOTS = { 1:[2,0,0,0,0,0,0,0,0],2:[3,0,0,0,0,0,0,0,0],3:[4,2,0,0,0,0,0,0,0],4:[4,3,0,0,0,0,0,0,0],5:[4,3,2,0,0,0,0,0,0],6:[4,3,3,0,0,0,0,0,0],7:[4,3,3,1,0,0,0,0,0],8:[4,3,3,2,0,0,0,0,0],9:[4,3,3,3,1,0,0,0,0],10:[4,3,3,3,2,0,0,0,0],11:[4,3,3,3,2,1,0,0,0],12:[4,3,3,3,2,1,0,0,0],13:[4,3,3,3,2,1,1,0,0],14:[4,3,3,3,2,1,1,0,0],15:[4,3,3,3,2,1,1,1,0],16:[4,3,3,3,2,1,1,1,0],17:[4,3,3,3,2,1,1,1,1],18:[4,3,3,3,3,1,1,1,1],19:[4,3,3,3,3,2,1,1,1],20:[4,3,3,3,3,2,2,1,1] };
const CMF_HALF_CASTER_SPELL_SLOTS = { 1:[0,0,0,0,0],2:[2,0,0,0,0],3:[3,0,0,0,0],4:[3,0,0,0,0],5:[4,2,0,0,0],6:[4,2,0,0,0],7:[4,3,0,0,0],8:[4,3,0,0,0],9:[4,3,2,0,0],10:[4,3,2,0,0],11:[4,3,3,0,0],12:[4,3,3,0,0],13:[4,3,3,1,0],14:[4,3,3,1,0],15:[4,3,3,2,0],16:[4,3,3,2,0],17:[4,3,3,3,1],18:[4,3,3,3,1],19:[4,3,3,3,2],20:[4,3,3,3,2] };
const CMF_WARLOCK_PACT_MAGIC = { 1:{slots:1,slotLevel:1},2:{slots:2,slotLevel:1},3:{slots:2,slotLevel:2},4:{slots:2,slotLevel:2},5:{slots:2,slotLevel:3},6:{slots:2,slotLevel:3},7:{slots:2,slotLevel:4},8:{slots:2,slotLevel:4},9:{slots:2,slotLevel:5},10:{slots:2,slotLevel:5},11:{slots:3,slotLevel:5},12:{slots:3,slotLevel:5},13:{slots:3,slotLevel:5},14:{slots:3,slotLevel:5},15:{slots:3,slotLevel:5},16:{slots:3,slotLevel:5},17:{slots:4,slotLevel:5},18:{slots:4,slotLevel:5},19:{slots:4,slotLevel:5},20:{slots:4,slotLevel:5} };
function cmfProficiencyBonusForLevel(level) { const l = Math.max(1, Math.min(20, Math.round(Number(level) || 1))); return CMF_PROFICIENCY_BONUS_BY_LEVEL[l]; }
function cmfSubclassUnlockLevel(nameLower) {
  const match = Object.keys(CMF_SUBCLASS_UNLOCK_LEVEL).find((c) => nameLower.includes(c));
  return match ? CMF_SUBCLASS_UNLOCK_LEVEL[match] : 3;
}
function cmfSpellSlotsForLevel(casterType, level) {
  const l = Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
  if (casterType === "full") return CMF_FULL_CASTER_SPELL_SLOTS[l];
  if (casterType === "half") return CMF_HALF_CASTER_SPELL_SLOTS[l];
  if (casterType === "third") return CMF_FULL_CASTER_SPELL_SLOTS[Math.max(1, Math.floor(l / 3))];
  if (casterType === "warlock") return CMF_WARLOCK_PACT_MAGIC[l];
  return null;
}
// From lib/rulesets/5e/survivorFormulas.js
const CMF_HIT_DIE_AVERAGE = { 6: 4, 8: 5, 10: 6, 12: 7 };
function cmfAbilityModifier(score) { return Math.floor((Number(score) - 10) / 2); }
function cmfComputeHitPoints(hitDie, level, conScore) {
  const m = String(hitDie || "").match(/d(\d+)/i);
  const dieSize = m ? Number(m[1]) : 8;
  const conMod = cmfAbilityModifier(conScore);
  const lvl = Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
  const perLevelAvg = CMF_HIT_DIE_AVERAGE[dieSize] || Math.ceil(dieSize / 2) + 1;
  let hp = dieSize + conMod;
  for (let l = 2; l <= lvl; l++) hp += perLevelAvg + conMod;
  return Math.max(1, hp);
}
function cmfPassivePerception(wisScore, proficiencyBonus, isPerceptionProficient) {
  return 10 + cmfAbilityModifier(wisScore) + (isPerceptionProficient ? Number(proficiencyBonus) || 0 : 0);
}
function cmfInitiativeBonus(dexScore, featBonus) { return cmfAbilityModifier(dexScore) + (Number(featBonus) || 0); }
// R4 Phase 2 additions -- from lib/rulesets/5e/classFormulas.js
const CMF_SAVING_THROW_PROFICIENCIES = {
  barbarian: ["str", "con"], bard: ["dex", "cha"], cleric: ["wis", "cha"], druid: ["int", "wis"],
  fighter: ["str", "con"], monk: ["str", "dex"], paladin: ["wis", "cha"], ranger: ["str", "dex"],
  rogue: ["dex", "int"], sorcerer: ["con", "cha"], warlock: ["wis", "cha"], wizard: ["int", "wis"]
};
function cmfMatchCoreClassName(name) {
  const nameLower = String(name || "").toLowerCase();
  return Object.keys(CMF_SAVING_THROW_PROFICIENCIES).find((c) => nameLower.includes(c)) || null;
}
function cmfSavingThrowProficienciesForClass(matchedCoreClass, modelOrClassProposed) {
  if (matchedCoreClass && CMF_SAVING_THROW_PROFICIENCIES[matchedCoreClass]) return [...CMF_SAVING_THROW_PROFICIENCIES[matchedCoreClass]];
  return Array.isArray(modelOrClassProposed) ? modelOrClassProposed.slice(0, 2) : [];
}
const CMF_SKILLS = [
  { key: "acrobatics", name: "Acrobatics" }, { key: "animal_handling", name: "Animal Handling" },
  { key: "arcana", name: "Arcana" }, { key: "athletics", name: "Athletics" },
  { key: "deception", name: "Deception" }, { key: "history", name: "History" },
  { key: "insight", name: "Insight" }, { key: "intimidation", name: "Intimidation" },
  { key: "investigation", name: "Investigation" }, { key: "medicine", name: "Medicine" },
  { key: "nature", name: "Nature" }, { key: "perception", name: "Perception" },
  { key: "performance", name: "Performance" }, { key: "persuasion", name: "Persuasion" },
  { key: "religion", name: "Religion" }, { key: "sleight_of_hand", name: "Sleight of Hand" },
  { key: "stealth", name: "Stealth" }, { key: "survival", name: "Survival" }
];
// From lib/rulesets/5e/itemFormulas.js -- real SRD weapon/armor stats,
// trimmed to the subset offered in the baseItem dropdown below (the full
// canonical table is the server-side source of truth; if this dropdown
// list changes, keep it in sync with itemFormulas.js's WEAPONS/ARMOR).
const CMF_WEAPONS = {
  "dagger": { category: "Simple Melee", damageDice: "1d4", damageType: "piercing", properties: ["Finesse","Light","Thrown","Monk"] },
  "shortsword": { category: "Martial Melee", damageDice: "1d6", damageType: "piercing", properties: ["Finesse","Light","Monk"] },
  "longsword": { category: "Martial Melee", damageDice: "1d8", damageType: "slashing", properties: ["Versatile"] },
  "greatsword": { category: "Martial Melee", damageDice: "2d6", damageType: "slashing", properties: ["Heavy","Two-Handed"] },
  "rapier": { category: "Martial Melee", damageDice: "1d8", damageType: "piercing", properties: ["Finesse"] },
  "battleaxe": { category: "Martial Melee", damageDice: "1d8", damageType: "slashing", properties: ["Versatile"] },
  "warhammer": { category: "Martial Melee", damageDice: "1d8", damageType: "bludgeoning", properties: ["Versatile"] },
  "handaxe": { category: "Simple Melee", damageDice: "1d6", damageType: "slashing", properties: ["Light","Thrown","Monk"] },
  "quarterstaff": { category: "Simple Melee", damageDice: "1d6", damageType: "bludgeoning", properties: ["Versatile","Monk"] },
  "scimitar": { category: "Martial Melee", damageDice: "1d6", damageType: "slashing", properties: ["Finesse","Light"] },
  "mace": { category: "Simple Melee", damageDice: "1d6", damageType: "bludgeoning", properties: ["Monk"] },
  "shortbow": { category: "Simple Ranged", damageDice: "1d6", damageType: "piercing", properties: ["Ammunition","Two-Handed"] },
  "longbow": { category: "Martial Ranged", damageDice: "1d8", damageType: "piercing", properties: ["Ammunition","Heavy","Two-Handed"] }
};
const CMF_ARMOR = {
  "leather": { category: "Light", baseAc: 11, dexBonus: "full", strengthMin: 0, stealthDisadvantage: false },
  "studded leather": { category: "Light", baseAc: 12, dexBonus: "full", strengthMin: 0, stealthDisadvantage: false },
  "chain shirt": { category: "Medium", baseAc: 13, dexBonus: "max2", strengthMin: 0, stealthDisadvantage: false },
  "breastplate": { category: "Medium", baseAc: 14, dexBonus: "max2", strengthMin: 0, stealthDisadvantage: false },
  "half plate": { category: "Medium", baseAc: 15, dexBonus: "max2", strengthMin: 0, stealthDisadvantage: true },
  "chain mail": { category: "Heavy", baseAc: 16, dexBonus: "none", strengthMin: 13, stealthDisadvantage: true },
  "plate": { category: "Heavy", baseAc: 18, dexBonus: "none", strengthMin: 15, stealthDisadvantage: true },
  "shield": { category: "Shield", baseAc: 2, dexBonus: "none", strengthMin: 0, stealthDisadvantage: false }
};

// ---------- Small shared helpers ----------

// Memoized ruleset lookup, same pattern as render.js's own
// getAiEnabledStatus() -- fetched once per page load, reused by every
// call site below.
let _rulesetPromise = null;
async function getWorldRuleset() {
  if (_rulesetPromise) return _rulesetPromise;
  _rulesetPromise = (async () => {
    try {
      const res = await authFetch("/api/wizard/ruleset-options");
      const data = await res.json();
      return data.current || "echoes";
    } catch (err) {
      console.error("Could not load this world's ruleset, defaulting to Echoes manual form:", err);
      return "echoes";
    }
  })();
  return _rulesetPromise;
}

async function getGenericSystemOrNull() {
  try {
    const res = await authFetch("/api/wizard/generic-system");
    const data = await res.json();
    return data.genericSystem || null;
  } catch (err) {
    console.error("Could not load this world's generic attribute system:", err);
    return null;
  }
}

function rowHeader(text) {
  return `<h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">${text}</h3>`;
}
function rowAddBtn(id, label) {
  return `<button id="${id}" type="button" style="margin-top:6px; background: var(--bg-panel-raised); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">${label}</button>`;
}
function rowRemoveBtn(i) {
  return `<button type="button" data-idx="${i}" class="ef-row-remove" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:8px 10px; cursor:pointer; font-family:var(--font-mono); font-size:0.68rem;">✕</button>`;
}
function rowTextInput(i, field, value, placeholder, flex) {
  return `<input data-idx="${i}" data-field="${field}" type="text" value="${escapeHtmlForSearch(value)}" placeholder="${escapeHtmlForSearch(placeholder || "")}" class="ef-input" style="flex:${flex || 1}; min-width:120px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">`;
}
function rowNumberInput(i, field, value, placeholder, width) {
  return `<input data-idx="${i}" data-field="${field}" type="number" value="${escapeHtmlForSearch(value)}" placeholder="${escapeHtmlForSearch(placeholder || "")}" style="width:${width || "70px"}; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">`;
}

async function postConfirmEntry(category, entry) {
  const res = await authFetch("/api/confirm-entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, entry })
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || result.error || "Save failed");
}

async function populateFactionWrap(wrapId, raw, noneLabel) {
  const lookup = await getFactionLookup();
  const options = Object.keys(lookup).map((key) => ({ id: key, name: lookup[key].name }));
  const el = document.getElementById(wrapId);
  if (el) el.innerHTML = efSelect("Faction", "ef-faction", idSelectOptionsHtml(options, raw.faction, noneLabel || "— faction-agnostic —"));
}

// ============================================================
// 5e Enemies
// ============================================================

const FIVEE_SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
const FIVEE_ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

function show5eEnemyEditForm(entry) {
  const raw = entry.raw || {};
  const abilities = raw.abilities || {};
  const cr = raw.challengeRating || {};

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    <div id="ef-faction-wrap"></div>
    ${efSelect("Size", "ef-size", FIVEE_SIZES.map((s) => `<option value="${s}" ${s === raw.size ? "selected" : ""}>${s}</option>`).join(""))}
    ${efField("Type (e.g. beast, humanoid, undead)", "ef-type", raw.type)}
    ${efField("Alignment", "ef-alignment", raw.alignment)}
    <div style="display:flex; gap:12px;">
      ${efField("Armor Class", "ef-ac", raw.armorClass, { type: "number" })}
      ${efField("Armor Note (optional)", "ef-armorNote", raw.armorNote)}
    </div>
    <div style="display:flex; gap:12px;">
      ${efField("Hit Points", "ef-hp", raw.hitPoints, { type: "number" })}
      ${efField("Hit Dice (e.g. 4d8+4)", "ef-hitDice", raw.hitDice)}
    </div>
    ${efField("Speed", "ef-speed", raw.speed, { placeholder: "e.g. 30 ft., fly 60 ft." })}
    ${rowHeader("Ability Scores")}
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 0 16px;">
      ${FIVEE_ABILITY_KEYS.map((k) => efField(k.toUpperCase(), `ef-ability-${k}`, abilities[k] != null ? abilities[k] : 10, { type: "number" })).join("")}
    </div>
    ${efField("Saving Throws (free text, e.g. \"Dex +4, Wis +2\")", "ef-savingThrows", Array.isArray(raw.savingThrows) ? "" : raw.savingThrows)}
    ${efField("Skills (free text, e.g. \"Stealth +6\")", "ef-skills", Array.isArray(raw.skills) ? "" : raw.skills)}
    ${efField("Damage Vulnerabilities", "ef-dmgVuln", raw.damageVulnerabilities)}
    ${efField("Damage Resistances", "ef-dmgRes", raw.damageResistances)}
    ${efField("Damage Immunities", "ef-dmgImm", raw.damageImmunities)}
    ${efField("Condition Immunities", "ef-condImm", raw.conditionImmunities)}
    ${efField("Senses", "ef-senses", raw.senses)}
    ${efField("Languages", "ef-languages", raw.languages)}
    <div style="display:flex; gap:12px;">
      ${efField("Challenge Rating (e.g. 1/2, 3)", "ef-cr", cr.cr)}
      ${efField("XP (optional)", "ef-xp", cr.xp, { type: "number" })}
    </div>
    ${rowHeader("Traits")}
    <div id="ef-trait-rows"></div>
    ${rowAddBtn("ef-add-trait", "+ Add Trait")}
    ${rowHeader("Actions")}
    <div id="ef-action-rows"></div>
    ${rowAddBtn("ef-add-action", "+ Add Action")}
    ${rowHeader("Legendary Actions (optional)")}
    <div id="ef-legendary-rows"></div>
    ${rowAddBtn("ef-add-legendary", "+ Add Legendary Action")}
    ${efField("Flavor", "ef-flavor", raw.flavor, { textarea: true })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Enemy", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const updated = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      faction: val("ef-faction") || null,
      size: val("ef-size"),
      type: val("ef-type"),
      alignment: val("ef-alignment"),
      armorClass: Number(val("ef-ac")) || 10,
      armorNote: val("ef-armorNote") || null,
      hitPoints: Number(val("ef-hp")) || 1,
      hitDice: val("ef-hitDice") || null,
      speed: val("ef-speed"),
      abilities: Object.fromEntries(FIVEE_ABILITY_KEYS.map((k) => [k, Number(val(`ef-ability-${k}`)) || 10])),
      savingThrows: val("ef-savingThrows") || null,
      skills: val("ef-skills") || null,
      damageVulnerabilities: val("ef-dmgVuln") || null,
      damageResistances: val("ef-dmgRes") || null,
      damageImmunities: val("ef-dmgImm") || null,
      conditionImmunities: val("ef-condImm") || null,
      senses: val("ef-senses") || null,
      languages: val("ef-languages") || null,
      challengeRating: {
        cr: val("ef-cr") || "?",
        xp: val("ef-xp") ? Number(val("ef-xp")) : null,
        defensiveCr: cr.defensiveCr || null,
        offensiveCr: cr.offensiveCr || null,
        // A hand-typed CR is the GM's own declaration, not a computed
        // estimate -- but it's still not an official printed SRD value,
        // so it keeps the same "estimated" badge Homebrew tier uses
        // rather than presenting it as verified import/reflavor data.
        estimated: true
      },
      traits: traitState.filter((t) => t.name),
      actions: actionState.filter((a) => a.name),
      legendaryActions: legendaryState.filter((a) => a.name),
      flavor: val("ef-flavor"),
      designNotes: val("ef-designNotes"),
      sourceMode: raw.sourceMode || "homebrew",
      srdSourceId: raw.srdSourceId || null,
      srdLicenseNote: raw.srdLicenseNote || null
    };
    await postConfirmEntry("enemies", updated);
  });

  populateFactionWrap("ef-faction-wrap", raw);

  const traitState = (Array.isArray(raw.traits) ? raw.traits : []).map((t) => ({ name: t.name || "", description: t.description || "" }));
  const renderTraitRows = wireRowEditor("ef-trait-rows", traitState, (t, i) => `
    <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
      ${rowTextInput(i, "name", t.name, "Trait name")}
      ${rowTextInput(i, "description", t.description, "Rules text", 2)}
      ${rowRemoveBtn(i)}
    </div>`, "No traits yet.");
  document.getElementById("ef-add-trait").addEventListener("click", () => { traitState.push({ name: "", description: "" }); renderTraitRows(); });

  const actionState = (Array.isArray(raw.actions) ? raw.actions : []).map((a) => ({ name: a.name || "", description: a.description || "", toHit: a.toHit != null ? a.toHit : "", damageDice: a.damageDice || "" }));
  const renderActionRows = wireRowEditor("ef-action-rows", actionState, (a, i) => `
    <div style="display:flex; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
      ${rowTextInput(i, "name", a.name, "Action name")}
      ${rowNumberInput(i, "toHit", a.toHit, "to-hit")}
      ${rowTextInput(i, "damageDice", a.damageDice, "e.g. 1d6+2", 1)}
      ${rowRemoveBtn(i)}
    </div>
    <div style="margin-bottom:8px;">${rowTextInput(i, "description", a.description, "Full rules text, e.g. \"Melee Weapon Attack: +4 to hit... Hit: 5 (1d6+2) slashing damage.\"", 1)}</div>`, "No actions yet.");
  document.getElementById("ef-add-action").addEventListener("click", () => { actionState.push({ name: "", description: "", toHit: "", damageDice: "" }); renderActionRows(); });

  const legendaryState = (Array.isArray(raw.legendaryActions) ? raw.legendaryActions : []).map((a) => ({ name: a.name || "", description: a.description || "" }));
  const renderLegendaryRows = wireRowEditor("ef-legendary-rows", legendaryState, (a, i) => `
    <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
      ${rowTextInput(i, "name", a.name, "Legendary action name")}
      ${rowTextInput(i, "description", a.description, "Rules text", 2)}
      ${rowRemoveBtn(i)}
    </div>`, "No legendary actions.");
  document.getElementById("ef-add-legendary").addEventListener("click", () => { legendaryState.push({ name: "", description: "" }); renderLegendaryRows(); });

  return overlay;
}

// ============================================================
// Generic Enemies -- renders whatever attributes THIS world defined
// (world_config.generic_system_json), matching
// lib/rulesets/generic/enemyTemplate.js's own render contract exactly.
// ============================================================

async function showGenericEnemyEditForm(entry) {
  const raw = entry.raw || {};
  const genericSystem = await getGenericSystemOrNull();
  const attrDefs = (genericSystem && genericSystem.attributes) || [];
  const useFormula = !!(genericSystem && genericSystem.useFormula);
  const attrs = raw.attributes || {};

  if (!attrDefs.length) {
    alert("This world hasn't configured its homebrew attribute system yet -- finish that setup (Settings) before creating an Enemy manually.");
    return null;
  }

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    <div id="ef-faction-wrap"></div>
    ${rowHeader("Attributes")}
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 0 16px;">
      ${attrDefs.map((def) => efField(def.label, `ef-attr-${def.key}`, attrs[def.key] != null ? attrs[def.key] : 10, { type: "number" })).join("")}
    </div>
    ${useFormula
      ? `<p style="color:var(--ink-faint); font-size:0.78rem; margin:-6px 0 14px;">Derived stats recompute automatically from these on save -- not editable directly.</p>`
      : efField("Flavor Stats (this world has no formula layer -- describe combat capability directly)", "ef-flavorStats", raw.flavorStats, { textarea: true, rows: 2 })}
    ${rowHeader("Traits")}
    <div id="ef-trait-rows"></div>
    ${rowAddBtn("ef-add-trait", "+ Add Trait")}
    ${rowHeader("Actions")}
    <div id="ef-action-rows"></div>
    ${rowAddBtn("ef-add-action", "+ Add Action")}
    ${efField("Flavor", "ef-flavor", raw.flavor, { textarea: true })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Enemy", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const attributes = Object.fromEntries(attrDefs.map((def) => [def.key, Number(val(`ef-attr-${def.key}`)) || 0]));
    const updated = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      faction: val("ef-faction") || null,
      attributes,
      derivedStats: useFormula ? computeGenericDerivedStats(genericSystem, attributes) : null,
      flavorStats: useFormula ? undefined : val("ef-flavorStats"),
      traits: traitState.filter((t) => t.name),
      actions: actionState.filter((a) => a.name),
      flavor: val("ef-flavor"),
      designNotes: val("ef-designNotes"),
      sourceMode: raw.sourceMode || "homebrew"
    };
    await postConfirmEntry("enemies", updated);
  });

  populateFactionWrap("ef-faction-wrap", raw);

  const traitState = (Array.isArray(raw.traits) ? raw.traits : []).map((t) => ({ name: t.name || "", description: t.description || "" }));
  const renderTraitRows = wireRowEditor("ef-trait-rows", traitState, (t, i) => `
    <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
      ${rowTextInput(i, "name", t.name, "Trait name")}
      ${rowTextInput(i, "description", t.description, "Effect", 2)}
      ${rowRemoveBtn(i)}
    </div>`, "No traits yet.");
  document.getElementById("ef-add-trait").addEventListener("click", () => { traitState.push({ name: "", description: "" }); renderTraitRows(); });

  const actionState = (Array.isArray(raw.actions) ? raw.actions : []).map((a) => ({ name: a.name || "", description: a.description || "" }));
  const renderActionRows = wireRowEditor("ef-action-rows", actionState, (a, i) => `
    <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
      ${rowTextInput(i, "name", a.name, "Action name")}
      ${rowTextInput(i, "description", a.description, "Effect", 2)}
      ${rowRemoveBtn(i)}
    </div>`, "No actions yet.");
  document.getElementById("ef-add-action").addEventListener("click", () => { actionState.push({ name: "", description: "" }); renderActionRows(); });

  return overlay;
}

// From lib/rulesets/generic/statFormulas.js -- deliberately the same
// tiny single-attribute linear formula (base + coefficient*attribute),
// re-run here since a manual entry has no server-side generation step.
function computeGenericDerivedStats(genericSystem, attributes) {
  if (!genericSystem || !genericSystem.useFormula || !Array.isArray(genericSystem.derivedStats)) return {};
  const result = {};
  for (const def of genericSystem.derivedStats) {
    const attrValue = Number((attributes || {})[def.attributeKey]) || 0;
    result[def.key] = Math.round((Number(def.base) || 0) + (Number(def.coefficient) || 0) * attrValue);
  }
  return result;
}

// ============================================================
// 5e Classes
// ============================================================

const FIVEE_HIT_DICE = ["d4", "d6", "d8", "d10", "d12"];
const FIVEE_CASTER_TYPES = ["none", "full", "half", "third", "warlock"];

function show5eClassEditForm(entry) {
  const raw = entry.raw || {};
  const isCaster = raw.casterType && raw.casterType !== "none";

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    <div id="ef-faction-wrap"></div>
    ${efSelect("Hit Die", "ef-hitDie", FIVEE_HIT_DICE.map((d) => `<option value="${d}" ${d === raw.hitDie ? "selected" : ""}>${d}</option>`).join(""))}
    ${efSelect("Primary Ability", "ef-primaryAbility", FIVEE_ABILITY_KEYS.map((k) => `<option value="${k}" ${k === raw.primaryAbility ? "selected" : ""}>${k.toUpperCase()}</option>`).join(""))}
    ${efField("Saving Throw Proficiencies (comma-separated, e.g. \"str, con\")", "ef-saves", (raw.savingThrowProficiencies || []).join(", "))}
    ${efSelect("Caster Type", "ef-casterType", FIVEE_CASTER_TYPES.map((c) => `<option value="${c}" ${c === (raw.casterType || "none") ? "selected" : ""}>${c}</option>`).join(""))}
    ${efSelect("Spellcasting Ability (if a caster)", "ef-spellAbility", ["", "int", "wis", "cha"].map((k) => `<option value="${k}" ${k === (raw.spellcastingAbility || "") ? "selected" : ""}>${k || "—"}</option>`).join(""))}
    ${rowHeader("Features (milestone levels)")}
    <div id="ef-feature-rows"></div>
    ${rowAddBtn("ef-add-feature", "+ Add Feature")}
    <p style="color:var(--ink-faint); font-size:0.75rem; margin:-4px 0 12px;">Ability Score Improvement levels (4/8/12/16/19) and the subclass-unlock level are inserted automatically -- don't add features at those levels.</p>
    ${efField("Subclass Name (this class's archetype-category label, e.g. \"Sacred Oath\")", "ef-subclassName", raw.subclassName)}
    ${rowHeader("Subclasses (at least 1 recommended)")}
    <div id="ef-subclass-rows"></div>
    ${rowAddBtn("ef-add-subclass", "+ Add Subclass")}
    ${efField("Flavor", "ef-flavor", raw.flavor, { textarea: true })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Class", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const name = val("ef-name");
    const unlockLevel = cmfSubclassUnlockLevel(name.toLowerCase());
    const subclassLevels = [Math.max(3, unlockLevel), unlockLevel + 3, unlockLevel + 7];
    // R4 Phase 2: saving throw proficiencies are code-determined for a
    // name that matches one of the 12 core classes (a real 5e rule, same
    // as the AI-generation and procedural paths) -- the typed field is
    // kept only as the fallback for a genuinely original homebrew name.
    const matchedCoreClass = cmfMatchCoreClassName(name);
    const typedSaves = val("ef-saves").split(",").map((s) => s.trim()).filter(Boolean);
    const savingThrowProficiencies = cmfSavingThrowProficienciesForClass(matchedCoreClass, typedSaves);
    const updated = {
      ...raw,
      id: raw.id,
      name,
      faction: val("ef-faction") || null,
      hitDie: val("ef-hitDie"),
      primaryAbility: val("ef-primaryAbility"),
      savingThrowProficiencies,
      casterType: val("ef-casterType"),
      spellcastingAbility: val("ef-casterType") === "none" ? null : (val("ef-spellAbility") || null),
      features: featureState.filter((f) => f.name).map((f) => ({ level: Number(f.level) || 1, name: f.name, description: f.description })),
      subclassName: val("ef-subclassName"),
      subclassUnlockLevel: unlockLevel,
      subclasses: subclassState.filter((s) => s.name).map((s) => ({
        name: s.name,
        flavor: s.flavor,
        features: subclassLevels.map((level) => ({ level, name: s.featureName || "Feature", description: s.featureDescription || "" }))
      })),
      flavor: val("ef-flavor"),
      designNotes: val("ef-designNotes"),
      sourceMode: raw.sourceMode || "homebrew"
    };
    await postConfirmEntry("classes", updated);
  });

  populateFactionWrap("ef-faction-wrap", raw);

  document.getElementById("ef-casterType").addEventListener("change", (e) => {
    document.getElementById("ef-spellAbility").closest("div").style.display = e.target.value === "none" ? "none" : "";
  });
  if (!isCaster) document.getElementById("ef-spellAbility").closest("div").style.display = "none";

  const featureState = (Array.isArray(raw.features) ? raw.features : []).map((f) => ({ level: f.level || 1, name: f.name || "", description: f.description || "" }));
  const renderFeatureRows = wireRowEditor("ef-feature-rows", featureState, (f, i) => `
    <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap; align-items:flex-start;">
      ${rowNumberInput(i, "level", f.level, "lvl")}
      ${rowTextInput(i, "name", f.name, "Feature name")}
      ${rowTextInput(i, "description", f.description, "What it does", 2)}
      ${rowRemoveBtn(i)}
    </div>`, "No features yet.");
  document.getElementById("ef-add-feature").addEventListener("click", () => { featureState.push({ level: 1, name: "", description: "" }); renderFeatureRows(); });

  const subclassState = (Array.isArray(raw.subclasses) ? raw.subclasses : []).map((s) => ({
    name: s.name || "", flavor: s.flavor || "",
    featureName: (s.features && s.features[0] && s.features[0].name) || "",
    featureDescription: (s.features && s.features[0] && s.features[0].description) || ""
  }));
  const renderSubclassRows = wireRowEditor("ef-subclass-rows", subclassState, (s, i) => `
    <div style="display:flex; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
      ${rowTextInput(i, "name", s.name, "Subclass name")}
      ${rowTextInput(i, "flavor", s.flavor, "1-2 sentence flavor", 2)}
      ${rowRemoveBtn(i)}
    </div>
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      ${rowTextInput(i, "featureName", s.featureName, "First feature's name")}
      ${rowTextInput(i, "featureDescription", s.featureDescription, "What it does", 2)}
    </div>`, "No subclasses yet.");
  document.getElementById("ef-add-subclass").addEventListener("click", () => { subclassState.push({ name: "", flavor: "", featureName: "", featureDescription: "" }); renderSubclassRows(); });

  return overlay;
}

// ============================================================
// Generic Classes -- narrative-first, no leveling table (see
// lib/rulesets/generic/classTemplate.js's header for why).
// ============================================================

async function showGenericClassEditForm(entry) {
  const raw = entry.raw || {};
  const genericSystem = await getGenericSystemOrNull();
  const attrDefs = (genericSystem && genericSystem.attributes) || [];

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    <div id="ef-faction-wrap"></div>
    ${efSelect("Leans On (optional)", "ef-keyAttribute", `<option value="">— none —</option>` + attrDefs.map((d) => `<option value="${d.key}" ${d.key === raw.keyAttribute ? "selected" : ""}>${escapeHtmlForSearch(d.label)}</option>`).join(""))}
    ${efField("Flavor", "ef-flavor", raw.flavor, { textarea: true, rows: 2 })}
    ${efField("Description", "ef-description", raw.description, { textarea: true })}
    ${rowHeader("Features")}
    <div id="ef-feature-rows"></div>
    ${rowAddBtn("ef-add-feature", "+ Add Feature")}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Class", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const updated = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      faction: val("ef-faction") || null,
      keyAttribute: val("ef-keyAttribute") || null,
      flavor: val("ef-flavor"),
      description: val("ef-description"),
      features: featureState.filter((f) => f.name),
      designNotes: val("ef-designNotes"),
      sourceMode: raw.sourceMode || "homebrew"
    };
    await postConfirmEntry("classes", updated);
  });

  populateFactionWrap("ef-faction-wrap", raw);

  const featureState = (Array.isArray(raw.features) ? raw.features : []).map((f) => ({ name: f.name || "", description: f.description || "" }));
  const renderFeatureRows = wireRowEditor("ef-feature-rows", featureState, (f, i) => `
    <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
      ${rowTextInput(i, "name", f.name, "Feature name")}
      ${rowTextInput(i, "description", f.description, "What it lets a character do", 2)}
      ${rowRemoveBtn(i)}
    </div>`, "No features yet.");
  document.getElementById("ef-add-feature").addEventListener("click", () => { featureState.push({ name: "", description: "" }); renderFeatureRows(); });

  return overlay;
}

// ============================================================
// 5e Items
// ============================================================

const FIVEE_ITEM_TYPES = ["weapon", "armor", "wondrous", "potion", "scroll", "ring", "rod", "staff", "wand", "other"];
const FIVEE_RARITIES = ["", "Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"];

function resolve5eStats(itemType, baseItem) {
  if (itemType === "weapon") return CMF_WEAPONS[String(baseItem || "").toLowerCase()] || null;
  if (itemType === "armor") return CMF_ARMOR[String(baseItem || "").toLowerCase()] || null;
  return null;
}

function show5eItemEditForm(entry) {
  const raw = entry.raw || {};

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    <div id="ef-faction-wrap"></div>
    ${efSelect("Item Type", "ef-itemType", FIVEE_ITEM_TYPES.map((t) => `<option value="${t}" ${t === raw.itemType ? "selected" : ""}>${t}</option>`).join(""))}
    ${efSelect("Rarity", "ef-rarity", FIVEE_RARITIES.map((r) => `<option value="${r}" ${r === (raw.rarity || "") ? "selected" : ""}>${r || "— mundane —"}</option>`).join(""))}
    <div id="ef-baseItem-wrap">
      ${efField("Base Item (exact SRD name, e.g. \"longsword\" or \"leather\" -- leave blank if not a weapon/armor)", "ef-baseItem", raw.baseItem, { datalistId: "ef-baseItem-suggestions" })}
      <datalist id="ef-baseItem-suggestions">${Object.keys(CMF_WEAPONS).concat(Object.keys(CMF_ARMOR)).map((n) => `<option value="${n}"></option>`).join("")}</datalist>
    </div>
    ${efField("Magic Bonus (e.g. 1 for a +1 item, blank for none)", "ef-magicBonus", raw.magicBonus, { type: "number" })}
    <label style="display:flex; align-items:center; gap:8px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-dim); margin: 0 0 14px;">
      <input type="checkbox" id="ef-requiresAttunement" ${raw.requiresAttunement ? "checked" : ""}> Requires Attunement
    </label>
    ${efField("Attunement Requirement (optional)", "ef-attunementReq", raw.attunementRequirement)}
    ${efField("Description", "ef-description", raw.description, { textarea: true })}
    ${efField("Magical Properties (one per line)", "ef-magicalProperties", (raw.magicalProperties || []).join("\n"), { textarea: true, rows: 3 })}
    <div style="display:flex; gap:12px;">
      ${efField("Value (gp)", "ef-valueGp", raw.valueGp, { type: "number" })}
      ${efField("Weight (lb)", "ef-weightLb", raw.weightLb, { type: "number" })}
    </div>
    ${efField("Flavor", "ef-flavor", raw.flavor, { textarea: true, rows: 2 })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Item", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const itemType = val("ef-itemType");
    const baseItem = (itemType === "weapon" || itemType === "armor") ? (val("ef-baseItem") || null) : null;
    const magicBonusRaw = val("ef-magicBonus");
    const rarity = val("ef-rarity") || null;
    const updated = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      faction: val("ef-faction") || null,
      itemType,
      rarity,
      requiresAttunement: document.getElementById("ef-requiresAttunement").checked,
      attunementRequirement: val("ef-attunementReq") || null,
      baseItem,
      magicBonus: magicBonusRaw ? Number(magicBonusRaw) : null,
      resolvedStats: resolve5eStats(itemType, baseItem),
      description: val("ef-description"),
      magicalProperties: val("ef-magicalProperties").split("\n").map((s) => s.trim()).filter(Boolean),
      valueGp: val("ef-valueGp") ? Number(val("ef-valueGp")) : null,
      weightLb: val("ef-weightLb") ? Number(val("ef-weightLb")) : null,
      flavor: val("ef-flavor"),
      designNotes: val("ef-designNotes"),
      sourceMode: raw.sourceMode || "homebrew",
      // No DMG rarity-vs-value sanity check client-side (a small, purely
      // informational nicety -- see lib/rulesets/5e/itemFormulas.js's
      // rarityValueWarning()) -- left null rather than duplicating a
      // third small table here; flagged in this session's addendum.
      rarityValueWarning: raw.rarityValueWarning || null
    };
    await postConfirmEntry("items", updated);
  });

  populateFactionWrap("ef-faction-wrap", raw);

  function updateBaseItemVisibility() {
    const t = document.getElementById("ef-itemType").value;
    document.getElementById("ef-baseItem-wrap").style.display = (t === "weapon" || t === "armor") ? "" : "none";
  }
  document.getElementById("ef-itemType").addEventListener("change", updateBaseItemVisibility);
  updateBaseItemVisibility();

  return overlay;
}

// ============================================================
// Generic Items -- narrative-first, optional single attribute bonus.
// ============================================================

async function showGenericItemEditForm(entry) {
  const raw = entry.raw || {};
  const genericSystem = await getGenericSystemOrNull();
  const attrDefs = (genericSystem && genericSystem.attributes) || [];

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    <div id="ef-faction-wrap"></div>
    ${efSelect("Boosts Attribute (optional -- most items should leave this unset)", "ef-boostsAttribute", `<option value="">— none —</option>` + attrDefs.map((d) => `<option value="${d.key}" ${d.key === raw.boostsAttribute ? "selected" : ""}>${escapeHtmlForSearch(d.label)}</option>`).join(""))}
    ${efField("Boost Amount", "ef-boostAmount", raw.boostAmount, { type: "number" })}
    ${efField("Flavor", "ef-flavor", raw.flavor, { textarea: true, rows: 2 })}
    ${efField("Description", "ef-description", raw.description, { textarea: true })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Item", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const boostsAttribute = val("ef-boostsAttribute") || null;
    const updated = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      faction: val("ef-faction") || null,
      boostsAttribute,
      boostAmount: boostsAttribute && val("ef-boostAmount") ? Number(val("ef-boostAmount")) : null,
      flavor: val("ef-flavor"),
      description: val("ef-description"),
      designNotes: val("ef-designNotes"),
      sourceMode: raw.sourceMode || "homebrew"
    };
    await postConfirmEntry("items", updated);
  });

  populateFactionWrap("ef-faction-wrap", raw);
  return overlay;
}

// ============================================================
// 5e Spells -- brand-new category, no Echoes equivalent at all.
// ============================================================

const FIVEE_SPELL_SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];

function show5eSpellEditForm(entry) {
  const raw = entry.raw || {};
  const cantrip = raw.cantripBaseDamage || {};

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    <div style="display:flex; gap:12px;">
      ${efField("Level (0 = cantrip)", "ef-level", raw.level != null ? raw.level : 0, { type: "number" })}
      <div style="flex:1;">${efSelect("School", "ef-school", FIVEE_SPELL_SCHOOLS.map((s) => `<option value="${s}" ${s === raw.school ? "selected" : ""}>${s}</option>`).join(""))}</div>
    </div>
    <div style="display:flex; gap:16px; margin: 0 0 14px;">
      <label style="display:flex; align-items:center; gap:6px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-dim);"><input type="checkbox" id="ef-ritual" ${raw.ritual ? "checked" : ""}> Ritual</label>
      <label style="display:flex; align-items:center; gap:6px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-dim);"><input type="checkbox" id="ef-concentration" ${raw.concentration ? "checked" : ""}> Concentration</label>
    </div>
    ${efField("Casting Time", "ef-castingTime", raw.castingTime, { placeholder: "e.g. 1 action" })}
    ${efField("Range", "ef-range", raw.range, { placeholder: "e.g. 60 feet" })}
    ${efField("Components", "ef-components", raw.components, { placeholder: "e.g. V, S, M" })}
    ${efField("Material Component (optional)", "ef-materialComponent", raw.materialComponent)}
    ${efField("Duration", "ef-duration", raw.duration, { placeholder: "e.g. Instantaneous" })}
    ${efField("Classes (comma-separated)", "ef-classes", (raw.classes || []).join(", "))}
    ${efField("Description", "ef-description", raw.description, { textarea: true })}
    ${efField("At Higher Levels (leveled spells only)", "ef-atHigherLevels", raw.atHigherLevels, { textarea: true, rows: 2 })}
    <div id="ef-cantrip-wrap">
      ${rowHeader("Cantrip Base Damage (levels 1-4; the 5th/11th/17th-level scaling is computed automatically)")}
      <div style="display:flex; gap:12px;">
        ${efField("Dice Count", "ef-cantripDiceCount", cantrip.diceCount, { type: "number" })}
        ${efField("Die Size", "ef-cantripDieSize", cantrip.dieSize, { type: "number" })}
        ${efField("Damage Type", "ef-cantripDamageType", cantrip.damageType)}
      </div>
    </div>
    ${efField("Flavor", "ef-flavor", raw.flavor, { textarea: true, rows: 2 })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Spell", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const level = Math.max(0, Math.min(9, Math.round(Number(val("ef-level")) || 0)));
    const diceCount = val("ef-cantripDiceCount");
    const dieSize = val("ef-cantripDieSize");
    const updated = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      level,
      school: val("ef-school"),
      ritual: document.getElementById("ef-ritual").checked,
      concentration: document.getElementById("ef-concentration").checked,
      castingTime: val("ef-castingTime"),
      range: val("ef-range"),
      components: val("ef-components"),
      materialComponent: val("ef-materialComponent") || null,
      duration: val("ef-duration"),
      classes: val("ef-classes").split(",").map((s) => s.trim()).filter(Boolean),
      description: val("ef-description"),
      atHigherLevels: level > 0 ? val("ef-atHigherLevels") : null,
      cantripBaseDamage: (level === 0 && diceCount && dieSize) ? { diceCount: Number(diceCount), dieSize: Number(dieSize), damageType: val("ef-cantripDamageType") } : null,
      flavor: val("ef-flavor"),
      designNotes: val("ef-designNotes"),
      sourceMode: raw.sourceMode || "homebrew"
    };
    await postConfirmEntry("spells", updated);
  });

  function updateCantripVisibility() {
    document.getElementById("ef-cantrip-wrap").style.display = Number(document.getElementById("ef-level").value) === 0 ? "" : "none";
  }
  document.getElementById("ef-level").addEventListener("input", updateCantripVisibility);
  updateCantripVisibility();

  return overlay;
}

// ============================================================
// 5e Survivors (Player Characters) -- built on a REAL Class entry from
// this world's archive, per Phase 8's "a PC is a Class instance" rule.
// ============================================================

async function show5eSurvivorEditForm(entry) {
  const raw = entry.raw || {};
  const classOptions = await fetchCategoryOptions("classes");
  if (!classOptions.length) {
    alert("This world has no Classes yet -- generate or roll at least one Class before creating a Player Character.");
    return null;
  }
  const abilities = raw.abilities || {};

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    <div id="ef-faction-wrap"></div>
    ${efSelect("Class", "ef-classId", idSelectOptionsHtml(classOptions, raw.classId))}
    ${efField("Class Level (1-20)", "ef-classLevel", raw.classLevel || 1, { type: "number" })}
    ${rowHeader("Ability Scores")}
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 0 16px;">
      ${FIVEE_ABILITY_KEYS.map((k) => efField(k.toUpperCase(), `ef-ability-${k}`, abilities[k] != null ? abilities[k] : 10, { type: "number" })).join("")}
    </div>
    <p style="color:var(--ink-faint); font-size:0.78rem; margin:-6px 0 14px;">Hit Points, Proficiency Bonus, Saving Throw Proficiencies, Passive Perception, and Initiative recompute automatically from the chosen Class + level + ability scores + skills on save -- not editable directly.</p>
    ${rowHeader("Skill Proficiencies")}
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 4px 12px; margin-bottom: 14px;">
      ${CMF_SKILLS.map((s) => `<label style="display:flex; align-items:center; gap:6px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-dim);"><input type="checkbox" class="ef-skill-check" value="${s.key}" ${(raw.skillProficiencies || []).includes(s.key) ? "checked" : ""}> ${s.name}</label>`).join("")}
    </div>
    <div style="display:flex; gap:12px;">
      ${efField("Armor Class", "ef-armorClass", raw.armorClass || 10, { type: "number" })}
      ${efField("Armor Note (optional)", "ef-armorNote", raw.armorNote)}
    </div>
    ${efField("Equipment", "ef-equipment", raw.equipment, { textarea: true, rows: 2 })}
    ${efField("Background", "ef-background", raw.background, { textarea: true, rows: 2 })}
    ${efField("Ideals", "ef-ideals", raw.ideals)}
    ${efField("Bonds", "ef-bonds", raw.bonds)}
    ${efField("Flaws", "ef-flaws", raw.flaws)}
    ${efField("Backstory", "ef-backstory", raw.backstory, { textarea: true })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Player Character", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const chosenClass = classOptions.find((c) => c.id === val("ef-classId")) || classOptions[0];
    const chosenClassFull = await (await authFetch(`/api/entries/classes/${chosenClass.id}`)).json();
    const classContent = (chosenClassFull.entry && chosenClassFull.entry.raw) || {};
    const level = Math.max(1, Math.min(20, Math.round(Number(val("ef-classLevel")) || 1)));
    const con = Number(val("ef-ability-con")) || 10;
    const wis = Number(val("ef-ability-wis")) || 10;
    const dex = Number(val("ef-ability-dex")) || 10;
    const skillProficiencies = Array.from(document.querySelectorAll(".ef-skill-check:checked")).map((el) => el.value);
    const matchedCoreClass = cmfMatchCoreClassName(chosenClass.name);
    const savingThrowProficiencies = cmfSavingThrowProficienciesForClass(matchedCoreClass, classContent.savingThrowProficiencies);
    const proficiencyBonus = cmfProficiencyBonusForLevel(level);

    const updated = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      faction: val("ef-faction") || null,
      classId: chosenClass.id,
      className: chosenClass.name,
      classLevel: level,
      abilities: Object.fromEntries(FIVEE_ABILITY_KEYS.map((k) => [k, Number(val(`ef-ability-${k}`)) || 10])),
      skillProficiencies,
      armorClass: Number(val("ef-armorClass")) || 10,
      armorNote: val("ef-armorNote") || null,
      equipment: val("ef-equipment"),
      background: val("ef-background"),
      ideals: val("ef-ideals"),
      bonds: val("ef-bonds"),
      flaws: val("ef-flaws"),
      backstory: val("ef-backstory"),
      designNotes: val("ef-designNotes"),
      hitPoints: cmfComputeHitPoints(classContent.hitDie || "d8", level, con),
      proficiencyBonus,
      savingThrowProficiencies,
      passivePerception: cmfPassivePerception(wis, proficiencyBonus, skillProficiencies.includes("perception")),
      initiativeBonus: cmfInitiativeBonus(dex, 0),
      spellSlots: classContent.casterType && classContent.casterType !== "none" ? cmfSpellSlotsForLevel(classContent.casterType, level) : null,
      sourceMode: raw.sourceMode || "homebrew"
    };
    await postConfirmEntry("survivors", updated);
  });

  populateFactionWrap("ef-faction-wrap", raw);
  return overlay;
}

// ============================================================
// Generic Survivors (Player Characters).
// ============================================================

async function showGenericSurvivorEditForm(entry) {
  const raw = entry.raw || {};
  const genericSystem = await getGenericSystemOrNull();
  const attrDefs = (genericSystem && genericSystem.attributes) || [];
  const useFormula = !!(genericSystem && genericSystem.useFormula);
  if (!attrDefs.length) {
    alert("This world hasn't configured its homebrew attribute system yet -- finish that setup (Settings) before creating a Player Character.");
    return null;
  }
  const classOptions = await fetchCategoryOptions("classes");
  if (!classOptions.length) {
    alert("This world has no Classes yet -- generate or roll at least one Class before creating a Player Character.");
    return null;
  }
  const attrs = raw.attributes || {};

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    <div id="ef-faction-wrap"></div>
    ${efSelect("Class", "ef-classId", idSelectOptionsHtml(classOptions, raw.classId))}
    ${rowHeader("Attributes")}
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 0 16px;">
      ${attrDefs.map((def) => efField(def.label, `ef-attr-${def.key}`, attrs[def.key] != null ? attrs[def.key] : 10, { type: "number" })).join("")}
    </div>
    ${useFormula
      ? `<p style="color:var(--ink-faint); font-size:0.78rem; margin:-6px 0 14px;">Derived stats recompute automatically from these on save.</p>`
      : efField("Flavor Stats (this world has no formula layer)", "ef-flavorStats", raw.flavorStats, { textarea: true, rows: 2 })}
    ${efField("Equipment", "ef-equipment", raw.equipment, { textarea: true, rows: 2 })}
    ${efField("Background", "ef-background", raw.background, { textarea: true, rows: 2 })}
    ${efField("Backstory", "ef-backstory", raw.backstory, { textarea: true })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Player Character", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const chosenClass = classOptions.find((c) => c.id === val("ef-classId")) || classOptions[0];
    const attributes = Object.fromEntries(attrDefs.map((def) => [def.key, Number(val(`ef-attr-${def.key}`)) || 0]));
    const updated = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      faction: val("ef-faction") || null,
      classId: chosenClass.id,
      className: chosenClass.name,
      attributes,
      derivedStats: useFormula ? computeGenericDerivedStats(genericSystem, attributes) : null,
      flavorStats: useFormula ? undefined : val("ef-flavorStats"),
      equipment: val("ef-equipment"),
      background: val("ef-background"),
      backstory: val("ef-backstory"),
      designNotes: val("ef-designNotes"),
      sourceMode: raw.sourceMode || "homebrew"
    };
    await postConfirmEntry("survivors", updated);
  });

  populateFactionWrap("ef-faction-wrap", raw);
  return overlay;
}

// ============================================================
// Dispatch -- overrides render.js's handleManualCreateClick/editEntry
// (see this file's header comment for why that's safe) plus a page-local
// "Enter Manually" button injection for Spells, which has no Echoes
// EDIT_FORM_BUILDERS entry at all to gate on.
// ============================================================

const RULESET_FORM_BUILDERS = {
  enemies: { "5e": show5eEnemyEditForm, generic: showGenericEnemyEditForm },
  classes: { "5e": show5eClassEditForm, generic: showGenericClassEditForm },
  items: { "5e": show5eItemEditForm, generic: showGenericItemEditForm },
  survivors: { "5e": show5eSurvivorEditForm, generic: showGenericSurvivorEditForm },
  spells: { "5e": show5eSpellEditForm }
};

// Redeclares render.js's handleManualCreateClick -- see header comment.
// Falls back to the exact original Echoes behavior (EDIT_FORM_BUILDERS)
// for an 'echoes' world, an unrecognized ruleset, or a category/ruleset
// combo with no ruleset-specific form (fail open to the long-established
// default, same convention every ruleset-aware frontend form in this
// project already follows).
async function handleManualCreateClick(category) {
  const ruleset = await getWorldRuleset();
  const byRuleset = RULESET_FORM_BUILDERS[category];
  const builder = byRuleset && byRuleset[ruleset];
  if (builder) {
    const id = generateManualEntryId(category);
    const stub = buildBlankEntryStub(category, id);
    currentEditCategory = category;
    await builder(stub);
    return;
  }
  if (!EDIT_FORM_BUILDERS[category]) return;
  const id = generateManualEntryId(category);
  const stub = buildBlankEntryStub(category, id);
  currentEditCategory = category;
  EDIT_FORM_BUILDERS[category](stub);
}

// Redeclares render.js's editEntry -- same fallback reasoning as above.
// Reads the ruleset straight off the fetched entry (every ruleset-aware
// save*Entry writer stamps `ruleset` onto entryMeta -- see
// lib/rulesets/5e/enemyRepo.js etc.) rather than a second network call.
async function editEntry(categoryPath, id, btnEl) {
  const byRuleset = RULESET_FORM_BUILDERS[categoryPath];
  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "Loading…";
  try {
    const res = await authFetch(`/api/entries/${categoryPath}/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load entry.");
    currentEditCategory = categoryPath;
    const builder = byRuleset && byRuleset[data.entry.ruleset];
    if (builder) {
      await builder(data.entry);
      return;
    }
    if (!EDIT_FORM_BUILDERS[categoryPath]) return;
    EDIT_FORM_BUILDERS[categoryPath](data.entry);
  } catch (err) {
    alert("Couldn't open editor: " + err.message);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = originalText;
  }
}

// Spells has no Echoes manual form to gate the Stage-1 button's
// visibility on (EDIT_FORM_BUILDERS.spells doesn't exist), so
// wireCreateEntryCollapse() never renders one there. Injects it
// page-locally, same `whenReady` polling pattern
// archive/enemies/index.html's promoteImportToStage1() already
// established for the same "add a Stage-1 button this shared function
// doesn't know about" problem -- only actually shown once the ruleset
// lookup confirms this world can use it (5e); every other ruleset has no
// Spells category at all (per world_forge_scope.md's registry), so
// there's nothing useful the button could do there.
function promoteSpellsManualButton() {
  if (document.body.dataset.category !== "spells") return;
  function whenReady(selector, cb, tries) {
    tries = tries == null ? 40 : tries;
    const el = document.querySelector(selector);
    if (el) return cb(el);
    if (tries <= 0) return;
    requestAnimationFrame(() => whenReady(selector, cb, tries - 1));
  }
  whenReady("#create-entry-stage1-row", async (stage1Row) => {
    if (document.getElementById("create-entry-manual-btn")) return; // Echoes never has one for spells; only skip if already injected
    const ruleset = await getWorldRuleset();
    if (ruleset !== "5e") return;
    const proceduralBtn = document.getElementById("create-entry-procedural-btn");
    const manualBtn = document.createElement("button");
    manualBtn.type = "button";
    manualBtn.id = "create-entry-manual-btn";
    manualBtn.textContent = "Enter Manually";
    manualBtn.style.cssText = "background: var(--bg-panel-raised); color: var(--ink); border: 1px solid var(--border-line); padding: 10px 20px; font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; font-weight: 600;";
    manualBtn.addEventListener("click", () => handleManualCreateClick("spells"));
    stage1Row.insertBefore(manualBtn, proceduralBtn || null);
  });
}
document.addEventListener("DOMContentLoaded", promoteSpellsManualButton);
