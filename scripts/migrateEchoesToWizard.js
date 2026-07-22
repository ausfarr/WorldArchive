// scripts/migrateEchoesToWizard.js
//
// One-time migration: pulls Austin's real Echoes World Bible
// (lore/world_bible_sections.json, still in the repo) and the retired
// FACTION_SEEDS map (previously hardcoded in routes/generateFaction.js,
// preserved here below) into a real world's lore_sections + factions_json
// + entries table — the same shape any other world gets by going through
// the Wizard, just scripted end-to-end instead of clicked through 5+ times.
//
// This exists because Phase 3 retired the legacy Echoes-hardcoded
// generator path entirely (world_bible_sections.json / FACTION_SEEDS are
// no longer read by any live route) — Austin's own Echoes archive needs
// to go through the generic Wizard-backed system too, same as any other
// world would, rather than being a permanent special case. Originally
// scoped for Phase 6 ("migrate Echoes in as user #1"), pulled forward
// into this Phase 3 push per this session's decision.
//
// USAGE (run once, from the deployed environment where SUPABASE_*/
// ANTHROPIC_API_KEY are already set — e.g. a Railway shell, or locally
// with a .env pointed at the real project):
//
//   node scripts/migrateEchoesToWizard.js <worldId>
//
// <worldId> is Austin's own worlds.id row (find it via Supabase's Table
// Editor -- worlds table, filtered to his user_id).
//
// What it does, in order:
//   1. Imports all 30 World Bible sections into lore_sections (source:
//      "imported"), replacing anything currently there for this world.
//   2. For each of the 5 legacy factions, runs the SAME "invent/fill"
//      generator the Wizard's own Factions step uses (grounded in the
//      lore just imported), saves it to world_config.factions_json, and
//      backfills faction_tags.
//   3. Immediately expands each into a full Deep Lore dossier via the
//      same generator routes/generate-faction now uses, and writes it to
//      the entries table -- so the live Factions page is fully populated
//      right away instead of needing 5 manual "Regenerate" clicks.
//
// Idempotent-ish: re-running replaces lore_sections and factions_json
// wholesale (matching their existing "replace, don't append" design) and
// upserts entries by id -- safe to re-run if something fails partway.

const { callClaude, parseJsonResponse } = require("../lib/claude");
const { replaceLoreSections, backfillFactionTags } = require("../lib/loreRepo");
const { saveFactions } = require("../lib/worldConfigRepo");
const { getLoreContext } = require("../lib/loreContext");
const { buildWizardFactionSystemPrompt } = require("../prompts/wizardFactionPrompt");
const { buildFactionContentSystemPrompt } = require("../prompts/factionContentPrompt");
const { buildFactionBodyHtml } = require("../lib/factionTemplate");
const { buildFactionRoundup } = require("../lib/factionRoundup");
const { upsertEntry } = require("../lib/entriesRepo");
const worldBibleSections = require("../lore/world_bible_sections.json");

// Preserved from the retired routes/generateFaction.js -- see this
// session's chat for the full removal. Kept here ONLY as the seed input
// for this one-time migration, not as a live code path.
//
// Two separate identifiers per faction, both preserved from the legacy
// system on purpose:
//   - id: the slug used for the entries-table row + dossier URLs
//     (?category=factions&id=the-ferro-kings) -- unchanged from before.
//   - factionKey: the SHORT key Austin's existing NPCs/enemies/logs
//     already carry in their own `faction` field (e.g. adaeze-okonkwo.js
//     has "faction": "ferro_kings", not "the-ferro-kings") and that
//     archive/js/render.js's FACTION_COLORS map keys its CSS accent
//     lookup on. Using the slug here instead would silently break both
//     Roundup matching (buildFactionRoundup filters on exact string
//     equality) and the faction's own accent color for every one of
//     Austin's pre-existing entries -- this distinction is NOT needed
//     for brand-new generic worlds (which have no legacy short-key data
//     to match), only for this one-time migration.
const LEGACY_FACTION_SEEDS = [
  {
    id: "the-preservation",
    factionKey: "preservation",
    name: "The Preservation",
    concept: `AI-driven faction seeking to freeze the city in Stasis. Sterile, white, ice-blue aesthetic. Cold, procedural, bureaucratic control — enforcement via security systems and drones, quarantine logic, protocol over personality.`
  },
  {
    id: "the-ferro-kings",
    factionKey: "ferro_kings",
    name: "The Ferro-Kings",
    concept: `Brutal warlords controlling the factories. Value physical strength and heavy armor. See the apocalypse as a return to a harder, purer order. Brutal industrial tone — foremen, enforcers, factory-floor violence, shop-floor slang. Already-established leadership: Adaeze Okonkwo ("The Foreman").`
  },
  {
    id: "the-board",
    factionKey: "the_board",
    name: "The Board",
    concept: `Delusional executives operating from the Sky-Needle. Treat the apocalypse as a hostile takeover to manage and monetize. Darkly comic corporate-horror tone — quarterly-report language applied to violence and survival.`
  },
  {
    id: "glitch-kin",
    factionKey: "glitch_kin",
    name: "Glitch-Kin",
    concept: `Mutated horrors — humans fully overtaken by nanites trying (badly) to "fix" them. Functionally a force of nature, not an army with intent. Body-horror tone. Networked; no real hierarchy in the human sense — frame any "leader" as an emergent hub-node, not a person who gives orders.`
  },
  {
    id: "the-colony",
    factionKey: "colony",
    name: "The Colony (The Silo)",
    concept: `The player's own home base — not one of the four antagonist factions, no fixed territory of its own, survives by scavenging and trading in the gaps between the other four. Community/survival tone rather than a power bloc: internal roles matter more than doctrine or conquest. No single ruler.`
  }
];

function log(...args) {
  console.log("[migrateEchoesToWizard]", ...args);
}

async function importLore(worldId) {
  log(`Importing ${worldBibleSections.length} World Bible sections...`);
  const sections = worldBibleSections.map((s, i) => ({
    title: `${s.part}: ${s.title}`,
    content: s.content,
    categoryTags: s.categoryTags || [],
    core: !!s.core,
    position: i
  }));
  const rawText = worldBibleSections.map((s) => `## ${s.part}: ${s.title}\n${s.content}`).join("\n\n---\n\n");
  await replaceLoreSections(worldId, sections, rawText, "imported");
  log("Lore import done.");
}

async function seedOneFaction(worldId, seed, existingFactions) {
  log(`Generating wizard-level concept for ${seed.name}...`);
  const loreContext = await getLoreContext(worldId, { category: "factions" });
  const systemPrompt = buildWizardFactionSystemPrompt({
    loreContext,
    existingFactions,
    name: seed.name,
    concept: seed.concept,
    mode: "fill"
  });
  const raw = await callClaude({ systemPrompt, userMessage: "Generate the faction now.", maxTokens: 2500 });
  const faction = parseJsonResponse(raw);
  faction.id = seed.id; // pin to the legacy slug so old dossier URLs (?category=factions&id=the-ferro-kings) keep working
  faction.factionKey = seed.factionKey; // legacy short key -- see LEGACY_FACTION_SEEDS comment above
  return faction;
}

async function expandOneFactionDeepLore(worldId, faction, allFactionNames) {
  log(`Expanding Deep Lore for ${faction.name}...`);
  const seedText = [faction.concept, faction.politics, faction.government, faction.economy, faction.military, faction.tensions]
    .filter(Boolean)
    .join("\n\n");
  const loreContext = await getLoreContext(worldId, { category: "factions", faction: faction.factionKey });
  const otherFactionNames = allFactionNames.filter((n) => n !== faction.name);
  const roundupRows = await buildFactionRoundup(worldId, faction.factionKey);
  const roundupContext = roundupRows.length === 0
    ? "Nothing archived for this faction yet."
    : roundupRows.map((r) => `- ${r.type}: ${r.name}${r.note ? ` (${r.note})` : ""}`).join("\n");

  const systemPrompt = buildFactionContentSystemPrompt({
    factionName: faction.name,
    seedText,
    loreContext,
    roundupContext,
    otherFactionNames,
    existingContent: null
  });
  const raw = await callClaude({ systemPrompt, userMessage: "Generate the Deep Lore section now.", maxTokens: 2500 });
  const deepLore = parseJsonResponse(raw);

  const fullFaction = { id: faction.id, factionKey: faction.factionKey, name: faction.name, ...deepLore };
  const bodyHtml = buildFactionBodyHtml(fullFaction, roundupRows);

  await upsertEntry(worldId, "factions", {
    id: fullFaction.id,
    name: fullFaction.name,
    subtitle: `Epithet: "${fullFaction.nickname || ""}"`,
    faction: fullFaction.factionKey,
    tags: [],
    bodyHtml,
    raw: fullFaction,
    footer: ["Source: migrated from Echoes World Bible via scripts/migrateEchoesToWizard.js"]
  });
  log(`Saved dossier for ${faction.name}.`);
}

async function main() {
  const worldId = process.argv[2];
  if (!worldId) {
    console.error("Usage: node scripts/migrateEchoesToWizard.js <worldId>");
    process.exit(1);
  }

  await importLore(worldId);

  const savedFactions = [];
  for (const seed of LEGACY_FACTION_SEEDS) {
    const faction = await seedOneFaction(worldId, seed, savedFactions);
    savedFactions.push(faction);
  }
  await saveFactions(worldId, savedFactions);
  await backfillFactionTags(worldId, savedFactions.map((f) => f.factionKey));
  log(`Saved ${savedFactions.length} factions to world_config.factions_json.`);

  const allNames = savedFactions.map((f) => f.name);
  for (const faction of savedFactions) {
    await expandOneFactionDeepLore(worldId, faction, allNames);
  }

  log("Done. Faction dossiers use the legacy short-key convention (ferro_kings, etc.) for their `faction` field, matching every pre-existing NPC/enemy/log entry, so Roundup tables and CSS accent colors should already be correct on the live Factions page — spot-check it to confirm.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
