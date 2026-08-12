// routes/npcCombatant.js
//
// Multi-ruleset genericization, Phase 7: the "Combatant" upgrade --
// takes a specific NPC and gives it a full,
// bespoke stat block by invoking the EXACT SAME Homebrew monster-
// generation pipeline Bestiary uses
// (lib/rulesets/<ruleset>/homebrewEnemyGenerator.js), per the project's
// own instruction to "reuse it, don't fork it." The result is attached
// to the NPC's own entry as `combatProfile` (replacing the lightweight
// default every NPC gets at creation -- see
// lib/rulesets/<ruleset>/npcCombatDefaults.js) rather than creating a
// separate `enemies` category row; an NPC upgraded this way is still
// one entry, with richer stats.
const express = require("express");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");
const { getRuleset } = require("../lib/worldConfigRepo");
const { getEntry } = require("../lib/entriesRepo");
const { saveNpcEntry, getPortraitUrl } = require("../lib/fileWriter");
const { generateHomebrew5eEnemy } = require("../lib/rulesets/5e/homebrewEnemyGenerator");
const { generateHomebrewGenericEnemy } = require("../lib/rulesets/generic/homebrewEnemyGenerator");
const { denormalizeEnemyIntoCombatProfile } = require("../lib/rulesets/generic/npcCombatDefaults");
const { getGenericSystem } = require("../lib/worldConfigRepo");

const router = express.Router();

// No enforceEntryCapOnGenerate here -- this route only UPDATES an
// existing NPC's combatProfile field, it never creates a new entry, so
// the entry cap (which gates entry CREATION) doesn't apply. Not gated by
// requireCategoryAvailable("npcs") either -- NPCs stay available on
// every ruleset (narrative-only for everyone else); this route checks
// the ruleset directly, since "Combatant upgrade" only makes sense
// where a real Bestiary pipeline exists to reuse.
router.post("/npc-combatant-upgrade", requireAiEnabled, enforceGenerationCap, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { npcId, targetCr } = req.body || {};
    if (!npcId) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(400).json({ error: "npcId is required." });
    }

    const ruleset = await getRuleset(worldId);
    if (ruleset !== "5e" && ruleset !== "generic") {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(501).json({ error: `The Combatant upgrade isn't available for the '${ruleset}' ruleset yet.` });
    }

    let genericSystem = null;
    if (ruleset === "generic") {
      genericSystem = await getGenericSystem(worldId);
      if (!genericSystem || !Array.isArray(genericSystem.attributes) || !genericSystem.attributes.length) {
        if (req.refundGeneration) await req.refundGeneration();
        return res.status(400).json({ error: "This world hasn't configured its homebrew attribute system yet -- finish that setup before upgrading an NPC to a Combatant." });
      }
    }

    const existing = await getEntry(worldId, "npcs", npcId);
    if (!existing) {
      if (req.refundGeneration) await req.refundGeneration();
      return res.status(404).json({ error: `No NPC found with id '${npcId}'.` });
    }

    // existing.raw is the actual NPC content object (see
    // lib/fileWriter.js's saveNpcEntry -- entryMeta.raw = npc, and
    // getEntry() spreads raw_json, so most NPC-specific fields like
    // physicalDescription only live at existing.raw.*, not top-level;
    // name/faction/contradiction happen to also be mirrored onto
    // entryMeta directly, but raw is the reliable place to read from).
    const npcContent = existing.raw || {};
    const campaignContext = `This is a combat stat block for an existing named NPC, "${existing.name}" -- ${npcContent.physicalDescription || ""} ${npcContent.contradiction || ""}`.trim();

    let combatProfile;
    if (ruleset === "5e") {
      combatProfile = await generateHomebrew5eEnemy(worldId, { name: `${existing.name}'s combat profile`, faction: existing.faction, targetCr, campaignContext });
      // The homebrew generator names/IDs this as if it were a standalone
      // monster -- irrelevant here, this profile is embedded inside the
      // NPC's own entry, not saved as its own `enemies` row.
      delete combatProfile.id;
      delete combatProfile.name;
      combatProfile.isDefaultProfile = false;
    } else {
      // Generic: the Bestiary-shaped enemy result gets denormalized into
      // the {key, label, value} combatProfile shape (see
      // lib/rulesets/generic/npcCombatDefaults.js's header for why) --
      // no id/name deletion needed here since denormalizeEnemyIntoCombatProfile()
      // only pulls the fields it actually needs, not a full entry copy.
      const enemy = await generateHomebrewGenericEnemy(worldId, genericSystem, { name: `${existing.name}'s combat profile`, faction: existing.faction, campaignContext });
      combatProfile = denormalizeEnemyIntoCombatProfile(enemy, genericSystem);
    }

    // saveNpcEntry() expects the ACTUAL npc content shape (the same
    // object npcContentPrompt.js's schema produces -- physicalDescription,
    // signatureQuote, speech, relationships, etc.), not the flattened
    // entry wrapper getEntry() returns. That's npcContent (existing.raw)
    // from above, not `existing` itself -- spreading `existing` directly
    // would build a broken npc object missing most of its own fields.
    const updatedNpc = { ...npcContent, id: npcId, combatProfile };
    const imageUrl = getPortraitUrl(worldId, npcId);
    await saveNpcEntry(worldId, updatedNpc, imageUrl);

    res.json({ id: npcId, combatProfile });
  } catch (err) {
    console.error("NPC Combatant upgrade failed:", err);
    if (req.refundGeneration) await req.refundGeneration();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
