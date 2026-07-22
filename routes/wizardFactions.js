const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { getFactions, saveFactions } = require("../lib/worldConfigRepo");
const { backfillFactionTags } = require("../lib/loreRepo");
const { getLoreContext } = require("../lib/loreContext");
const { buildWizardFactionSystemPrompt } = require("../prompts/wizardFactionPrompt");

const router = express.Router();

const MAX_FACTIONS = 8;

function slugify(name) {
  return (name || "faction")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "faction";
}

async function generateOneFaction(worldId, existingFactions, { name, concept, mode }) {
  const loreContext = await getLoreContext(worldId, { category: "factions" });
  const systemPrompt = buildWizardFactionSystemPrompt({ loreContext, existingFactions, name, concept, mode });
  const raw = await callClaude({
    systemPrompt,
    userMessage: "Generate the faction now.",
    maxTokens: 2500
  });
  let faction;
  try {
    faction = parseJsonResponse(raw);
  } catch (parseErr) {
    console.error("Failed to parse faction JSON. Raw response length:", raw.length);
    console.error("Raw response (last 300 chars):", raw.slice(-300));
    throw new Error(`Faction content was not valid JSON (likely truncated — response was ${raw.length} chars): ${parseErr.message}`);
  }
  faction.id = slugify(faction.name);
  return faction;
}

router.get("/wizard/factions", async (req, res) => {
  try {
    const factions = await getFactions(req.worldId);
    res.json({ factions });
  } catch (err) {
    console.error("Loading factions failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Fill one named slot (or invent one if name is omitted). Does NOT save --
// returns the generated faction for review, same pattern as Lore's
// generate/import endpoints.
router.post("/wizard/generate-faction", async (req, res) => {
  try {
    const { name, concept } = req.body || {};
    const existingFactions = await getFactions(req.worldId);
    const faction = await generateOneFaction(req.worldId, existingFactions, {
      name,
      concept,
      mode: name ? "fill" : "invent"
    });
    res.json({ faction });
  } catch (err) {
    console.error("Faction generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Step-level "generate this whole step for me" -- invents `count` new
// factions from scratch (default 4), each aware of the ones generated
// just before it in the same batch so they don't overlap. Does NOT save.
router.post("/wizard/generate-factions-step", async (req, res) => {
  try {
    const requestedCount = Number(req.body && req.body.count) || 4;
    const existingFactions = await getFactions(req.worldId);
    const count = Math.max(1, Math.min(requestedCount, MAX_FACTIONS - existingFactions.length));
    if (count <= 0) {
      return res.status(400).json({ error: `This world already has ${existingFactions.length}/${MAX_FACTIONS} factions -- no room to generate more.` });
    }

    const generated = [];
    for (let i = 0; i < count; i++) {
      const faction = await generateOneFaction(req.worldId, existingFactions.concat(generated), { mode: "invent" });
      generated.push(faction);
    }
    res.json({ factions: generated });
  } catch (err) {
    console.error("Step-level faction generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Explicit save -- progressive commit straight to world_config.factions_json
// (see this session's scope doc addendum on why the wizard moved away from
// draft_json-only-until-Step-8). Also backfills faction_tags onto lore
// sections now that factions exist -- see loreRepo.backfillFactionTags for
// the heuristic used.
router.post("/wizard/save-factions", async (req, res) => {
  try {
    const { factions } = req.body || {};
    if (!Array.isArray(factions)) {
      return res.status(400).json({ error: "Request body must include a 'factions' array." });
    }
    if (factions.length > MAX_FACTIONS) {
      return res.status(400).json({ error: `A world can have at most ${MAX_FACTIONS} factions.` });
    }
    const withIds = factions.map((f) => ({ ...f, id: f.id || slugify(f.name) }));
    const seenIds = new Set();
    withIds.forEach((f) => {
      let uniqueId = f.id;
      let suffix = 2;
      while (seenIds.has(uniqueId)) {
        uniqueId = `${f.id}-${suffix++}`;
      }
      f.id = uniqueId;
      seenIds.add(uniqueId);
    });
    const saved = await saveFactions(req.worldId, withIds);

    const factionIds = withIds.map((f) => f.id);
    await backfillFactionTags(req.worldId, factionIds);

    res.json({ factions: saved });
  } catch (err) {
    console.error("Saving factions failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
