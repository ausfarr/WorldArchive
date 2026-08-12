const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { callClaudeExpectingJson, HAIKU_MODEL } = require("../lib/claude");
const { generateImage } = require("../lib/imagegen");
const { buildRosterContext, readNpcManifest, readNpcEntry } = require("../lib/roster");
const { buildNpcContentSystemPrompt } = require("../prompts/npcContentPrompt");
const { buildArtPromptSystemPrompt } = require("../prompts/artPromptPrompt");
const { saveNpcEntry, saveImage } = require("../lib/fileWriter");
const { slugify, buildBodyHtml } = require("../lib/entryTemplate");
const { getLoreContext } = require("../lib/loreContext");
const { getSettingContext, getFactionOptions, formatFactionOptionsForPrompt, getFactionAccent } = require("../lib/worldFlavor");
const { getStyleGuide, getRuleset } = require("../lib/worldConfigRepo");
const { createNewNpc } = require("../lib/campaignEntryGenerators");
const { DEFAULT_NPC_COMBAT_PROFILE } = require("../lib/rulesets/5e/npcCombatDefaults");
const { DEFAULT_NPC_COMBAT_PROFILE: DEFAULT_NPC_COMBAT_PROFILE_PF2E } = require("../lib/rulesets/pf2e/npcCombatDefaults");

const router = express.Router();

