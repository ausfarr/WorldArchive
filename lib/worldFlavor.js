// lib/worldFlavor.js
//
// Shared per-world grounding helpers used by every generic content prompt
// builder (prompts/*ContentPrompt.js), replacing the pieces that used to
// be hardcoded per-file for "Echoes of the Neon": the setting framing
// sentence, the faction list + enum, and the six attribute labels.
//
// This is the Phase 3 genericization counterpart to lib/loreContext.js
// (lore grounding) and lib/worldConfigRepo.js (raw config access) — pulls
// them together into prompt-ready blocks so every *ContentPrompt.js file
// doesn't reimplement the same formatting.

const { getDraft, getFactions, getStatSystem, getStyleGuide } = require("./worldConfigRepo");
const { readFactionManifest } = require("./roster");

// Step 1 (Seed & Vision) lives in draft_json["1"] — it's the one wizard
// step that was never moved to progressive-commit (see the addendum: only
// Lore onward writes to a real destination on save). Reading it here is a
// deliberate soft dependency on that draft persisting, same as the
// wizard's own Step 8 review screen already relies on.
async function getSettingContext(worldId) {
  const draft = await getDraft(worldId);
  const s1 = (draft && draft["1"]) || {};
  const parts = [
    s1.worldName ? `World name: ${s1.worldName}` : null,
    s1.genre ? `Genre & tone: ${Array.isArray(s1.genre) ? s1.genre.join(", ") : s1.genre}` : null,
    s1.scale ? `Scale: ${s1.scale}` : null,
    s1.era ? `Era/tech level: ${s1.era}` : null,
    s1.supernaturalSystem ? `Supernatural/speculative system: ${s1.supernaturalSystem}` : null,
    s1.coreTension ? `Core tension: ${s1.coreTension}` : null,
    s1.inspirations ? `Inspirations/touchstones: ${s1.inspirations}` : null,
    s1.nonNegotiables ? `Non-negotiables (hard rules — never violate these): ${s1.nonNegotiables}` : null
  ].filter(Boolean);
  return parts.length
    ? parts.join("\n")
    : "(no setting details defined yet for this world — infer general genre conventions from the lore below)";
}

// Faction options come from the LIVE ARCHIVE (readFactionManifest), not
// world_config.factions_json — a generation call should only ever offer
// factions a reader could actually click through to, same reasoning as
// generateFaction.js's otherFactionNames fix.
//
// Returns each faction's own `.faction` field (its matching key — what
// other entries' `faction` field must equal for Roundup/roster matching
// to find them) when it's set, falling back to the entry's own `.id`
// when it's null (a brand-new wizard-created faction that's never been
// through a Deep Lore regenerate yet — see routes/generateFaction.js's
// identical fallback). These are usually the same value, EXCEPT for
// Austin's migrated Echoes world, where legacy entries use short keys
// (ferro_kings) distinct from their dossier-URL slug (the-ferro-kings) —
// see scripts/migrateEchoesToWizard.js's header comment for why that
// split exists. Using `.faction` here (not `.id`) keeps new generations
// consistent with whatever convention this world's faction actually uses.
async function getFactionOptions(worldId) {
  const manifest = await readFactionManifest(worldId);
  return manifest.map((m) => ({ id: m.faction || m.id, name: m.name }));
}

// Formats the faction list for a prompt's "pick one of these ids" schema
// instruction. Every generic schema should use these bare ids as its
// faction enum instead of a hardcoded 4-5 value list.
function formatFactionOptionsForPrompt(factions) {
  if (!factions || factions.length === 0) {
    return "(no factions exist in this world yet — use null or \"unaligned\" for any faction field)";
  }
  return factions.map((f) => `- id: "${f.id}" — ${f.name}`).join("\n");
}

const DEFAULT_STAT_LABELS = {
  body: { label: "Body", description: "physical power/toughness" },
  reflex: { label: "Reflex", description: "speed and reaction" },
  knowledge: { label: "Knowledge", description: "mental capacity/proficiency" },
  presence: { label: "Presence", description: "force of personality/influence" },
  sanity: { label: "Sanity", description: "mental stability/willpower" },
  fate: { label: "Fate", description: "luck/destiny" }
};

// Underlying attribute KEYS (body/reflex/knowledge/presence/sanity/fate)
// are fixed everywhere the mechanics actually depend on them — every
// schema below still asks the model to output those exact lowercase keys.
// Only the LABEL/DESCRIPTION text shown in the prompt (and therefore what
// ends up in flavor/scaling text) is world-specific. Falls back to plain
// English defaults for any world that hasn't run Wizard Step 5 yet.
async function getStatLabels(worldId) {
  const saved = await getStatSystem(worldId);
  if (!saved) return DEFAULT_STAT_LABELS;
  const merged = {};
  for (const key of Object.keys(DEFAULT_STAT_LABELS)) {
    merged[key] = saved[key] && saved[key].label ? saved[key] : DEFAULT_STAT_LABELS[key];
  }
  return merged;
}

function formatStatLabelsForPrompt(statLabels) {
  return Object.entries(statLabels)
    .map(([key, v]) => `- ${key} → "${v.label}"${v.description ? ` — ${v.description}` : ""}`)
    .join("\n");
}

// Resolves a faction key/id to its real display name for THIS world,
// via the live archive (same source as getFactionOptions). Replaces the
// hardcoded FACTION_LABEL maps that used to live separately in each
// *Template.js file (entryTemplate.js, enemyTemplate.js, logTemplate.js)
// — those were fixed to Echoes' 4 factions and silently fell back to
// "Unaligned" (or, in logTemplate.js's case, the literal string
// "undefined") for any faction outside that list, which is the bug this
// replaces. fallbackLabel lets callers match their own prior wording for
// "no faction" (NPCs/enemies said "Unaligned"; logs said "Personal").
async function resolveFactionLabel(worldId, factionKey, fallbackLabel = "Unaligned") {
  if (!factionKey || factionKey === "unaligned") return fallbackLabel;
  const options = await getFactionOptions(worldId);
  const match = options.find((f) => f.id === factionKey);
  // If genuinely not found (e.g. a stale/renamed faction), show the raw
  // key rather than silently mislabeling it as unaligned/personal.
  return match ? match.name : factionKey;
}

// Resolves a faction's own accent color/notes (assigned in Wizard Step 6
// -- see routes/wizardStyleGuide.js's generate-faction-accents +
// save-style-guide bridge) plus its display name, for
// prompts/artPromptPrompt.js. Takes an already-fetched styleGuide rather
// than fetching it itself, since callers generating art for several
// entries in one request would otherwise refetch it redundantly. Returns
// null if this faction has no accent assigned yet (world hasn't run Step
// 6's faction-accents generation, or this faction was added afterward) --
// the art prompt builder treats null as "nothing faction-specific to
// call out," same graceful-degradation pattern as every other generic
// prompt builder in this file.
async function getFactionAccent(worldId, styleGuide, factionKey) {
  if (!factionKey || factionKey === "unaligned") return null;
  const accents = (styleGuide && styleGuide.factionAccents) || [];
  const accent = accents.find((a) => a.id === factionKey);
  if (!accent || (!accent.accentColor && !accent.accentNotes)) return null;
  const options = await getFactionOptions(worldId);
  const match = options.find((f) => f.id === factionKey);
  return {
    id: factionKey,
    name: match ? match.name : factionKey,
    accentColor: accent.accentColor || null,
    accentNotes: accent.accentNotes || null
  };
}

module.exports = {
  getSettingContext,
  getFactionOptions,
  formatFactionOptionsForPrompt,
  getStatLabels,
  formatStatLabelsForPrompt,
  resolveFactionLabel,
  getFactionAccent,
  getStyleGuide,
  DEFAULT_STAT_LABELS
};
