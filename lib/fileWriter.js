const fs = require("fs");
const path = require("path");

const { buildEntryFileContent, buildManifestEntry } = require("./entryTemplate");
const { buildEnemyEntryFileContent, buildEnemyManifestEntry } = require("./enemyTemplate");
const { buildItemEntryFileContent, buildItemManifestEntry } = require("./itemTemplate");
const { buildSurvivorEntryFileContent, buildSurvivorManifestEntry } = require("./survivorTemplate");
const { buildLogEntryFileContent, buildLogManifestEntry } = require("./logTemplate");
const { buildClassEntryFileContent, buildClassManifestEntry } = require("./classTemplate");
const {
  readNpcManifest,
  readEnemyManifest,
  readItemManifest,
  readSurvivorManifest,
  readLogManifest,
  readClassManifest
} = require("./roster");

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// If an entry with this id already exists in the manifest (e.g. a locked
// placeholder being filled in), replace it in place, preserving array
// order. Otherwise append as a new entry. This one function is what makes
// "generate new" and "fill in existing" share the same write path.
function upsertManifestEntry(currentArray, newEntry) {
  const idx = currentArray.findIndex((e) => e.id === newEntry.id);
  if (idx === -1) {
    currentArray.push(newEntry);
  } else {
    currentArray[idx] = newEntry;
  }
  return currentArray;
}

function saveImage(archiveRoot, id, imageBuffer) {
  if (!imageBuffer) return null;
  const outPath = path.join(archiveRoot, "images", `${id}.png`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, imageBuffer);
  return outPath;
}

// ---------- NPCs ----------
function writeNpcDataFile(archiveRoot, npc) {
  const outPath = path.join(archiveRoot, "npcs", "data", `${npc.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildEntryFileContent(npc), "utf8");
  return outPath;
}
function appendToManifest(archiveRoot, npc) {
  const manifestPath = path.join(archiveRoot, "npcs", "manifest.js");
  const current = upsertManifestEntry(readNpcManifest(archiveRoot), buildManifestEntry(npc));
  fs.writeFileSync(manifestPath, `window.MANIFEST_NPCS = ${JSON.stringify(current, null, 2)};\n`, "utf8");
  return manifestPath;
}

// ---------- Enemies ----------
function writeEnemyDataFile(archiveRoot, enemy) {
  const outPath = path.join(archiveRoot, "enemies", "data", `${enemy.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildEnemyEntryFileContent(enemy), "utf8");
  return outPath;
}
function appendToEnemyManifest(archiveRoot, enemy) {
  const manifestPath = path.join(archiveRoot, "enemies", "manifest.js");
  const current = upsertManifestEntry(readEnemyManifest(archiveRoot), buildEnemyManifestEntry(enemy));
  fs.writeFileSync(manifestPath, `window.MANIFEST_ENEMIES = ${JSON.stringify(current, null, 2)};\n`, "utf8");
  return manifestPath;
}

// ---------- Items ----------
function writeItemDataFile(archiveRoot, item) {
  const outPath = path.join(archiveRoot, "items", "data", `${item.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildItemEntryFileContent(item), "utf8");
  return outPath;
}
function appendToItemManifest(archiveRoot, item) {
  const manifestPath = path.join(archiveRoot, "items", "manifest.js");
  const current = upsertManifestEntry(readItemManifest(archiveRoot), buildItemManifestEntry(item));
  fs.writeFileSync(manifestPath, `window.MANIFEST_ITEMS = ${JSON.stringify(current, null, 2)};\n`, "utf8");
  return manifestPath;
}

// ---------- Survivors ----------
function writeSurvivorDataFile(archiveRoot, survivor) {
  const outPath = path.join(archiveRoot, "survivors", "data", `${survivor.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildSurvivorEntryFileContent(survivor), "utf8");
  return outPath;
}
function appendToSurvivorManifest(archiveRoot, survivor) {
  const manifestPath = path.join(archiveRoot, "survivors", "manifest.js");
  const current = upsertManifestEntry(readSurvivorManifest(archiveRoot), buildSurvivorManifestEntry(survivor));
  fs.writeFileSync(manifestPath, `window.MANIFEST_SURVIVORS = ${JSON.stringify(current, null, 2)};\n`, "utf8");
  return manifestPath;
}

// ---------- Logs ----------
function writeLogDataFile(archiveRoot, log) {
  const outPath = path.join(archiveRoot, "logs", "data", `${log.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildLogEntryFileContent(log), "utf8");
  return outPath;
}
function appendToLogManifest(archiveRoot, log) {
  const manifestPath = path.join(archiveRoot, "logs", "manifest.js");
  const current = upsertManifestEntry(readLogManifest(archiveRoot), buildLogManifestEntry(log));
  fs.writeFileSync(manifestPath, `window.MANIFEST_LOGS = ${JSON.stringify(current, null, 2)};\n`, "utf8");
  return manifestPath;
}

// ---------- Classes ----------
function writeClassDataFile(archiveRoot, cls) {
  const outPath = path.join(archiveRoot, "classes", "data", `${cls.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildClassEntryFileContent(cls), "utf8");
  return outPath;
}
function appendToClassManifest(archiveRoot, cls) {
  const manifestPath = path.join(archiveRoot, "classes", "manifest.js");
  const current = upsertManifestEntry(readClassManifest(archiveRoot), buildClassManifestEntry(cls));
  fs.writeFileSync(manifestPath, `window.MANIFEST_CLASSES = ${JSON.stringify(current, null, 2)};\n`, "utf8");
  return manifestPath;
}

// ---------- Factions (always upsert - only 5 possible ids, never new) ----------
function writeFactionDataFile(archiveRoot, faction, roundupRows) {
  const outPath = path.join(archiveRoot, "factions", "data", `${faction.id}.js`);
  ensureDirFor(outPath);
  const { buildFactionEntryFileContent } = require("./factionTemplate");
  fs.writeFileSync(outPath, buildFactionEntryFileContent(faction, roundupRows), "utf8");
  return outPath;
}
function updateFactionManifest(archiveRoot, faction) {
  const manifestPath = path.join(archiveRoot, "factions", "manifest.js");
  const { readFactionManifest } = require("./roster");
  const { buildFactionManifestEntry } = require("./factionTemplate");
  const current = upsertManifestEntry(readFactionManifest(archiveRoot), buildFactionManifestEntry(faction));
  fs.writeFileSync(manifestPath, `window.MANIFEST_FACTIONS = ${JSON.stringify(current, null, 2)};\n`, "utf8");
  return manifestPath;
}

module.exports = {
  ensureDirFor,
  upsertManifestEntry,
  writeNpcDataFile,
  appendToManifest,
  saveImage,
  writeEnemyDataFile,
  appendToEnemyManifest,
  writeItemDataFile,
  appendToItemManifest,
  writeSurvivorDataFile,
  appendToSurvivorManifest,
  writeLogDataFile,
  appendToLogManifest,
  writeClassDataFile,
  appendToClassManifest,
  writeFactionDataFile,
  updateFactionManifest
};
