const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { readFactionManifest, readFactionEntry } = require("../lib/roster");
const { getFactions } = require("../lib/worldConfigRepo");
const { getLoreContext } = require("../lib/loreContext");
const { buildFactionContentSystemPrompt } = require("../prompts/factionContentPrompt");
const { buildFactionRoundup } = require("../lib/factionRoundup");
const { buildFactionBodyHtml } = require("../lib/factionTemplate");

const router = express.Router();

// Formats a wizard-generated faction's seed fields (concept/politics/
// government/economy/military/tensions) into the plain-text block this
// route used to get from the hardcoded FACTION_SEEDS map. Falls back to
// just the concept line if a faction predates some of these fields.
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

router.post("/generate-faction", async (req, res) => {
  try {
    const worldId = req.worldId;
    const { fillExistingId } = req.body || {};
    if (!fillExistingId) {
      return res.status(400).json({ error: "Missing fillExistingId" });
    }

    // This faction must already exist in the live archive (bridged in by
    // routes/wizardFactions.js's save-factions step) — this route only
    // expands/revises Deep Lore, it never invents a brand-new faction from
    // nothing. That's the wizard's job.
    const manifest = await readFactionManifest(worldId);
    const existingEntry = manifest.find((m) => m.id === fillExistingId);
    if (!existingEntry) {
      return res.status(404).json({
        error: `No existing faction entry found with id '${fillExistingId}'. Create it first via the World Setup Wizard's Factions step.`
      });
    }

    // Factions have no locked/unlocked distinction — every call here is
    // effectively a regenerate. priorRaw is null for entries that predate
    // the `raw` field (or were only ever bridged from the wizard, which
    // stores the simpler wizard schema, not this route's richer Deep Lore
    // schema) — the model just generates fresh against the seed + roundup
    // rather than truly revising, same self-healing behavior used
    // elsewhere in the pipeline.
    const prior = await readFactionEntry(worldId, fillExistingId);
    const priorRaw = prior && prior.raw && prior.raw.origin ? prior.raw : null;
    const priorBodyHtml = prior ? prior.bodyHtml : null;

    // factionKey: use the faction's own id as the matching key for the
    // Roundup and any CSS accent lookup — generic worlds don't have a
    // fixed 5-key enum the way Echoes did, so entries authored for this
    // faction just need faction === this id, which is what every
    // generic-path generator now writes.
    const factionKey = existingEntry.faction || existingEntry.id;

    // Seed: prefer this faction's own wizard-generated concept/politics/
    // etc. (world_config.factions_json), falling back to whatever's in
    // the bridged entries-table raw data if the wizard record is gone.
    const wizardFactions = await getFactions(worldId);
    const wizardFaction = wizardFactions.find((f) => f.id === fillExistingId);
    const seedText = wizardFaction ? formatFactionSeed(wizardFaction) : formatFactionSeed(prior && prior.raw);

    const loreContext = await getLoreContext(worldId, { category: "factions", faction: factionKey });

    // Roundup is built FIRST and deterministically — it's both the output
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

    const newBodyHtmlPreview = buildFactionBodyHtml(faction, roundupRows);

    res.json({
      preview: true,
      mode: "regenerate",
      category: "factions",
      id: faction.id,
      name: faction.name,
      entry: faction,
      newBodyHtmlPreview,
      oldBodyHtmlPreview: priorBodyHtml,
      roundupEntryCount: roundupRows.length
    });
  } catch (err) {
    console.error("Faction generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
