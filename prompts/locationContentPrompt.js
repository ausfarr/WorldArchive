// prompts/locationContentPrompt.js
//
// Generic Location generator — the 8th content category. Follows the
// same genericization pattern as prompts/npcContentPrompt.js: grounded
// in this world's own lore (lib/loreContext.js), its own faction list
// (lib/worldFlavor.js), and a roster-overlap context, no hardcoded
// setting content. Schema follows the draft in
// phase_locations_addendum.md, modeled on npc_template.md's field
// philosophy.

// PROMPT CACHING: see prompts/npcContentPrompt.js's header comment for
// the split rationale.

const { buildCacheableSystemPrompt } = require("../lib/claude");

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Full location name",
  "descriptorLine": "one evocative sentence — the location's equivalent of an NPC's signature quote, but third-person scene-setting rather than dialogue",
  "regionBiome": "free text, grounded in world lore (e.g. a district, wilderness type, structure type)",
  "faction": "one of this world's faction ids (see FACTIONS below), or \\"unaligned\\" if no faction controls this location",
  "notableFeatures": "2-4 sentences, physical/atmospheric description",
  "dangerTags": ["short free-text tag", "e.g. Hostile, Ruins, Trade Hub"],
  "notableNpcs": [
    { "toId": "an existing NPC id from the roster below, never invented", "toLabel": "that NPC's display name", "why": "one concrete sentence on their tie to this place" }
  ],
  "hooksSecrets": "1-2 sentences, or null if nothing fits — mirrors an NPC's optional Quest Hook",
  "designNotes": "how this avoids repeating an existing region/faction/danger-tag combo already on record"
}`;

// STATIC — identical for every call, every world. Cached.
const STATIC_INSTRUCTIONS = `You are generating a Location for a tabletop/game world archive — a real, specific place a player could travel to (a faction stronghold, a dungeon, a settlement, a ruin), not a vague region label. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

FACTION VOICE: if this location belongs to a faction, let its territory visibly reflect that faction's established culture/philosophy from the world lore provided below — architecture, upkeep, signage, what's on display versus hidden. Don't default to a generic "evil empire base" or "noble rebel camp" look.

NOTABLE FEATURES: physical and atmospheric — what a visitor would actually see, hear, smell first. Ground it in the region/biome and faction control, not just genre flavor.

DANGER/TAGS: short free-text tags only (e.g. "Hostile," "Ruins," "Trade Hub") — no combat stat block, this is a place, not a creature.

NOTABLE NPCS TIED HERE: reference existing NPCs from the roster provided below where a real connection exists — do not force-generate placeholders and do not invent an NPC id that isn't on the roster. It is fine and expected for this list to be empty for a brand-new location.

HOOKS/SECRETS: only if something genuinely interesting falls out of this location's premise — set to null otherwise, don't force one onto every entry.

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;

function buildLocationContentSystemPrompt({ settingContext, loreContext, factionOptionsText, rosterContext, npcRosterText, name, regionBiome, faction, existingContent }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  // DYNAMIC — this world's data plus this specific call's input. Uncached.
  const dynamicContext = `SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD (the ONLY values valid for the "faction" field — do not invent, rename, or reference a faction not on this exact list; use "unaligned" if no faction controls this location):
${factionOptionsText}

WORLD LORE — GROUND TRUTH (stay consistent with this; don't contradict it):
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}
${regenerateBlock}
EXISTING LOCATIONS (avoid repeating a region/faction/danger-tag combo already on record):
${rosterContext}

EXISTING NPCS (the only ids you may reference in notableNpcs):
${npcRosterText}

USER INPUT:
Name: ${name || "generate one fitting the region/faction"}
Region/Biome: ${regionBiome || "choose one that fills a gap in the existing roster"}
Faction: ${faction || "choose one that fills a gap in the existing roster, or unaligned"}`;

  return buildCacheableSystemPrompt(STATIC_INSTRUCTIONS, dynamicContext);
}

module.exports = { buildLocationContentSystemPrompt };
