const { getWorldBibleContext } = require("../lib/worldBible");

// This file receives a display name ("The Ferro-Kings"), but worldBible.js
// tags sections with the same short keys used everywhere else in the
// pipeline (ferro_kings, the_board, etc.) — map one to the other here
// rather than touching the shared lookup module for one caller's format.
const FACTION_NAME_TO_KEY = [
  { key: "preservation", re: /preservation/i },
  { key: "ferro_kings", re: /ferro-kings/i },
  { key: "the_board", re: /\bthe board\b/i },
  { key: "glitch_kin", re: /glitch-kin/i },
  { key: "colony", re: /\bcolony\b|\bthe silo\b/i },
];

function factionKeyFromName(factionName) {
  const match = FACTION_NAME_TO_KEY.find((f) => f.re.test(factionName || ""));
  return match ? match.key : null;
}

const SCHEMA_DESCRIPTION = `{
  "nickname": "e.g. 'The System' — the established one/two-word epithet",
  "overviewQuote": "one sentence, in the faction's collective/leadership voice, that captures its identity",
  "origin": "2-4 sentences: how this faction actually formed after the collapse - a specific triggering moment or decision, not just 'they're the workers'",
  "corePhilosophy": "one sentence: the belief that drives every decision this faction makes, distinct from the other three, could double as a slogan",
  "structureHierarchy": "2-4 sentences: who's actually in charge and how authority flows. If an existing Faction Leader NPC is listed in the roundup below, they ARE the top of this hierarchy - build around them, don't invent a competing leader",
  "territory": "2-4 sentences: what part of the city/Dome they hold, and why that location makes sense for them",
  "goalsNearTerm": "1-2 sentences: what they're actively doing right now",
  "goalsLongTerm": "1-2 sentences: what 'winning' looks like to them",
  "internalTensions": "2-4 sentences: a real fault line inside the faction that could fracture it from within - not just external conflict",
  "iconography": "2-4 sentences: colors (use the established faction accent color), symbols, uniform/dress conventions",
  "relationships": [
    { "faction": "one of the other three factions by name", "stance": "Alliance | Rivalry | Indifference", "why": "one concrete sentence" }
  ],
  "economyResources": "2-4 sentences: what they produce/control/trade, and what they're short on",
  "joining": "2-4 sentences: how someone joins or is absorbed into this faction"
}`;

function buildFactionContentSystemPrompt({ factionName, factionSeed, roundupContext, existingContent }) {
  const worldBibleContext = getWorldBibleContext({
    faction: factionKeyFromName(factionName),
    category: "factions",
  });
  const regenerateBlock = existingContent
    ? `\n\nPREVIOUS DEEP LORE — THIS IS A REGENERATE (revise this: keep what already works, update anything that's grown stale or now conflicts with the roundup below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";
  return `You are writing the Deep Lore section of a faction profile for "Echoes of the Neon," a tactical RPG set in a subterranean industrial-horror colony after a societal collapse. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

This is a REFERENCE PROFILE, not a novel — keep each field to 2-4 sentences, depth over length. Every field must stay consistent with the established lore seed and with anything already generated for this faction (see the roundup context below) — you are deepening what exists, not reinventing it.

FACTION: ${factionName}

ESTABLISHED LORE SEED (must stay consistent with this):
${factionSeed}

WORLD BIBLE — GROUND TRUTH LORE (stay consistent with this; if it overlaps with the lore seed above, treat them as reinforcing the same facts, not two separate sources to reconcile):
${worldBibleContext}

WEAPON RULE (if this faction isn't Glitch-Kin): no conventional guns by default — high-velocity kinetic friction ignites the Neon atmosphere and kills the shooter. Echo-Shielded guns are a rare, explicitly-flagged exception, never a faction default.
${regenerateBlock}
ALREADY GENERATED FOR THIS FACTION (build your Structure/Hierarchy around any Faction Leader NPC listed here — don't invent a competing leader; stay consistent with any named characters or beats listed):
${roundupContext}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildFactionContentSystemPrompt };
