const { getWorldBibleContext } = require("../lib/worldBible");

const SCHEMA_DESCRIPTION = `{
  "id": "kebab-case-slug",
  "name": "Full Name",
  "faction": "glitch_kin | preservation | ferro_kings | the_board",
  "tier": "Trash | Elite | Boss",
  "role": "combat role, e.g. 'Skirmisher / Armor-Breaker'",
  "signatureQuote": "a short catchy quote (first-person in voice, or third-person aphorism/propaganda) — MUST be null for Trash tier, required for Elite/Boss",
  "flavor": "1-3 sentences of lore, grounded in the faction's tone",
  "attributes": { "body": 0, "reflex": 0, "knowledge": 0, "presence": 0, "sanity": 0, "fate": 0 },
  "abilities": [
    { "name": "...", "kind": "Active | Passive", "flavor": "one line", "effect": "mechanical effect", "scaling": "formula AND computed value as text, e.g. 'Damage = BODY × 1.5 ≈ 24'" }
  ],
  "phaseChange": { "hpThreshold": 50, "description": "what shifts in the fight" } ,
  "hexTongue": { "unreadable": "glyph string e.g. ▖▗▘▙", "keyword": "partial words e.g. ▖TARGET▘ ▚FLANK▛", "phrase": "full plain-English intent line" },
  "combatNotes": { "positioning": "front row / back row / no preference", "applies": "statuses it can inflict, or 'none'", "vulnerableTo": "any status/damage type it takes extra from, or 'none'", "drops": "brief loot tie-in" },
  "designNotes": "1-2 sentences: how this avoids overlapping the existing roster, and/or where it fits"
}`;

function buildEnemyContentSystemPrompt({ rosterContext, name, faction, tier }) {
  const worldBibleContext = getWorldBibleContext({ faction, category: "enemies" });
  return `You are generating an enemy stat block for "Echoes of the Neon," a tactical RPG set in a subterranean industrial-horror colony after a societal collapse. Output ONLY valid JSON matching the schema below — no markdown, no prose, no code fences.

FACTIONS (every enemy belongs to exactly one, and must sound like it):
- Glitch-Kin ("The Weather") — mutated body-horror, part flesh part machine, functionally a force of nature not an army with intent. Cutting vents into flesh, carbon-nanotube bone, copper-wire nerves. They are networked and speak Hex-Tongue (see HEX-TONGUE below — ONLY this faction gets it). Weapons: none in the human sense — claws, grafted machinery, environmental hazards. NEVER give Glitch-Kin guns.
- The Preservation ("The System") — AI-driven, sterile white aesthetic, ice/stasis tech. Cold, procedural, bureaucratic control. Enemies read as security systems/drones enforcing quarantine. Clinical ability names ("Containment Protocol," not "Slash").
- The Ferro-Kings ("The Workers") — brutal warlords controlling the factories, value physical strength and heavy armor, see the apocalypse as a return to a harder order. Factory-floor violence — foremen, enforcers, heavy machinery as weapons. Ability names sound like factory tools/shop-floor slang.
- The Board ("The Elite") — delusional executives running the apocalypse as a hostile takeover to monetize. Darkly comic corporate horror — quarterly-report language applied to violence. Enemies read as security consultants, "asset protection" mercs, corporate drone swarms. Ability names/text sound like HR memos or KPIs.

WEAPON RULE (Preservation/Ferro-Kings/Board only — not Glitch-Kin, see above): no conventional guns — high-velocity kinetic friction ignites the Neon atmosphere and kills the shooter. Low-velocity kinetics only (blades, maces, crushing tools, thrown weapons) UNLESS explicitly generating a rare Echo-Shielded gun-user — flag that as a notable exception, never a default.

TIER (drives everything — attribute budget, ability count, whether a quote/phase exists):
- Trash: ~30 total attribute points (2 stats at 8-10, rest at 2-4). 1-2 abilities. NO signature quote — they're disposable by design, a memorable line undercuts that. NO phase change.
- Elite: ~55 total attribute points (2-3 stats at 10-14, rest at 5-8). 2-3 abilities. Gets a signature quote. NO phase change.
- Boss: ~90-110 total attribute points (3-4 stats at 15-25, rest at 8-12). 3-5 abilities PLUS exactly one HP-threshold Phase Change (e.g. "below 50% HP, gains X"). Gets a signature quote.

Nudge the attribute split for flavor rather than copying a baseline verbatim — a glass-cannon Elite might dump SANITY for FATE, etc.

ABILITIES: every ability needs a Scaling line tied to an attribute — write both the formula AND the computed number using the attributes you chose (e.g. "Bonus damage = BASE(10%) + (PRESENCE/10) ≈ 11.2%"). Do the arithmetic carefully.

HEX-TONGUE (Glitch-Kin ONLY — set hexTongue to null for every other faction, never a placeholder): a three-tier translated intercept of the enemy's network signal — Unreadable (glyphs), Keyword (partial words), Phrase (full plain-English intent).

WORLD BIBLE — GROUND TRUTH LORE (stay consistent with this; don't contradict it):
${worldBibleContext}

EXISTING ROSTER (avoid repeating a faction+tier+core-gimmick combo, a named ability, or a Phase-mechanic twist already used):
${rosterContext}

USER INPUT:
Name: ${name || "generate one fitting the faction/tier"}
Faction: ${faction || "choose one that fills a gap in the existing roster"}
Tier: ${tier || "choose one that fills a gap in the existing roster (Elite is a reasonable default if genuinely unspecified)"}

Return JSON matching this exact schema:
${SCHEMA_DESCRIPTION}`;
}

module.exports = { buildEnemyContentSystemPrompt };