router.post("/generate-npc", requireAiEnabled, enforceGenerationCap, enforceEntryCapOnGenerate, async (req, res) => {
  try {
    const worldId = req.worldId;
    let { name, role, faction, fillExistingId, importText } = req.body || {};

    // Import path: no fillExistingId (brand new entry, same as a normal
    // "Generate New Entry"), but grounded in user-provided source text
    // instead of invented from scratch. Deliberately bypasses
    // createNewNpc() (used by the plain no-input path and by Quest
    // auto-fill) since that helper has no slot for source text -- this
    // stays close to the regular fillExistingId=false branch below
    // instead, just with importSourceText threaded through.
    if (!fillExistingId && importText && importText.trim()) {
      const rosterContext = await buildRosterContext(worldId);
      const loreContext = await getLoreContext(worldId, { category: "npcs", faction });
      const settingContext = await getSettingContext(worldId);
      const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));
      const contentSystemPrompt = buildNpcContentSystemPrompt({
        settingContext, loreContext, factionOptionsText, rosterContext,
        name, role, faction, importSourceText: importText.trim()
      });
      const npc = await callClaudeExpectingJson({
        systemPrompt: contentSystemPrompt,
        userMessage: "Import and structure this character now.",
        maxTokens: 3000
      });
      npc.id = npc.id || slugify(npc.name);
      if (faction) npc.faction = faction;
      // Phase 7 (multi-ruleset genericization) + PF2e expansion: see
      // lib/campaignEntryGenerators.js's createNewNpc for the full
      // reasoning -- this import path bypasses that helper (needs
      // importSourceText threaded through), so the same attachment is
      // duplicated here rather than left out.
      {
        const importRuleset = await getRuleset(worldId);
        if (importRuleset === "5e") npc.combatProfile = DEFAULT_NPC_COMBAT_PROFILE;
        else if (importRuleset === "pf2e") npc.combatProfile = DEFAULT_NPC_COMBAT_PROFILE_PF2E;
      }
      await saveNpcEntry(worldId, npc, null);
      return res.json({
        preview: false,
        id: npc.id,
        name: npc.name,
        roleArchetype: npc.roleArchetype,
        faction: npc.faction,
        summary: npc.designNotes
      });
    }

    if (!fillExistingId) {
      const result = await createNewNpc(worldId, { name, role, faction });
      return res.json({ preview: false, ...result });
    }

    let existingEntry = null;
    let priorRaw = null;
    let priorBodyHtml = null;
    let mode = "new";

    if (fillExistingId) {
      const manifest = await readNpcManifest(worldId);
      existingEntry = manifest.find((m) => m.id === fillExistingId);
      if (!existingEntry) {
        return res.status(404).json({ error: `No existing NPC entry found with id '${fillExistingId}'` });
      }
      mode = existingEntry.locked ? "fill" : "regenerate";
      if (mode === "regenerate") {
        const prior = await readNpcEntry(worldId, fillExistingId);
        priorRaw = prior && prior.raw ? prior.raw : null;
        priorBodyHtml = prior ? prior.bodyHtml : null;
      }
      // Known facts from the placeholder become fixed inputs, not suggestions.
      name = existingEntry.name;
      role = existingEntry.roleArchetype || role;
      faction = existingEntry.faction || faction;
    }

    // Step 1: roster overlap context from live archive
    const rosterContext = await buildRosterContext(worldId);

    // Step 1b: generic world grounding — lore, setting framing, and this
    // world's own faction list (replaces the old hardcoded Echoes World
    // Bible + 4-faction voice text).
    const loreContext = await getLoreContext(worldId, { category: "npcs", faction });
    const settingContext = await getSettingContext(worldId);
    const factionOptionsText = formatFactionOptionsForPrompt(await getFactionOptions(worldId));

    // Step 2: content generation
    const contentSystemPrompt = buildNpcContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, name, role, faction, existingContent: priorRaw });
    const npc = await callClaudeExpectingJson({
      systemPrompt: contentSystemPrompt,
      userMessage: "Generate the NPC now.",
      maxTokens: 3000
    });
    // For fill-existing, force the id/name to match the placeholder exactly
    // (other pages may already link to this id/display this name).
    npc.id = fillExistingId || npc.id || slugify(npc.name);
    if (existingEntry) npc.name = existingEntry.name;

    // A specific faction chosen by the user (dropdown selection, or an
    // existing entry being filled/regenerated) is a known fact, not a
    // suggestion — force it rather than trusting the model to have
    // honored the explicit "Faction: X" line in the prompt. This is what
    // actually fixes generated NPCs coming back "Unaligned" even when a
    // real faction was picked: the flavor text/relationships still stay
    // grounded in that faction via loreContext, but the stored field
    // itself no longer depends on the model getting it right.
    if (faction) npc.faction = faction;

    // Phase 7 (multi-ruleset genericization): fill/regenerate both need
    // the combat profile explicitly carried over -- the model's own
    // response never includes one (npcContentPrompt.js's schema has no
    // such field), so without this a regenerate would silently drop a
    // combat profile the moment the user confirms it, including one a
    // GM had already upgraded to a bespoke Combatant stat block via
    // routes/npcCombatant.js. "fill" (a locked placeholder becoming a
    // real NPC for the first time) gets the same default new NPCs get.
    {
      const fillRuleset = await getRuleset(worldId);
      const defaultProfile = fillRuleset === "5e" ? DEFAULT_NPC_COMBAT_PROFILE : fillRuleset === "pf2e" ? DEFAULT_NPC_COMBAT_PROFILE_PF2E : null;
      if (defaultProfile) {
        npc.combatProfile = (mode === "regenerate" && priorRaw && priorRaw.combatProfile)
          ? priorRaw.combatProfile
          : defaultProfile;
      }
    }

    if (mode === "regenerate") {
      const newBodyHtmlPreview = buildBodyHtml(npc);
      return res.json({
        preview: true,
        mode: "regenerate",
        category: "npcs",
        id: npc.id,
        name: npc.name,
        entry: npc,
        newBodyHtmlPreview,
        oldBodyHtmlPreview: priorBodyHtml
      });
    }

    // Portrait generation is no longer bundled into entry creation --
    // saved immediately with imageUrl: null, and the dossier page offers
    // Generate/Upload actions via archive/js/portraitActions.js +
    // routes/generateEntryImage.js instead. (This decoupling was
    // originally done in a separate chat session in this project; being
    // restored here after it was accidentally reverted by an unrelated
    // later delivery that touched this same file.)
    await saveNpcEntry(worldId, npc, null);

    res.json({
      preview: false,
      id: npc.id,
      name: npc.name,
      roleArchetype: npc.roleArchetype,
      faction: npc.faction,
      summary: npc.designNotes
    });
  } catch (err) {
    console.error("NPC generation failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
