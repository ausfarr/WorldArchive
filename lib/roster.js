const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadWindowExport(fileText, varName) {
  const idx = fileText.indexOf(`window.${varName} =`);
  if (idx === -1) return null;
  let body = fileText.slice(idx + `window.${varName} =`.length).trim();
  body = body.replace(/;\s*$/, "");
  const sandbox = {};
  vm.createContext(sandbox);
  try {
    return vm.runInContext(`(${body})`, sandbox, { timeout: 2000 });
  } catch (err) {
    console.error(`Failed to parse window.${varName}:`, err.message);
    return null;
  }
}

function readNpcManifest(archiveRoot) {
  const manifestPath = path.join(archiveRoot, "npcs", "manifest.js");
  if (!fs.existsSync(manifestPath)) return [];
  const text = fs.readFileSync(manifestPath, "utf8");
  return loadWindowExport(text, "MANIFEST_NPCS") || [];
}

function readNpcEntry(archiveRoot, id) {
  const dataPath = path.join(archiveRoot, "npcs", "data", `${id}.js`);
  if (!fs.existsSync(dataPath)) return null;
  const text = fs.readFileSync(dataPath, "utf8");
  return loadWindowExport(text, "ENTRY");
}

// Builds a compact text block for the Call 1 system prompt describing
// what role+faction combos, contradictions, and tics are already in use.
function buildRosterContext(archiveRoot) {
  const manifest = readNpcManifest(archiveRoot);
  const lines = [];
  for (const m of manifest) {
    if (m.locked) continue;
    const entry = readNpcEntry(archiveRoot, m.id);
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

function readEnemyManifest(archiveRoot) {
  const manifestPath = path.join(archiveRoot, "enemies", "manifest.js");
  if (!fs.existsSync(manifestPath)) return [];
  const text = fs.readFileSync(manifestPath, "utf8");
  return loadWindowExport(text, "MANIFEST_ENEMIES") || [];
}

function readEnemyEntry(archiveRoot, id) {
  const dataPath = path.join(archiveRoot, "enemies", "data", `${id}.js`);
  if (!fs.existsSync(dataPath)) return null;
  const text = fs.readFileSync(dataPath, "utf8");
  return loadWindowExport(text, "ENTRY");
}

// Compact roster summary for the enemy Call 1 system prompt: faction+tier
// combos in use, and named abilities already used (overlap-checking).
function buildEnemyRosterContext(archiveRoot) {
  const manifest = readEnemyManifest(archiveRoot);
  const lines = [];
  for (const m of manifest) {
    if (m.locked) continue;
    const entry = readEnemyEntry(archiveRoot, m.id);
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

function readItemManifest(archiveRoot) {
  const manifestPath = path.join(archiveRoot, "items", "manifest.js");
  if (!fs.existsSync(manifestPath)) return [];
  const text = fs.readFileSync(manifestPath, "utf8");
  return loadWindowExport(text, "MANIFEST_ITEMS") || [];
}

function readItemEntry(archiveRoot, id) {
  const dataPath = path.join(archiveRoot, "items", "data", `${id}.js`);
  if (!fs.existsSync(dataPath)) return null;
  const text = fs.readFileSync(dataPath, "utf8");
  return loadWindowExport(text, "ENTRY");
}

function buildItemRosterContext(archiveRoot) {
  const manifest = readItemManifest(archiveRoot);
  const lines = [];
  for (const m of manifest) {
    if (m.locked) continue;
    const entry = readItemEntry(archiveRoot, m.id);
    const rarity = entry && entry.rarity ? entry.rarity : "";
    lines.push(`- ${m.name}: ${m.subtitle}${rarity ? ` (${rarity})` : ""}`);
  }
  if (lines.length === 0) {
    return "No items archived yet — any category/rarity combination is available.";
  }
  return lines.join("\n");
}

// Static fallback per references/classes_reference.md, used only if no
// classes have been archived yet (that file explicitly says it may be
// stale and the live archive should take priority).
const FALLBACK_CLASS_LIST = [
  "Architect", "Neon-Jack", "Butcher", "Courier", "Bouncer",
  "Miner", "Riot Officer", "Surgeon", "Prizefighter", "Electrician",
  "Zoo Keeper", "Tailor", "Linguist", "Streamer", "Idol", "Plumber"
];

function readClassManifest(archiveRoot) {
  const manifestPath = path.join(archiveRoot, "classes", "manifest.js");
  if (!fs.existsSync(manifestPath)) return [];
  const text = fs.readFileSync(manifestPath, "utf8");
  return loadWindowExport(text, "MANIFEST_CLASSES") || [];
}

// Returns a plain-text list of assignable class names for the survivor
// prompt, preferring live archived classes over the static fallback.
function buildAvailableClassesText(archiveRoot) {
  const manifest = readClassManifest(archiveRoot);
  const unlocked = manifest.filter((m) => !m.locked);
  if (unlocked.length === 0) {
    return FALLBACK_CLASS_LIST.map((c) => `- ${c}`).join("\n");
  }
  // Class names are stored like "The Tailor → The Weaver" - use the base name.
  return unlocked
    .map((m) => `- ${m.name.split("→")[0].replace(/^The\s+/i, "").trim()}`)
    .join("\n");
}

function readSurvivorManifest(archiveRoot) {
  const manifestPath = path.join(archiveRoot, "survivors", "manifest.js");
  if (!fs.existsSync(manifestPath)) return [];
  const text = fs.readFileSync(manifestPath, "utf8");
  return loadWindowExport(text, "MANIFEST_SURVIVORS") || [];
}

function readSurvivorEntry(archiveRoot, id) {
  const dataPath = path.join(archiveRoot, "survivors", "data", `${id}.js`);
  if (!fs.existsSync(dataPath)) return null;
  const text = fs.readFileSync(dataPath, "utf8");
  return loadWindowExport(text, "ENTRY");
}

function buildSurvivorRosterContext(archiveRoot) {
  const manifest = readSurvivorManifest(archiveRoot);
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

function readLogManifest(archiveRoot) {
  const manifestPath = path.join(archiveRoot, "logs", "manifest.js");
  if (!fs.existsSync(manifestPath)) return [];
  const text = fs.readFileSync(manifestPath, "utf8");
  return loadWindowExport(text, "MANIFEST_LOGS") || [];
}

function readLogEntry(archiveRoot, id) {
  const dataPath = path.join(archiveRoot, "logs", "data", `${id}.js`);
  if (!fs.existsSync(dataPath)) return null;
  const text = fs.readFileSync(dataPath, "utf8");
  return loadWindowExport(text, "ENTRY");
}

function buildLogRosterContext(archiveRoot) {
  const manifest = readLogManifest(archiveRoot);
  const lines = [];
  for (const m of manifest) {
    if (m.locked) continue;
    const entry = readLogEntry(archiveRoot, m.id);
    const chars = entry && entry.subtitle ? entry.subtitle : "";
    lines.push(`- ${m.name}: ${m.subtitle}${chars ? ` | ${chars}` : ""}`);
  }
  if (lines.length === 0) {
    return "No logs archived yet — any character/location/beat is available.";
  }
  return lines.join("\n");
}

function readClassEntry(archiveRoot, id) {
  const dataPath = path.join(archiveRoot, "classes", "data", `${id}.js`);
  if (!fs.existsSync(dataPath)) return null;
  const text = fs.readFileSync(dataPath, "utf8");
  return loadWindowExport(text, "ENTRY");
}

function buildClassRosterContext(archiveRoot) {
  const manifest = readClassManifest(archiveRoot);
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

function readFactionManifest(archiveRoot) {
  const manifestPath = path.join(archiveRoot, "factions", "manifest.js");
  if (!fs.existsSync(manifestPath)) return [];
  const text = fs.readFileSync(manifestPath, "utf8");
  return loadWindowExport(text, "MANIFEST_FACTIONS") || [];
}

module.exports = {
  buildRosterContext,
  readNpcManifest,
  readNpcEntry,
  loadWindowExport,
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
  readFactionManifest
};
