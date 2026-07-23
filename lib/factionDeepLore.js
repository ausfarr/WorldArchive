// lib/factionDeepLore.js
//
// Generates a fresh faction "Deep Lore" object (Origin/Core Philosophy/
// Structure & Hierarchy/Territory/Goals/Internal Tensions/Iconography/
// Relationships/Economy & Resources/Joining) for an EXISTING faction
// entry, without saving it. Factored out of routes/generateFaction.js so
// the same logic can be called two ways:
//
//   1. Manual "Regenerate" button -> preview -> user reviews -> confirm
//      (routes/generateFaction.js + routes/confirmEntry.js, unchanged).
//   2. Automatic first-pass upgrade, run once for every faction right
//      when the World Setup Wizard is confirmed (routes/wizardReview.js)
//      -- no preview step, straight to save, since this is upgrading the
//      wizard's own simplified stub layout to the real template rather
//      than revising existing Deep Lore content a person might want to
//      compare against first.

const { callClaude, parseJsonResponse } = require("./claude");
const { readFactionManifest, readFactionEntry } = require("./roster");
const { getFactions, getStyleGuide } = require("./worldConfigRepo");
const { getLoreContext } = require("./loreContext");
const { buildFactionContentSystemPrompt } = require("../prompts/factionContentPrompt");
const { buildWizardFactionSystemPrompt } = require("../prompts/wizardFactionPrompt");
const { buildFactionAccentsSystemPrompt } = require("../prompts/wizardStyleGuidePrompt");
const { buildFactionRoundup } = require("./factionRoundup");

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function slugify(name) {
  return (name || "faction")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "faction";
}

// Formats a wizard-generated faction's seed fields (concept/politics/
// government/economy/military/tensions) into the plain-text block this
// used to get from the hardcoded FACTION_SEEDS map. Falls back to just
// the concept line if a faction predates some of these fields.
function formatFactionSeed(faction) {
  if (!faction) return "";
  const parts = [];
  if (faction.concept) parts.push(faction.concept);
  if (faction.politics) parts.push(`Politics: ${faction.politics}`);
  if (faction.government) parts.push(`Government: ${faction.government}`);
  if (faction.economy) parts.push(`Economy: ${faction.economy}`);
  if (faction.military) parts.push(`Military: ${faction.military}`);
  if (faction.tensions) parts.push(`Tensions: ${faction.tensions}`);
  return parts.join("\n\n");
}

// Returns { faction, roundupRows, priorBodyHtml } -- does NOT write
// anything. `faction` is ready to pass straight to
// lib/factionTemplate.js's buildFactionBodyHtml() or
// lib/fileWriter.js's saveFactionEntry().
async function generateFactionDeepLore(worldId, fillExistingId) {
  // This faction must already exist in the live archive (bridged in by
  // routes/wizardFactions.js's save-factions step) -- this only expands/
  // revises Deep Lore, it never invents a brand-new faction from nothing.
  const manifest = await readFactionManifest(worldId);
  const existingEntry = manifest.find((m) => m.id === fillExistingId);
  if (!existingEntry) {
    throw new Error(`No existing faction entry found with id '${fillExistingId}'. Create it first via the World Setup Wizard's Factions step.`);
  }

  // Factions have no locked/unlocked distinction -- every call here is
  // effectively a regenerate. priorRaw is null for entries that predate
  // the `raw` field (or were only ever bridged from the wizard, which
  // stores the simpler wizard schema, not this Deep Lore schema) -- the
  // model just generates fresh against the seed + roundup rather than
  // truly revising, same self-healing behavior used elsewhere.
  const prior = await readFactionEntry(worldId, fillExistingId);
  const priorRaw = prior && prior.raw && prior.raw.origin ? prior.raw : null;
  const priorBodyHtml = prior ? prior.bodyHtml : null;

  // factionKey: use the faction's own id as the matching key for the
  // Roundup and any accent lookup -- generic worlds don't have a fixed
  // 5-key enum the way Echoes did, so entries authored for this faction
  // just need faction === this id.
  const factionKey = existingEntry.faction || existingEntry.id;

  // Seed: prefer this faction's own wizard-generated concept/politics/
  // etc. (world_config.factions_json), falling back to whatever's in the
  // bridged entries-table raw data if the wizard record is gone.
  const wizardFactions = await getFactions(worldId);
  const wizardFaction = wizardFactions.find((f) => f.id === fillExistingId);
  const seedText = wizardFaction ? formatFactionSeed(wizardFaction) : formatFactionSeed(prior && prior.raw);

  // The model has no other way to know what factions actually exist in
  // this world -- without this list it will invent plausible-sounding
  // rival names for the `relationships` field instead of referencing
  // real ones. Built from the live archive, not world_config, so it
  // reflects exactly what a reader could actually click through to.
  const otherFactionNames = manifest
    .filter((m) => m.id !== fillExistingId)
    .map((m) => m.name);

  const loreContext = await getLoreContext(worldId, { category: "factions", faction: factionKey });

  // Roundup is built FIRST and deterministically -- it's both the output
  // section and context fed to the model, never invented either way.
  const roundupRows = await buildFactionRoundup(worldId, factionKey);
  const roundupContext = roundupRows.length === 0
    ? "Nothing archived for this faction yet."
    : roundupRows.map((r) => `- ${r.type}: ${r.name}${r.note ? ` (${r.note})` : ""}`).join("\n");

  const contentSystemPrompt = buildFactionContentSystemPrompt({
    factionName: existingEntry.name,
    seedText,
    loreContext,
    roundupContext,
    otherFactionNames,
    existingContent: priorRaw
  });
  const contentRaw = await callClaude({
    systemPrompt: contentSystemPrompt,
    userMessage: "Generate the Deep Lore section now.",
    maxTokens: 2500
  });
  let deepLore;
  try {
    deepLore = parseJsonResponse(contentRaw);
  } catch (parseErr) {
    console.error("Failed to parse faction JSON. Raw response length:", contentRaw.length);
    console.error("Raw response (last 300 chars):", contentRaw.slice(-300));
    throw new Error(`Faction content was not valid JSON (likely truncated — response was ${contentRaw.length} chars): ${parseErr.message}`);
  }

  const faction = {
    id: fillExistingId,
    factionKey,
    name: existingEntry.name,
    ...deepLore
  };

  return { faction, roundupRows, priorBodyHtml };
}

