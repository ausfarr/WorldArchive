// scripts/bump-cache-version.js
//
// Bumps lib/version.js's APP_VERSION AND every `?v=...` cache-busting
// query param on <script src="...(one of CACHE_BUSTED_SCRIPTS)"> tags
// across archive/*.html and archive/*/*.html, in one command -- added
// this session after a real bug where a stale cached render.js kept
// serving after deploy with no way for a browser to know a new version
// existed (see lib/version.js's comment).
//
// Usage:
//   node scripts/bump-cache-version.js v0.10
//
// Run this any time you ship a change to any file in CACHE_BUSTED_SCRIPTS
// -- if you forget, the deploy will still succeed, it'll just be
// invisible to anyone with a warm browser cache until they clear it or
// the browser's own heuristics eventually expire it.
//
// CACHE_BUSTED_SCRIPTS is the single list this script matches against --
// add a new archive/js/*.js file here the day it's created, not the day
// someone notices it never got cache-busted. worldArtActions.js,
// campaignArc.js, and campaignModule.js were all missing from the
// original hardcoded (render|mapLayout|portraitActions) regex alternation
// -- worldArtActions.js silently drifted to a stale ?v= no later run of
// this script could ever fix (the regex didn't match its filename at
// all, so the "already has a ?v=" replace path never triggered), and
// campaignArc.js/campaignModule.js had no ?v= param whatsoever.
const CACHE_BUSTED_SCRIPTS = [
  "render",
  "mapLayout",
  "portraitActions",
  "worldArtActions",
  "campaignArc",
  "campaignModule",
  "auth",
  "wizardSession",
  "themeBootstrap",
  "rulesetManualForms"
];

const fs = require("fs");
const path = require("path");

const newVersion = process.argv[2];
if (!newVersion || !/^v\d+\.\d+(\.\d+)?$/.test(newVersion)) {
  console.error('Usage: node scripts/bump-cache-version.js v0.10');
  console.error('(version must look like "v0.10" or "v0.10.1")');
  process.exit(1);
}

const versionFilePath = path.join(__dirname, "..", "lib", "version.js");
let versionFileContent = fs.readFileSync(versionFilePath, "utf8");
const before = versionFileContent;
versionFileContent = versionFileContent.replace(
  /APP_VERSION:\s*"[^"]*"/,
  `APP_VERSION: "${newVersion}"`
);
if (versionFileContent === before) {
  console.error("Couldn't find APP_VERSION in lib/version.js -- check it wasn't renamed.");
  process.exit(1);
}
fs.writeFileSync(versionFilePath, versionFileContent);
console.log(`lib/version.js -> APP_VERSION: "${newVersion}"`);

const repoRoot = path.join(__dirname, "..");
const archiveDir = path.join(repoRoot, "archive");

// Plain fs scan instead of a glob dependency -- this repo doesn't have
// one installed and it's not worth adding just for a one-off helper
// script. Matches archive/*.html and archive/*/*.html (one level of
// subdirectories, e.g. archive/npcs/index.html), same set the earlier
// hand-written bulk edit covered.
function findHtmlFiles() {
  const results = [];
  for (const entry of fs.readdirSync(archiveDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) {
      results.push(path.join("archive", entry.name));
    } else if (entry.isDirectory()) {
      const subDir = path.join(archiveDir, entry.name);
      for (const subEntry of fs.readdirSync(subDir, { withFileTypes: true })) {
        if (subEntry.isFile() && subEntry.name.endsWith(".html")) {
          results.push(path.join("archive", entry.name, subEntry.name));
        }
      }
    }
  }
  return results;
}

const htmlFiles = findHtmlFiles();

const scriptNameAlternation = CACHE_BUSTED_SCRIPTS.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const scriptSrcPattern = new RegExp(`src="([^"]*(?:${scriptNameAlternation})\\.js)(?:\\?v=[^"]*)?"`, "g");
let filesChanged = 0;
let tagsChanged = 0;

for (const relPath of htmlFiles) {
  const fullPath = path.join(repoRoot, relPath);
  const content = fs.readFileSync(fullPath, "utf8");
  let count = 0;
  const updated = content.replace(scriptSrcPattern, (match, srcPath) => {
    count++;
    return `src="${srcPath}?v=${newVersion}"`;
  });
  if (count > 0) {
    fs.writeFileSync(fullPath, updated);
    filesChanged++;
    tagsChanged += count;
  }
}

console.log(`Updated ${tagsChanged} script tag(s) across ${filesChanged} file(s).`);
