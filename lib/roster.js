// lib/roster.js — Supabase-backed rewrite (Phase 1 multi-tenant pivot).
//
// Every function's first parameter is now `worldId` (a Supabase worlds.id
// uuid), not a filesystem `archiveRoot` path, and every function is now
// async (Supabase calls are Promises, unlike the old synchronous fs
// calls). Function names and output strings are otherwise UNCHANGED from
// the flat-file version, including a couple of faithfully-preserved
// quirks (e.g. buildRosterContext checking `entry.tic`, which was never
// actually populated in the old data files either — not fixed here to
// avoid silently changing prompt-context behavior mid-migration).
//
// Callers: every route file must now `await` these calls.

const { listEntries, getEntry } = require("./entriesRepo");

// ---------- Roster context size cap ----------
//
// Without a cap, every buildXRosterContext() below grows without bound
// as a category fills up -- see the session math: a category's roster
// context alone crosses 100% of a typical generation call's total cost
// around ~390 entries in that one category, since every new generation
// pays to re-list everything that came before it. Capping bounds the
// worst case to a fixed, small size regardless of world age/size.
//
// Entries beyond the cap aren't deleted or hidden anywhere in the
// archive itself -- they just aren't individually described to the
// model past this point. Two real tradeoffs from that: (1) very old
// entries beyond the cap can't be picked as relationship targets
// (toId) in new generations, and (2) fine-grained duplicate-avoidance
// (a specific tic or contradiction already used) only covers the
// recent window, not the whole category's history. The overflow
// summary below covers the coarser signal (which role/faction, tier/
// faction, etc. combinations are already in use) for everything beyond
// the cap, which is what matters most for avoiding an obviously
// repetitive next entry. 60 is a generous window for where beta worlds
// sit today -- revisit if a world's real usage starts bumping into it.
const MAX_FULL_ROSTER_LINES = 60;

// manifest is assumed ordered oldest-first (see entriesRepo.js's
// listEntries: .order("created_at", { ascending: true })), so the most
// recent N is the last N array elements after filtering out locked
// (still-unfilled) entries.
function splitRosterForCap(manifest, maxFull = MAX_FULL_ROSTER_LINES) {
  const unlocked = manifest.filter((m) => !m.locked);
  if (unlocked.length <= maxFull) {
    return { recent: unlocked, overflow: [] };
  }
  return {
    recent: unlocked.slice(-maxFull),
    overflow: unlocked.slice(0, -maxFull)
  };
}

