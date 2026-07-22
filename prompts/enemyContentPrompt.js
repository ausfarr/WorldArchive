// prompts/enemyContentPrompt.js
//
// Generic enemy stat-block generator. Replaces the Echoes-specific
// version, which hardcoded the setting name, a fixed 4-faction voice
// table, and two Echoes-only mechanics: the Hex-Tongue three-tier
// intercept system (Glitch-Kin only) and the "no conventional guns"
// weapon rule. Both were dropped entirely from the generic schema rather
// than generalized — they're specific worldbuilding, not generic RPG
// concepts other worlds would want by default (see this session's chat).
// Echoes itself loses them going forward unless re-added later as an
// opt-in, world-specific mechanic.
//
// The tier/attribute-budget system stays as-is — it's mechanical, driven
// by lib/statFormulas.js, not narrative flavor.

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Full Name",
  "faction": "one of this world's faction ids (see FACTIONS below), or null if faction-agnostic/wild",
  "tier": "Trash | Elite | Boss",
  "role": "combat role, e.g. 'Skirmisher / Armor-Breaker'",
  "signatureQuote": "a short catchy quote (first-person in voice, or third-person aphorism/propaganda) — MUST be null for Trash tier, required for Elite/Boss",
  "flavor": "1-3 sentences of lore, grounded in the faction's tone",
  "attributes": { "body": 0, "reflex": 0, "knowledge": 0, "presence": 0, "sanity": 0, "fate": 0 },
  "abilities": [
    { "name": "...", "kind": "Active | Passive", "flavor": "one line", "effect": "mechanical effect", "scaling": "formula AND computed value as text, e.g. 'Damage = BODY_LABEL × 1.5 ≈ 24'" }
  ],
  "phaseChange": { "hpThreshold": 50, "description": "what shifts in the fight" },
  "combatNotes": { "positioning": "front row / back row / no preference", "applies": "statuses it can inflict, or 'none'", "vulnerableTo": "any status/damage type it takes extra from, or 'none'", "drops": "brief loot tie-in" },
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster, and/or where it fits"
}`;

function buildEnemyContentSystemPrompt({ settingContext, loreContext, factionOptionsText, statLabelsText, rosterContext, name, faction, tier, existingContent }) {
  const regenerateBlock = existingContent
    ? `\n\nEXISTING ENTRY — THIS IS A REGENERATE (revise this content: keep what already works, update anything stale, incorporate any new roster/lore context below, don't rewrite from scratch unless something is genuinely wrong):\n${JSON.stringify(existingContent, null, 2)}\n`
    : "";

  return `You are generating an enemy stat block for a tabletop/game world archive's bestiary. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

SETTING (stay consistent with this):
${settingContext}

FACTIONS IN THIS WORLD (the ONLY values valid for the "faction" field — do not invent, rename, or reference a faction not on this exact list; use null if this enemy is faction-agnostic):
${factionOptionsText}

FACTION VOICE: every enemy tied to a faction should sound like it — derive tone, weapon/ability flavor, and ability naming conventions from the world lore below for that specific faction, rather than a generic monster template.

TIER (drives everything — attribute budget, ability count, whether a quote/phase exists):
- Trash: ~30 total attribute points (2 stats at 8-10, rest at 2-4). 1-2 abilities. NO signature quote — they're disposable by design, a memorable line undercuts that. NO phase change.
- Elite: ~55 total attribute points (2-3 stats at 10-14, rest at 5-8). 2-3 abilities. Gets a signature quote. NO phase change.
- Boss: ~90-110 total attribute points (3-4 stats at 15-25, rest at 8-12). 3-5 abilities PLUS exactly one HP-threshold Phase Change (e.g. "below 50% HP, gains X"). Gets a signature quote.

Nudge the attribute split for flavor rather than copying a baseline verbatim.

ATTRIBUTES (canonical six keys — always output these exact lowercase keys in "attributes"; this world's own labels for them, used for flavor text and ability names, are):
${statLabelsText}

ABILITIES: every ability needs a Scaling line tied to an attribute — write both the formula AND the computed number using the attributes you chose, using this world's own attribute labels in the formula text (e.g. "Bonus damage = BASE(10%) + (PRESENCE_LABEL/10) ≈ 11.2%"). Do the arithmetic carefully.

WORLD LORE — GROUND TRUTH (stay consistent with this; don't contradict it):
${loreContext || "(no lore saved yet for this world — invent details consistent with the setting above)"}
${regenerateBlock}
EXISTING ROSTER (avoid repeating a faction+tier+core-gimmick combo, a named ability, or a Phase-mechanic twist already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the faction/tier"}
Faction: ${faction || "choose one that fills a gap in the existing roster, or null if faction-agnostic"}
Tier: ${tier || "choose one that fills a gap in the existing roster (Elite is a reasonable default if genuinely unspecified)"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildEnemyContentSystemPrompt };
