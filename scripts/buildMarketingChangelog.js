#!/usr/bin/env node
// Regenerates marketing/changelog.html's entry list from the repo's real
// CHANGELOG.md, so publishing a build-in-public update doesn't mean
// hand-copying prose into two places.
//
// This is NOT a fully automatic mirror -- CHANGELOG.md is an internal
// devlog (Phase labels, addendum file links, internal-only notes,
// unreleased/roadmap chatter that isn't ready for a public audience). This
// script strips that internal-only scaffolding and reformats what's left
// into the marketing site's entry markup, but the output is still meant
// to be skimmed before pushing live, not blindly trusted -- see the
// printed reminder at the end of a run.
//
// Usage: node scripts/buildMarketingChangelog.js
// (No Render build step runs this automatically -- see README's marketing
// section. Run it locally and commit the regenerated changelog.html
// whenever CHANGELOG.md picks up a new numbered version.)

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CHANGELOG_MD = path.join(ROOT, "CHANGELOG.md");
const CHANGELOG_HTML = path.join(ROOT, "marketing", "changelog.html");

// CHANGELOG.md's own dates are almost all "[DATE]" placeholders (see its
// header note: backfilled entries were never given precise dates). These
// were filled in by hand from memory for the public-facing page at some
// point; kept here so regenerating the page doesn't regress real dates
// back to "date TBD". Add to this as new versions ship with real dates.
const DATE_OVERRIDES = {
  "v0.9": "08/05/2026",
  "v0.8": "08/03/2026",
  "v0.7": "07/30/2026",
  "v0.6": "07/28/2026",
  "v0.5": "07/27/2026",
  "v0.4": "07/25/2026",
  "v0.3": "07/23/2026",
  "v0.2": "07/22/2026",
  "v0.1": "07/20/2026",
};

const START_MARKER = "<!-- BUILD:ENTRIES:START -->";
const END_MARKER = "<!-- BUILD:ENTRIES:END -->";
const BANNER_START = "<!-- BUILD:COMING-SOON:START -->";
const BANNER_END = "<!-- BUILD:COMING-SOON:END -->";
const STATUS_START = "<!-- BUILD:STATUS:START -->";
const STATUS_END = "<!-- BUILD:STATUS:END -->";

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Minimal Markdown inline -> HTML: **bold**, *italic*/_italic_, `code`.
// Also strips internal-only scaffolding: addendum file references,
// "See: ..." pointers, and parenthetical internal notes.
function inlineMd(text) {
  let out = text;
  out = out.replace(/\(see[^()]*\.md[^()]*\)/gi, "");
  out = out.replace(/\bsee[:,]?\s+`?[\w./-]+addendum[\w./-]*\.md`?/gi, "");
  out = out.replace(/\bSee:\s*(`?[\w./-]+\.md`?(,\s*)?)+/gi, "");
  out = escapeHtml(out);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return out.trim();
}

function parseChangelog(md) {
  const lines = md.split("\n");
  const versions = [];
  const unreleasedBullets = [];
  let current = null;
  let inUnreleased = false;
  let bulletTarget = null; // array currently accumulating a wrapped bullet
  let skipBullet = false; // true while accumulating a bullet we're dropping (See:/internal-only)

  function pushLine(text) {
    if (skipBullet || !bulletTarget) return;
    bulletTarget[bulletTarget.length - 1] += " " + text;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    const versionMatch = line.match(/^##\s+(v[\d.]+)\s+—\s+\[?([^—\]]*?)\]?\s+—\s+(.+)$/);
    const unreleasedMatch = line.match(/^##\s+Unreleased\s*$/);

    if (unreleasedMatch || versionMatch || line.startsWith("## ") || line === "---") {
      if (current) versions.push(current);
      current = null;
      bulletTarget = null;
      skipBullet = false;
      if (unreleasedMatch) {
        inUnreleased = true;
        continue;
      }
      inUnreleased = false;
      if (versionMatch) {
        current = {
          version: versionMatch[1],
          date: versionMatch[2].trim(),
          title: versionMatch[3].trim(),
          bullets: [],
        };
        bulletTarget = current.bullets;
      }
      continue;
    }

    if (!line.trim()) {
      // Blank line ends the current bullet's continuation, but not the section.
      continue;
    }

    if (line.startsWith("**Phase:**")) { skipBullet = true; continue; } // internal phase-tracking
    if (/^-\s*See:/i.test(line.trim())) { skipBullet = true; continue; } // addendum links, internal-only

    const bulletMatch = line.match(/^-\s+(.+)$/);
    if (bulletMatch) {
      const isInternalOnly = /internal only/i.test(bulletMatch[1]);
      skipBullet = isInternalOnly;
      const target = inUnreleased ? unreleasedBullets : (current ? current.bullets : null);
      if (!isInternalOnly && target) {
        target.push(bulletMatch[1]);
        bulletTarget = target;
      } else {
        bulletTarget = null;
      }
      continue;
    }

    // Continuation line (wrapped prose belonging to the previous bullet).
    if (/^\s+\S/.test(rawLine)) {
      pushLine(line.trim());
    }
  }
  if (current) versions.push(current);

  return { versions, unreleasedBullets };
}

function renderEntry(v) {
  const items = v.bullets
    .map(inlineMd)
    .filter(Boolean)
    .map((html) => `        <li>${html}</li>`)
    .join("\n");
  const dateLabel = DATE_OVERRIDES[v.version] || (v.date && v.date !== "DATE" ? v.date : "date TBD");
  return `    <div class="entry">
      <div class="meta"><span class="version">${escapeHtml(v.version)}</span><span class="date">[${escapeHtml(dateLabel)}]</span></div>
      <h2>${escapeHtml(v.title)}</h2>
      <ul>
${items}
      </ul>
    </div>`;
}

function renderComingSoon(unreleasedBullets) {
  if (!unreleasedBullets.length) return "";
  const first = inlineMd(unreleasedBullets[0]).replace(/^<strong>(.+?)<\/strong>\s*—?\s*/, "");
  const titleMatch = unreleasedBullets[0].match(/\*\*(.+?)\*\*/);
  const title = titleMatch ? inlineMd(titleMatch[1]) : "In progress";
  return `<div class="coming-soon">
  <p class="eyebrow">Up next</p>
  <h3>${title}</h3>
  <p>${first || "More on the way -- see the roadmap for what's being considered."}</p>
</div>`;
}

function main() {
  const md = fs.readFileSync(CHANGELOG_MD, "utf8");
  const html = fs.readFileSync(CHANGELOG_HTML, "utf8");
  const { versions, unreleasedBullets } = parseChangelog(md);

  if (!versions.length) {
    console.error("No version entries parsed from CHANGELOG.md -- aborting, leaving changelog.html untouched.");
    process.exit(1);
  }

  const entriesHtml = versions.map(renderEntry).join("\n\n");
  const comingSoonHtml = renderComingSoon(unreleasedBullets);
  const latest = versions[0];
  const statusHtml = `Currently in beta &nbsp;·&nbsp; Latest version: ${escapeHtml(latest.version)}`;

  function replaceBetween(source, startMarker, endMarker, replacement) {
    const startIdx = source.indexOf(startMarker);
    const endIdx = source.indexOf(endMarker);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      throw new Error(`Markers ${startMarker} / ${endMarker} not found in changelog.html -- template may have been edited by hand. Re-add the markers before running this script.`);
    }
    return (
      source.slice(0, startIdx + startMarker.length) +
      "\n" + replacement + "\n" +
      source.slice(endIdx)
    );
  }

  let next = html;
  next = replaceBetween(next, START_MARKER, END_MARKER, entriesHtml);
  next = replaceBetween(next, BANNER_START, BANNER_END, comingSoonHtml);
  next = replaceBetween(next, STATUS_START, STATUS_END, statusHtml);

  fs.writeFileSync(CHANGELOG_HTML, next, "utf8");
  console.log(`Regenerated marketing/changelog.html from CHANGELOG.md (${versions.length} versions, latest ${latest.version}).`);
  console.log("Reminder: this strips internal scaffolding (Phase labels, addendum links) but does NOT rewrite dev-facing");
  console.log("phrasing into external voice -- skim the diff and lightly edit tone/wording before committing/deploying.");
}

main();