// Tallies two manifest-level fields (already present on every manifest
// row -- see entriesRepo.js's rowToManifestEntry -- no extra fetch
// needed) into a compact "Value A—Value B (xN)" summary for entries
// beyond the cap. Deliberately counts DISTINCT combinations rather than
// listing individuals -- naturally bounded in size (there are only so
// many role×faction or tier×faction pairs), unlike listing every entry,
// which is exactly the growth this whole cap exists to avoid.
function tallyOverflowCombos(overflow, field1, field2, fallback1, fallback2) {
  if (overflow.length === 0) return "";
  const counts = new Map();
  for (const m of overflow) {
    const key = `${m[field1] || fallback1} — ${m[field2] || fallback2}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const summary = [...counts.entries()]
    .map(([combo, count]) => `${combo}${count > 1 ? ` (x${count})` : ""}`)
    .join(", ");
  return `\n(+ ${overflow.length} older entries not shown individually -- combinations already covered among them: ${summary})`;
}

// Simpler overflow note for categories without a natural two-field
// combo to tally (classes, survivors, logs) -- just the count, still
// bounds roster size the same way.
function plainOverflowNote(overflow) {
  if (overflow.length === 0) return "";
  return `\n(+ ${overflow.length} older entries not shown individually)`;
}

// ---------- NPCs ----------

async function readNpcManifest(worldId) {
  return listEntries(worldId, "npcs");
}

async function readNpcEntry(worldId, id) {
  return getEntry(worldId, "npcs", id);
}

// Builds a compact text block for the Call 1 system prompt describing
// what role+faction combos, contradictions, and tics are already in use.
async function buildRosterContext(worldId) {
  const manifest = await readNpcManifest(worldId);
  const { recent, overflow } = splitRosterForCap(manifest);
  const lines = [];
  for (const m of recent) {
    const entry = await readNpcEntry(worldId, m.id);
    const role = m.roleArchetype || "(role unspecified)";
    const faction = m.faction || "unaligned";
    let extra = "";
    if (entry) {
      if (entry.tic) extra += ` | tic: ${entry.tic}`;
      if (entry.contradiction) extra += ` | contradiction: ${entry.contradiction}`;
    }
    lines.push(`- id: ${m.id} | ${m.name}: ${role} — ${faction}${extra}`);
  }
  const overflowNote = tallyOverflowCombos(overflow, "roleArchetype", "faction", "(role unspecified)", "unaligned");
  if (lines.length === 0 && !overflowNote) {
    return "No NPCs archived yet — any role+faction combination is available.";
  }
  return lines.join("\n") + overflowNote;
}

// ---------- Enemies ----------

async function readEnemyManifest(worldId) {
  return listEntries(worldId, "enemies");
}

async function readEnemyEntry(worldId, id) {
  return getEntry(worldId, "enemies", id);
}

// Compact roster summary for the enemy Call 1 system prompt: faction+tier
// combos in use, and named abilities already used (overlap-checking).
async function buildEnemyRosterContext(worldId) {
  const manifest = await readEnemyManifest(worldId);
  const { recent, overflow } = splitRosterForCap(manifest);
  const lines = [];
  for (const m of recent) {
    const entry = await readEnemyEntry(worldId, m.id);
    const tier = m.tier || "(tier unspecified)";
    const faction = m.faction || "unaligned";
    let extra = "";
    if (entry && entry.bodyHtml) {
      const abilityNames = [...entry.bodyHtml.matchAll(/class="ability-name">([^<]+)</g)].map((mm) => mm[1].trim());
      if (abilityNames.length) extra += ` | abilities: ${abilityNames.join(", ")}`;
    }
    lines.push(`- id: ${m.id} | ${m.name}: ${tier} — ${faction}${extra}`);
  }
  const overflowNote = tallyOverflowCombos(overflow, "faction", "tier", "unaligned", "(tier unspecified)");
  if (lines.length === 0 && !overflowNote) {
    return "No enemies archived yet — any faction+tier combination is available.";
  }
  return lines.join("\n") + overflowNote;
}

// ---------- Items ----------

async function readItemManifest(worldId) {
  return listEntries(worldId, "items");
}

async function readItemEntry(worldId, id) {
  return getEntry(worldId, "items", id);
}

async function buildItemRosterContext(worldId) {
  const manifest = await readItemManifest(worldId);
  const { recent, overflow } = splitRosterForCap(manifest);
  const lines = [];
  for (const m of recent) {
    const entry = await readItemEntry(worldId, m.id);
    const rarity = entry && entry.rarity ? entry.rarity : "";
    lines.push(`- id: ${m.id} | ${m.name}: ${m.subtitle}${rarity ? ` (${rarity})` : ""}`);
  }
  const overflowNote = tallyOverflowCombos(overflow, "itemCategory", "rarity", "(category unspecified)", "Common");
  if (lines.length === 0 && !overflowNote) {
    return "No items archived yet — any category/rarity combination is available.";
  }
  return lines.join("\n") + overflowNote;
}

// ---------- Classes ----------

// Static fallback per references/classes_reference.md, used only if no
// classes have been archived yet for this world.
const FALLBACK_CLASS_LIST = [
  "Architect", "Neon-Jack", "Butcher", "Courier", "Bouncer",
  "Miner", "Riot Officer", "Surgeon", "Prizefighter", "Electrician",
  "Zoo Keeper", "Tailor", "Linguist", "Streamer", "Idol", "Plumber"
];

async function readClassManifest(worldId) {
  return listEntries(worldId, "classes");
}

async function readClassEntry(worldId, id) {
  return getEntry(worldId, "classes", id);
}

// Returns a plain-text list of assignable class names for the survivor
// prompt, preferring live archived classes over the static fallback.
async function buildAvailableClassesText(worldId) {
  const manifest = await readClassManifest(worldId);
  const unlocked = manifest.filter((m) => !m.locked);
  if (unlocked.length === 0) {
    return FALLBACK_CLASS_LIST.map((c) => `- ${c}`).join("\n");
  }
  // Class names are stored like "The Tailor → The Weaver" - use the base name.
  return unlocked
    .map((m) => `- ${m.name.split("→")[0].replace(/^The\s+/i, "").trim()}`)
    .join("\n");
}

async function buildClassRosterContext(worldId) {
  const manifest = await readClassManifest(worldId);
  const { recent, overflow } = splitRosterForCap(manifest);
  const lines = recent.map((m) => `- id: ${m.id} | ${m.name}: ${m.subtitle}`);
  return lines.join("\n") + plainOverflowNote(overflow);
}

// ---------- Survivors ----------

async function readSurvivorManifest(worldId) {
  return listEntries(worldId, "survivors");
}

async function readSurvivorEntry(worldId, id) {
  return getEntry(worldId, "survivors", id);
}

async function buildSurvivorRosterContext(worldId) {
  const manifest = await readSurvivorManifest(worldId);
  const { recent, overflow } = splitRosterForCap(manifest);
  const lines = recent.map((m) => `- id: ${m.id} | ${m.name}: ${m.subtitle}`);
  const overflowNote = plainOverflowNote(overflow);
  if (lines.length === 0 && !overflowNote) {
    return "No survivors archived yet — any name+class pairing is available.";
  }
  return lines.join("\n") + overflowNote;
}

// ---------- Logs ----------

async function readLogManifest(worldId) {
  return listEntries(worldId, "logs");
}

async function readLogEntry(worldId, id) {
  return getEntry(worldId, "logs", id);
}

async function buildLogRosterContext(worldId) {
  const manifest = await readLogManifest(worldId);
  const { recent, overflow } = splitRosterForCap(manifest);
  const lines = [];
  for (const m of recent) {
    const entry = await readLogEntry(worldId, m.id);
    const chars = entry && entry.subtitle ? entry.subtitle : "";
    lines.push(`- id: ${m.id} | ${m.name}: ${m.subtitle}${chars ? ` | ${chars}` : ""}`);
  }
  const overflowNote = plainOverflowNote(overflow);
  if (lines.length === 0 && !overflowNote) {
    return "No logs archived yet — any character/location/beat is available.";
  }
  return lines.join("\n") + overflowNote;
}

// ---------- Factions ----------

async function readFactionManifest(worldId) {
  return listEntries(worldId, "factions");
}

async function readFactionEntry(worldId, id) {
  return getEntry(worldId, "factions", id);
}

// ---------- Locations ----------

async function readLocationManifest(worldId) {
  return listEntries(worldId, "locations");
}

async function readLocationEntry(worldId, id) {
  return getEntry(worldId, "locations", id);
}

// Compact roster summary for the Location Call 1 system prompt:
// region/faction/danger-tag combos already in use (overlap-checking),
// same shape as buildRosterContext's NPC version.
async function buildLocationRosterContext(worldId) {
  const manifest = await readLocationManifest(worldId);
  const { recent, overflow } = splitRosterForCap(manifest);
  const lines = [];
  for (const m of recent) {
    const region = m.regionBiome || "(region unspecified)";
    const faction = m.faction || "unaligned";
    lines.push(`- id: ${m.id} | ${m.name}: ${region} — ${faction}`);
  }
  const overflowNote = tallyOverflowCombos(overflow, "regionBiome", "faction", "(region unspecified)", "unaligned");
  if (lines.length === 0 && !overflowNote) {
    return "No locations archived yet — any region/faction/danger-tag combination is available.";
  }
  return lines.join("\n") + overflowNote;
}

module.exports = {
  buildRosterContext,
  readNpcManifest,
  readNpcEntry,
  readEnemyManifest,
  readEnemyEntry,
  buildEnemyRosterContext,
  readItemManifest,
  readItemEntry,
  buildItemRosterContext,
  readClassManifest,
  buildAvailableClassesText,
  readSurvivorManifest,
  readSurvivorEntry,
  buildSurvivorRosterContext,
  readLogManifest,
  readLogEntry,
  buildLogRosterContext,
  readClassEntry,
  buildClassRosterContext,
  readFactionManifest,
  readFactionEntry,
  readLocationManifest,
  readLocationEntry,
  buildLocationRosterContext
};
