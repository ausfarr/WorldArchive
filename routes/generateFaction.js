const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { readFactionManifest, readFactionEntry } = require("../lib/roster");
const { buildFactionContentSystemPrompt } = require("../prompts/factionContentPrompt");
const { buildFactionRoundup } = require("../lib/factionRoundup");
const { buildFactionBodyHtml } = require("../lib/factionTemplate");

const router = express.Router();

// Only these four are covered by the faction generator skill - "The Colony"
// is the player's own home base, not one of the four world factions.
const FACTION_SEEDS = {
  "the-preservation": {
    factionKey: "preservation",
    name: "The Preservation",
    seed: `AI-driven faction seeking to freeze the city in Stasis. Sterile, white, ice-blue aesthetic. Cold, procedural, bureaucratic control — enforcement via security systems and drones, quarantine logic, protocol over personality.`
  },
  "the-ferro-kings": {
    factionKey: "ferro_kings",
    name: "The Ferro-Kings",
    seed: `Brutal warlords controlling the factories. Value physical strength and heavy armor. See the apocalypse as a return to a harder, purer order. Brutal industrial tone — foremen, enforcers, factory-floor violence, shop-floor slang. Already-established leadership: Adaeze Okonkwo ("The Foreman") — check the roundup context for her and anyone connected to her before inventing a separate leadership structure.`
  },
  "the-board": {
    factionKey: "the_board",
    name: "The Board",
    seed: `Delusional executives operating from the Sky-Needle. Treat the apocalypse as a hostile takeover to manage and monetize. Darkly comic corporate-horror tone — quarterly-report language applied to violence and survival.`
  },
  "glitch-kin": {
    factionKey: "glitch_kin",
    name: "Glitch-Kin",
    seed: `Mutated horrors — humans fully overtaken by nanites trying (badly) to "fix" them. Functionally a force of nature, not an army with intent. Body-horror tone. Networked; speak Hex-Tongue (debug-log style, not "monster growls"). No real hierarchy in the human sense — frame any "leader" as an emergent hub-node, not a person who gives orders.`
  },
  "the-colony": {
    factionKey: "colony",
    name: "The Colony (The Silo)",
    seed: `The player's own home base — not one of the four antagonist factions, no fixed territory of its own, survives by scavenging and trading in the gaps between the other four. Community/survival tone rather than a power bloc: internal roles (Archive, Workshop, Memorial) matter more than doctrine or conquest. No single ruler in the way the other factions have one.`
  }
};

router.post("/generate-faction", async (req, res) => {
  try {
    const worldId = req.worldId;
    const { fillExistingId } = req.body || {};
    const seed = FACTION_SEEDS[fillExistingId];
    if (!seed) {
      return res.status(400).json({
        error: `'${fillExistingId}' isn't a supported faction id. Supported: ${Object.keys(FACTION_SEEDS).join(", ")}`
      });
    }

    const manifest = await readFactionManifest(worldId);
    const existingEntry = manifest.find((m) => m.id === fillExistingId);
    if (!existingEntry) {
      return res.status(404).json({ error: `No existing faction entry found with id '${fillExistingId}'` });
    }

    // Factions have no locked/unlocked distinction - every generate-faction
    // call is effectively a regenerate. priorRaw is null for entries
    // generated before the `raw` field existed — the model just generates
    // fresh against the seed + roundup rather than truly revising, a fine
    // one-time degradation until the first regenerate populates `raw`.
    const prior = await readFactionEntry(worldId, fillExistingId);
    const priorRaw = prior && prior.raw ? prior.raw : null;
    const priorBodyHtml = prior ? prior.bodyHtml : null;

    // Roundup is built FIRST and deterministically - it's both the output
    // section and context fed to the model, never invented either way.
    const roundupRows = await buildFactionRoundup(worldId, seed.factionKey);
    const roundupContext = roundupRows.length === 0
      ? "Nothing archived for this faction yet."
      : roundupRows.map((r) => `- ${r.type}: ${r.name}${r.note ? ` (${r.note})` : ""}`).join("\n");

    const contentSystemPrompt = buildFactionContentSystemPrompt({
      factionName: seed.name,
      factionSeed: seed.seed,
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
      factionKey: seed.factionKey,
      name: seed.name,
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
