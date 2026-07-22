// prompts/factionContentPrompt.js
//
// Generic "Deep Lore" expansion generator for the archive's Faction
// dossier page. Takes a faction that already exists in this world (either
// wizard-created via world_config.factions_json, or a prior dossier
// regenerate) and expands it into the richer dossier schema
// (lib/factionTemplate.js's buildFactionBodyHtml fields) — nickname,
// origin, structure, territory, goals, tensions, iconography, etc.
//
// Replaces the old Echoes-specific version, which hardcoded FACTION_SEEDS
// and four faction-voice paragraphs. Grounding now comes entirely from
// this world's own saved lore (lib/loreContext.js) and its own
// wizard-generated faction seed (concept/politics/government/economy/
// military/tensions from world_config.factions_json) — no hardcoded
// setting name, faction list, or voice descriptions.

const SCHEMA_DESCRIPTION = `{
  "nickname": "an established one/two-word epithet for this faction, consistent with the seed/lore below",
  "overviewQuote": "one sentence, in the faction's collective/leadership voice, that captures its identity",
  "origin": "2-4 sentences: how this faction actually formed — a specific triggering moment or decision, not just a label",
  "corePhilosophy": "one sentence: the belief that drives every decision this faction makes, could double as a slogan",
  "structureHierarchy": "2-4 sentences: who's actually in charge and how authority flows. If an existing Faction Leader NPC is listed in the roundup below, they ARE the top of this hierarchy — build around them, don't invent a competing leader",
  "territory": "2-4 sentences: what part of the world this faction holds, and why that location/domain makes sense for them",
  "goalsNearTerm": "1-2 sentences: what they're actively doing right now",
  "goalsLongTerm": "1-2 sentences: what 'winning' looks like to them",
  "internalTensions": "2-4 sentences: a real fault line inside the faction that could fracture it from within — not just external conflict",
  "iconography": "2-4 sentences: colors, symbols, dress/uniform conventions",
  "relationships": [
    { "faction": "name of another faction in this world", "stance": "e.g. Rivalry, Uneasy alliance, Open war, Trade partner", "why": "one concrete sentence" }
  ],
  "economyResources": "1 paragraph: how this faction sustains itself materially",
  "joining": "1 paragraph: what it takes for an outsider to join or be absorbed, if that's even possible"
}`;

// seedText: this faction's own wizard-generated concept/politics/government/
// economy/military/tensions, formatted as plain text — the equivalent of
// the old hardcoded FACTION_SEEDS entry, but sourced from the world's own
// data instead of Austin's hand-written Echoes seeds.
function buildFactionContentSystemPrompt({ factionName, seedText, loreContext, roundupContext, existingContent }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roundup/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  return `You are expanding a faction's established concept into a full dossier for a tabletop/game world archive. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

Stay consistent with everything given below — don't contradict the faction's own established concept, the world's lore, or anything already archived and connected to this faction (the Roundup). Every field should feel like it grew out of THIS faction's specific concept, not a generic archetype.

FACTION NAME: ${factionName}

THIS FACTION'S ESTABLISHED CONCEPT (do not contradict — expand on it):
${seedText || "(no prior concept saved — infer one consistent with the world lore below)"}

WORLD LORE — GROUND TRUTH (stay consistent with this):
${loreContext || "(no lore saved yet for this world — invent details consistent with general genre conventions and this faction's own concept above)"}

ROUNDUP — EVERYTHING ALREADY ARCHIVED FOR THIS FACTION (build around these, especially any named Faction Leader — never invent a competing leader):
${roundupContext}
${regenerateBlock}
Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildFactionContentSystemPrompt };
