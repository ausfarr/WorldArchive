const fs = require("fs");
const path = require("path");
const { buildEntryFileContent, buildManifestEntry } = require("./entryTemplate");
const { readNpcManifest } = require("./roster");

function writeNpcDataFile(archiveRoot, npc) {
  const outPath = path.join(archiveRoot, "npcs", "data", `${npc.id}.js`);
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
  fs.writeFileSync(outPath, imageBuffer);
  return outPath;
}

module.exports = { writeNpcDataFile, appendToManifest, saveImage };
