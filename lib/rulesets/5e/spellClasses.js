// lib/rulesets/5e/spellClasses.js
//
// Decides which classes a spell belongs to. Spells attach ONLY to classes
// that already exist in this world's Classes category, never to a name
// the model (or an SRD row, or a procedural seed table) brought along.
//
// Why: spell.classes is a Category A link field (lib/entryLinkRegistry.js),
// so lib/entryLinker.js turns every unmatched name into a locked ghost
// placeholder. The Homebrew prompt used to show the model a literal
// `"classes": ["Wizard", "Sorcerer"]` example and never showed it this
// world's real classes, so a cyberpunk world got spells for "Wizard" and
// "Rogue" plus empty Wizard/Rogue ghosts on its Classes page.
//
// The rule, per Austin:
//   - The world has classes (placeholders count too): the model picks
//     1-3 from that list, and anything else it returns is dropped here.
//   - The world has NO classes: the model invents exactly one
//     setting-appropriate class (name + one-line concept). It's saved as a
//     locked placeholder whose subtitle holds the concept, so the Classes
//     page's "Fill In" button builds a full class from it later (see
//     routes/generateClass.js's handle5eClassGenerate, which feeds the
//     placeholder's concept back into the class prompt). This only ever
//     happens while zero classes exist.
//   - Import (no AI call) keeps only the SRD classes that exactly match a
//     class in this world. No stub: there's no model to invent a fitting
//     one, and a stub named after an SRD class would recreate the bug.

const { listEntries, getEntry, upsertEntry } = require("../../entriesRepo");
const { normalizeNameForMatch } = require("../../entryLinker");
const { slugify } = require("./spellTemplate");

const MAX_SPELL_CLASSES = 3;

// Every class in the world, placeholders included -- a locked stub is
// still "a class that exists" for the "only invent one if none exist"
// rule, and a spell can link to it before it's filled in.
async function getWorldClassNames(worldId) {
  const entries = await listEntries(worldId, "classes");
  return entries.map((e) => e.name).filter(Boolean);
}

// The dynamic half of the Homebrew/Reflavor prompts' class rule. The
// static half (never default to standard D&D class names) lives in
// prompts/rulesets/5e/spellContentPrompt.js's cacheable block.
function formatWorldClassesForPrompt(worldClassNames) {
  if (worldClassNames.length) {
    return `CLASSES IN THIS WORLD ("classes" must be 1-${MAX_SPELL_CLASSES} of these names, copied exactly -- pick the ones whose concept best fits this spell; set "newClass" to null):
${worldClassNames.map((n) => `- ${n}`).join("\n")}`;
  }
  return `CLASSES IN THIS WORLD: none yet. Invent exactly ONE class that fits this setting and would plausibly wield this spell, and return it as "newClass": { "name": "...", "concept": "one sentence: who they are and how they use this kind of power" }. Set "classes" to [that same name]. Do not reuse a standard D&D class name unless the setting is classic high fantasy.`;
}

// Canonical world spellings of whichever proposed names exactly match a
// world class (same normalization the entry linker uses, so a match here
// is guaranteed to link rather than spawn a ghost). Deduped, capped.
function filterToWorldClasses(proposed, worldClassNames) {
  const byKey = new Map(worldClassNames.map((n) => [normalizeNameForMatch(n), n]));
  const out = [];
  for (const item of Array.isArray(proposed) ? proposed : []) {
    // Strings from the model/SRD/seed tables; {name, id} objects once
    // lib/entryLinker.js has linked a saved spell's classes.
    const name = item && typeof item === "object" ? item.name : item;
    const match = byKey.get(normalizeNameForMatch(name));
    if (match && !out.includes(match)) out.push(match);
  }
  return out.slice(0, MAX_SPELL_CLASSES);
}

// Saves the "no classes yet" stub as a locked placeholder. Same row shape
// as entryLinker.js's ensureGhostPlaceholder (and the same slug, so a
// later real class with this name overwrites it), plus the concept in
// subtitle -- shown on the locked card, and read back on Fill In.
async function createClassStub(worldId, newClass) {
  const name = String(newClass.name).trim();
  const id = slugify(name);
  const existing = await getEntry(worldId, "classes", id);
  if (existing) return existing.name || name;
  const concept = newClass.concept ? String(newClass.concept).trim() : null;
  await upsertEntry(worldId, "classes", { id, name, subtitle: concept, faction: null, tags: [], bodyHtml: null, raw: null }, { locked: true });
  return name;
}

// For AI tiers (Homebrew, Reflavor). Returns the final spell.classes.
// Re-reads the class list rather than trusting the one the prompt was
// built from, so a class created mid-generation (another tab) counts.
async function resolveSpellClasses(worldId, { proposedClasses, newClass }) {
  const worldClassNames = await getWorldClassNames(worldId);
  if (worldClassNames.length) return filterToWorldClasses(proposedClasses, worldClassNames);
  if (newClass && newClass.name && String(newClass.name).trim()) {
    return [await createClassStub(worldId, newClass)];
  }
  return [];
}

module.exports = {
  MAX_SPELL_CLASSES,
  getWorldClassNames,
  formatWorldClassesForPrompt,
  filterToWorldClasses,
  resolveSpellClasses
};
