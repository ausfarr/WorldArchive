const fs = require("fs");
const path = require("path");
const { buildEntryFileContent, buildManifestEntry } = require("./entryTemplate");
const { readNpcManifest } = require("./roster");

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeNpcDataFile(archiveRoot, npc) {
  const outPath = path.join(archiveRoot, "npcs", "data", `${npc.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildEntryFileContent(npc), "utf8");
  return outPath;
}

function appendToManifest(archiveRoot, npc) {
  const manifestPath = path.join(archiveRoot, "npcs", "manifest.js");
  const current = readNpcManifest(archiveRoot);
  current.push(buildManifestEntry(npc));
  const content = `window.MANIFEST_NPCS = ${JSON.stringify(current, null, 2)};\n`;
  fs.writeFileSync(manifestPath, content, "utf8");
  return manifestPath;
}

function saveImage(archiveRoot, id, imageBuffer) {
  if (!imageBuffer) return null;
  const outPath = path.join(archiveRoot, "images", `${id}.png`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, imageBuffer);
  return outPath;
}

const { buildEnemyEntryFileContent, buildEnemyManifestEntry } = require("./enemyTemplate");
const { readEnemyManifest } = require("./roster");

function writeEnemyDataFile(archiveRoot, enemy) {
  const outPath = path.join(archiveRoot, "enemies", "data", `${enemy.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildEnemyEntryFileContent(enemy), "utf8");
  return outPath;
}

function appendToEnemyManifest(archiveRoot, enemy) {
  const manifestPath = path.join(archiveRoot, "enemies", "manifest.js");
  const current = readEnemyManifest(archiveRoot);
  current.push(buildEnemyManifestEntry(enemy));
  const content = `window.MANIFEST_ENEMIES = ${JSON.stringify(current, null, 2)};\n`;
  fs.writeFileSync(manifestPath, content, "utf8");
  return manifestPath;
}

const { buildItemEntryFileContent, buildItemManifestEntry } = require("./itemTemplate");
const { readItemManifest } = require("./roster");

function writeItemDataFile(archiveRoot, item) {
  const outPath = path.join(archiveRoot, "items", "data", `${item.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildItemEntryFileContent(item), "utf8");
  return outPath;
}

function appendToItemManifest(archiveRoot, item) {
  const manifestPath = path.join(archiveRoot, "items", "manifest.js");
  const current = readItemManifest(archiveRoot);
  current.push(buildItemManifestEntry(item));
  const content = `window.MANIFEST_ITEMS = ${JSON.stringify(current, null, 2)};\n`;
  fs.writeFileSync(manifestPath, content, "utf8");
  return manifestPath;
}

const { buildSurvivorEntryFileContent, buildSurvivorManifestEntry } = require("./survivorTemplate");
const { readSurvivorManifest } = require("./roster");

function writeSurvivorDataFile(archiveRoot, survivor) {
  const outPath = path.join(archiveRoot, "survivors", "data", `${survivor.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildSurvivorEntryFileContent(survivor), "utf8");
  return outPath;
}

function appendToSurvivorManifest(archiveRoot, survivor) {
  const manifestPath = path.join(archiveRoot, "survivors", "manifest.js");
  const current = readSurvivorManifest(archiveRoot);
  current.push(buildSurvivorManifestEntry(survivor));
  const content = `window.MANIFEST_SURVIVORS = ${JSON.stringify(current, null, 2)};\n`;
  fs.writeFileSync(manifestPath, content, "utf8");
  return manifestPath;
}

const { buildLogEntryFileContent, buildLogManifestEntry } = require("./logTemplate");
const { readLogManifest } = require("./roster");

function writeLogDataFile(archiveRoot, log) {
  const outPath = path.join(archiveRoot, "logs", "data", `${log.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildLogEntryFileContent(log), "utf8");
  return outPath;
}

function appendToLogManifest(archiveRoot, log) {
  const manifestPath = path.join(archiveRoot, "logs", "manifest.js");
  const current = readLogManifest(archiveRoot);
  current.push(buildLogManifestEntry(log));
  const content = `window.MANIFEST_LOGS = ${JSON.stringify(current, null, 2)};\n`;
  fs.writeFileSync(manifestPath, content, "utf8");
  return manifestPath;
}

const { buildClassEntryFileContent, buildClassManifestEntry } = require("./classTemplate");
const { readClassManifest } = require("./roster");

function writeClassDataFile(archiveRoot, cls) {
  const outPath = path.join(archiveRoot, "classes", "data", `${cls.id}.js`);
  ensureDirFor(outPath);
  fs.writeFileSync(outPath, buildClassEntryFileContent(cls), "utf8");
  return outPath;
}

function appendToClassManifest(archiveRoot, cls) {
  const manifestPath = path.join(archiveRoot, "classes", "manifest.js");
  const current = readClassManifest(archiveRoot);
  current.push(buildClassManifestEntry(cls));
  const content = `window.MANIFEST_CLASSES = ${JSON.stringify(current, null, 2)};\n`;
  fs.writeFileSync(manifestPath, content, "utf8");
  return manifestPath;
}

module.exports = {
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
  appendToClassManifest
};
