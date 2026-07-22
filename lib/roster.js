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
  const lines = [];
  for (const m of manifest) {
    if (m.locked) continue;
    const entry = await readNpcEntry(worldId, m.id);
    const role = m.roleArchetype || "(role unspecified)";
    const faction = m.faction || "unaligned";
    let extra = "";
    if (entry) {
      if (entry.tic) extra += ` | tic: ${entry.tic}`;
      if (entry.contradiction) extra += ` | contradiction: ${entry.contradiction}`;
    }
    lines.push(`- ${m.name}: ${role} — ${faction}${extra}`);
  }
  if (lines.length === 0) {
    return "No NPCs archived yet — any role+faction combination is available.";
  }
  return lines.join("\n");
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
  const lines = [];
  for (const m of manifest) {
    if (m.locked) continue;
    const entry = await readEnemyEntry(worldId, m.id);
    const tier = m.tier || "(tier unspecified)";
    const faction = m.faction || "unaligned";
    let extra = "";
    if (entry && entry.bodyHtml) {
      const abilityNames = [...entry.bodyHtml.matchAll(/class="ability-name">([^<]+)</g)].map((mm) => mm[1].trim());
      if (abilityNames.length) extra += ` | abilities: ${abilityNames.join(", ")}`;
    }
    lines.push(`- ${m.name}: ${tier} — ${faction}${extra}`);
  }
  if (lines.length === 0) {
    return "No enemies archived yet — any faction+tier combination is available.";
  }
  return lines.join("\n");
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
  const lines = [];
  for (const m of manifest) {
    if (m.locked) continue;
    const entry = await readItemEntry(worldId, m.id);
    const rarity = entry && entry.rarity ? entry.rarity : "";
    lines.push(`- ${m.name}: ${m.subtitle}${rarity ? ` (${rarity})` : ""}`);
  }
  if (lines.length === 0) {
    return "No items archived yet — any category/rarity combination is available.";
  }
  return lines.join("\n");
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
  const lines = [];
  for (const m of manifest) {
    if (m.locked) continue;
    lines.push(`- ${m.name}: ${m.subtitle}`);
  }
  if (lines.length === 0) {
    return "No classes archived yet — any profession concept is available.";
  }
  return lines.join("\n");
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
  const lines = [];
  for (const m of manifest) {
    if (m.locked) continue;
    lines.push(`- ${m.name}: ${m.subtitle}`);
  }
  if (lines.length === 0) {
    return "No survivors archived yet — any name+class pairing is available.";
  }
  return lines.join("\n");
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
  const lines = [];
  for (const m of manifest) {
    if (m.locked) continue;
    const entry = await readLogEntry(worldId, m.id);
    const chars = entry && entry.subtitle ? entry.subtitle : "";
    lines.push(`- ${m.name}: ${m.subtitle}${chars ? ` | ${chars}` : ""}`);
  }
  if (lines.length === 0) {
    return "No logs archived yet — any character/location/beat is available.";
  }
  return lines.join("\n");
}

// ---------- Factions ----------

async function readFactionManifest(worldId) {
  return listEntries(worldId, "factions");
}

async function readFactionEntry(worldId, id) {
  return getEntry(worldId, "factions", id);
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
  readFactionEntry
};
