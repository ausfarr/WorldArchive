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

module.exports = { buildRosterContext, readNpcManifest, readNpcEntry, loadWindowExport };