// Creates a brand-new faction from scratch -- name and concept/description
// are both optional, same as every other category's "Generate New Entry"
// panel. Unlike generateFactionDeepLore() above, there's no existing entry
// to expand: this generates the wizard-style seed (concept/politics/
// government/economy/military/tensions -- same schema and prompt as the
// wizard's per-slot "Generate for me", see prompts/wizardFactionPrompt.js)
// and then immediately expands that seed into full Deep Lore in the same
// call, so a faction created here comes out fully-formed on the first
// generation, same as an npc/enemy/item -- not the two-tier wizard-stub-
// then-manual-regenerate flow that wizard-bridged factions go through.
//
// Also assigns an accent color, unlike the wizard's own Step 4 (which
// deliberately doesn't -- see prompts/wizardFactionPrompt.js's header
// comment). The difference: by the time someone's creating a faction
// here, post-setup, the world's Style Guide already exists (Step 6 has
// already run), so there IS real base-palette context to ground a color
// choice in -- the exact context that was missing at wizard Step 4 time.
// Reuses the same batched accents prompt the Style Guide step itself
// uses (prompts/wizardStyleGuidePrompt.js's buildFactionAccentsSystemPrompt),
// scoped to just this one new faction plus the existing roster for
// distinctness context, rather than re-rolling colors for factions that
// already have one.
async function createNewFaction(worldId, { name, concept } = {}) {
  const manifest = await readFactionManifest(worldId);
  const loreContext = await getLoreContext(worldId, { category: "factions" });
  const mode = name ? "fill" : "invent";

  const seedSystemPrompt = buildWizardFactionSystemPrompt({
    loreContext,
    existingFactions: manifest.map((m) => ({ name: m.name })),
    name,
    concept,
    mode
  });
  const seedRaw = await callClaude({
    systemPrompt: seedSystemPrompt,
    userMessage: "Generate the faction now.",
    maxTokens: 1200
  });
  let seed;
  try {
    seed = parseJsonResponse(seedRaw);
  } catch (parseErr) {
    throw new Error(`Faction seed was not valid JSON (likely truncated — response was ${seedRaw.length} chars): ${parseErr.message}`);
  }

  // Dedupe against existing ids -- two factions with the same/similar
  // name (e.g. two separate "The Watch" generations) shouldn't collide
  // and silently overwrite one another.
  const existingIds = new Set(manifest.map((m) => m.id));
  let id = slugify(seed.name);
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${slugify(seed.name)}-${suffix}`;
    suffix += 1;
  }
  seed.id = id;

  const seedText = formatFactionSeed(seed);
  const otherFactionNames = manifest.map((m) => m.name);
  // Brand new -- nothing in the archive references this faction yet.
  const roundupRows = await buildFactionRoundup(worldId, id);
  const roundupContext = "Nothing archived for this faction yet.";

  const contentSystemPrompt = buildFactionContentSystemPrompt({
    factionName: seed.name,
    seedText,
    loreContext,
    roundupContext,
    otherFactionNames,
    existingContent: null
  });
  const contentRaw = await callClaude({
    systemPrompt: contentSystemPrompt,
    userMessage: "Generate the Deep Lore section now.",
    maxTokens: 2500
  });
  let deepLore;
  try {
    deepLore = parseJsonResponse(contentRaw);
  } catch (parseErr) {
    throw new Error(`Faction content was not valid JSON (likely truncated — response was ${contentRaw.length} chars): ${parseErr.message}`);
  }

  const faction = {
    id,
    factionKey: id,
    name: seed.name,
    concept: seed.concept,
    politics: seed.politics,
    government: seed.government,
    economy: seed.economy,
    military: seed.military,
    tensions: seed.tensions,
    ...deepLore,
    accentColor: null
  };

  // Color generation is a nice-to-have, not load-bearing -- a failure
  // here (bad JSON, no style guide yet, etc.) shouldn't fail faction
  // creation. Falls back to the same graceful cyan-default rendering
  // path every other colorless faction already uses.
  try {
    const styleGuide = await getStyleGuide(worldId);
    const colorContextFactions = manifest.map((m) => ({ id: m.id, name: m.name, accentColor: m.accentColor }))
      .concat([{ id, name: seed.name, concept: seed.concept }]);
    const accentsPrompt = buildFactionAccentsSystemPrompt({ baseStyle: styleGuide, factions: colorContextFactions });
    const accentsRaw = await callClaude({
      systemPrompt: accentsPrompt,
      userMessage: "Generate the faction accent colors now.",
      maxTokens: 1500
    });
    const parsed = parseJsonResponse(accentsRaw);
    const mine = ((parsed && parsed.factionAccents) || []).find((fa) => fa.id === id);
    if (mine && HEX_COLOR_RE.test(mine.accentColorHex)) {
      faction.accentColor = mine.accentColorHex;
    }
  } catch (colorErr) {
    console.error(`Accent color generation failed for new faction '${id}', leaving unset:`, colorErr.message);
  }

  return { faction, roundupRows };
}

module.exports = { generateFactionDeepLore, createNewFaction };
