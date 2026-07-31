// lib/pdfExport.js
//
// Builds a print-ready HTML document from already-generated archive
// entries and rasterizes it to PDF via headless Chromium (puppeteer-core
// + @sparticuz/chromium, NOT full puppeteer -- keeps the dependency
// serverless/Render-friendly, no bundled browser download at install
// time).
//
// Deliberately reuses the exact bodyHtml every entry already has stored
// (entriesRepo's listEntries/getEntry -- see entriesRepo.js's row shape
// comment: raw_json includes bodyHtml, mirrored onto body_html) rather
// than re-deriving markup from raw_json through a second templating
// path. The live dossier page and the PDF are guaranteed to show the
// same content by construction, not by two systems staying in sync --
// same principle as the Editable Content rollout's "recompute, never
// duplicate" approach to derived stats.
//
// See session_addendum_export_and_generative_art_scope.md /
// multi_tenant_pivot_scope.md for the full scope decision (PDF format,
// three export granularities, image-include toggle, Puppeteer-over-
// dedicated-PDF-library reasoning).

const fs = require("fs");
const path = require("path");
const { listEntries, getEntry } = require("./entriesRepo");
const { getCategoryConfig } = require("./worldConfigRepo");

const CATEGORY_ORDER = [
  "factions",
  "npcs",
  "enemies",
  "classes",
  "items",
  "logs",
  "survivors",
  "locations"
];

const DEFAULT_CATEGORY_LABELS = {
  factions: "Factions",
  npcs: "NPCs",
  enemies: "Bestiary",
  classes: "Classes",
  items: "Items",
  logs: "Logs",
  survivors: "Survivors",
  locations: "Locations"
};

// Reads the live site's real stylesheet once per process and reuses it
// for every export -- the PDF should look like the archive, not like a
// separately-maintained print layout. Cached rather than re-read per
// request since the file only changes on deploy.
let cachedBaseCss = null;
function getBaseCss() {
  if (cachedBaseCss !== null) return cachedBaseCss;
  try {
    cachedBaseCss = fs.readFileSync(
      path.join(__dirname, "..", "archive", "css", "style.css"),
      "utf8"
    );
  } catch (err) {
    console.error(
      "pdfExport: could not read archive/css/style.css, continuing without it:",
      err.message
    );
    cachedBaseCss = "";
  }
  return cachedBaseCss;
}

// Print-only overrides layered on top of the live site's stylesheet --
// hides/adjusts things that only make sense on a screen (neon glow
// backgrounds, dark panels that would waste printer ink) and adds page-
// break rules so entries don't split awkwardly across pages. Kept
// separate from style.css on purpose -- these rules have no meaning on
// the live site and shouldn't be loaded there.
const PRINT_CSS = `
  /* The live site is a dark neon-on-void theme -- every component
     (dialogue blocks, sheet headers, tags) reads its colors from these
     CSS custom properties, not from body's color directly. Redefining
     them here to a print-safe light palette is what actually fixes
     contrast throughout the document; overriding body alone left every
     nested .dialogue-block/.sheet-body h2/.tag still rendering its
     original dark-panel-background-with-neon-text, just now floating on
     a white page instead of the site's dark void. */
  :root {
    --bg-void: #ffffff;
    --bg-panel: #faf9f6;
    --bg-panel-raised: #f1efe9;
    --border-line: #d6d2c4;
    --border-line-soft: #e6e3d9;
    --ink: #1a1a1a;
    --ink-dim: #45454a;
    --ink-faint: #75767a;
    --neon-primary: #a3123f;
    --neon-cyan: #0d7a6b;
  }
  /* Chrome mutes/desaturates saturated colors by default when printing
     ("print color economy") unless told not to -- without this, even
     the print-safe palette above renders washed out. */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  @page { margin: 0.6in; }
  body { background: var(--bg-void) !important; color: var(--ink) !important; }
  .pdf-cover { page-break-after: always; }
  .pdf-cover h1 { font-size: 2.2rem; margin-top: 40vh; }
  .pdf-toc { page-break-after: always; }
  .pdf-toc ul { list-style: none; padding: 0; margin: 0 0 20px; }
  .pdf-toc li { padding: 4px 0; border-bottom: 1px dotted var(--border-line); font-size: 0.85rem; }
  .pdf-toc a { color: inherit; text-decoration: none; }
  /* Original .sheet margin/spacing (32px 0 80px) was designed for many
     sheets stacked on a scrolling webpage -- with one sheet per printed
     page here, that extra spacing just pushes content around inside the
     page margin for no reason. Zeroed out; @page's own margin already
     frames each page. */
  .pdf-entry.sheet { margin: 0; }
  .pdf-entry { page-break-after: always; }
  .pdf-entry:last-child { page-break-after: avoid; }
  .pdf-entry .portrait-img { max-width: 260px; max-height: 260px; border: 1px solid var(--border-line); }
  .pdf-category-heading { page-break-before: always; }
  .pdf-category-heading:first-of-type { page-break-before: avoid; }
`;

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slug(str) {
  return (
    String(str || "export")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "export"
  );
}

// Strips <img> tags for the "images off" export toggle. Simpler and more
// robust than trying to intercept image generation earlier in the
// pipeline -- every category's bodyHtml already has a consistent <img
// class="portrait-img" ...> shape (see lib/entryTemplate.js and its
// per-category equivalents), so a single regex covers all 8 categories.
function stripImages(html) {
  return String(html || "").replace(/<img\b[^>]*>/gi, "");
}

async function resolveCategoryLabel(worldId, category) {
  try {
    const config = await getCategoryConfig(worldId);
    if (config && config[category] && config[category].label) {
      return config[category].label;
    }
  } catch (err) {
    console.error(
      `pdfExport: could not resolve category label for ${category}:`,
      err.message
    );
  }
  return DEFAULT_CATEGORY_LABELS[category] || category;
}

async function resolveWorldTitle(worldId) {
  try {
    const config = await getCategoryConfig(worldId);
    if (config && config._site && config._site.title) return config._site.title;
  } catch (err) {
    console.error("pdfExport: could not resolve world title:", err.message);
  }
  return "Chronicled";
}

function buildEntryBlock(entry, includeImages) {
  const name = escapeHtml(entry.name || entry.id);
  const subtitle = entry.subtitle
    ? `<p class="subtitle">${escapeHtml(entry.subtitle)}</p>`
    : "";
  const body = includeImages ? entry.bodyHtml : stripImages(entry.bodyHtml);
  const footer =
    Array.isArray(entry.footer) && entry.footer.length
      ? `<div class="sheet-footer"><p>${entry.footer.map(escapeFooterLine).join("</p><p>")}</p></div>`
      : "";
  return `
<section class="pdf-entry sheet" id="entry-${escapeHtml(entry.id)}">
  <div class="sheet-header">
    <h1>${name}</h1>
    ${subtitle}
  </div>
  <div class="sheet-body">${body || ""}</div>
  ${footer}
</section>`;
}

// Footer lines (see lib/entryTemplate.js's buildEntryFileContent, and its
// per-category equivalents) are pre-built HTML fragments, not plain text
// -- they already contain an <a> tag for the faction cross-reference.
// Passed through as-is rather than escaped a second time.
function escapeFooterLine(line) {
  return String(line || "");
}

function buildTocSection(label, entries) {
  const items = entries
    .map(
      (e) =>
        `<li><a href="#entry-${escapeHtml(e.id)}">${escapeHtml(e.name)}</a></li>`
    )
    .join("");
  return `<h3>${escapeHtml(label)}</h3><ul>${items}</ul>`;
}

function wrapDocument(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>${getBaseCss()}
${PRINT_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// scope: "world" | "category" | "entry". Returns { html, filename } or
// null if the requested entry doesn't exist (category/world scopes just
// render whatever's there, including zero entries).
async function buildExportHtml(worldId, scope, params, includeImages) {
  const worldTitle = await resolveWorldTitle(worldId);

  if (scope === "entry") {
    const entry = await getEntry(worldId, params.category, params.entryId);
    if (!entry) return null;
    const label = await resolveCategoryLabel(worldId, params.category);
    const cover = `<section class="pdf-cover"><p class="sheet-eyebrow">${escapeHtml(
      worldTitle
    )} — ${escapeHtml(label)}</p><h1>${escapeHtml(entry.name)}</h1></section>`;
    const body = cover + buildEntryBlock(entry, includeImages);
    return {
      html: wrapDocument(`${worldTitle} — ${entry.name}`, body),
      filename: `${slug(entry.name || entry.id)}.pdf`
    };
  }

  if (scope === "category") {
    // listEntries() already returns full entries (raw_json is spread in,
    // which includes bodyHtml -- see entriesRepo.js's rowToManifestEntry)
    // so no per-entry getEntry() round trip is needed here.
    const entries = await listEntries(worldId, params.category);
    const label = await resolveCategoryLabel(worldId, params.category);
    const cover = `<section class="pdf-cover"><p class="sheet-eyebrow">${escapeHtml(
      worldTitle
    )}</p><h1>${escapeHtml(label)}</h1><p>${entries.length} ${
      entries.length === 1 ? "entry" : "entries"
    }</p></section>`;
    const body =
      cover + entries.map((e) => buildEntryBlock(e, includeImages)).join("\n");
    return {
      html: wrapDocument(`${worldTitle} — ${label}`, body),
      filename: `${slug(worldTitle)}-${params.category}.pdf`
    };
  }

  // scope === "world"
  const byCategory = [];
  for (const cat of CATEGORY_ORDER) {
    const entries = await listEntries(worldId, cat);
    if (!entries.length) continue;
    const label = await resolveCategoryLabel(worldId, cat);
    byCategory.push({ category: cat, label, entries });
  }

  const cover = `<section class="pdf-cover"><h1>${escapeHtml(
    worldTitle
  )}</h1><p>Full World Archive Export</p></section>`;
  const toc = `<section class="pdf-toc"><h1>Contents</h1>${byCategory
    .map((c) => buildTocSection(c.label, c.entries))
    .join("")}</section>`;
  const sections = byCategory
    .map(
      (c) =>
        `<h2 class="pdf-category-heading">${escapeHtml(c.label)}</h2>` +
        c.entries.map((e) => buildEntryBlock(e, includeImages)).join("\n")
    )
    .join("\n");

  return {
    html: wrapDocument(worldTitle, cover + toc + sections),
    filename: `${slug(worldTitle)}-full-export.pdf`
  };
}

// Lazily required -- keeps puppeteer-core/chromium (a large dependency)
// out of the require graph, and out of every cold start, for every
// request that isn't an export.
let _puppeteer = null;
let _chromium = null;
function getPuppeteer() {
  if (!_puppeteer) {
    _puppeteer = require("puppeteer-core");
    _chromium = require("@sparticuz/chromium");
  }
  return { puppeteer: _puppeteer, chromium: _chromium };
}

// Renders an assembled HTML string (from buildExportHtml above) to a PDF
// buffer. Takes a raw HTML string via page.setContent() rather than a
// live URL -- avoids any auth/routing complexity, and means this has no
// dependency on the app's own server being reachable from itself.
//
// NOTE for whoever deploys this: @sparticuz/chromium's version should
// track puppeteer-core's expected Chromium build -- check
// https://pptr.dev/chromium-support against the installed puppeteer-core
// version if PDF generation starts failing after a dependency bump.
async function renderPdfBuffer(html) {
  const { puppeteer, chromium } = getPuppeteer();
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: "shell"
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBytes = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.6in", bottom: "0.6in", left: "0.6in", right: "0.6in" }
    });
    // page.pdf() returns a Uint8Array in current puppeteer-core, not a
    // classic Node Buffer. Express's res.send() only treats true
    // Buffer.isBuffer()===true values as binary -- anything else that's
    // an object falls through to res.json(), which JSON-stringifies it
    // byte-by-byte (produces {"0":37,"1":80,...} instead of real PDF
    // bytes, and inflates the file size ~5-8x in the process). Wrapping
    // here guarantees routes/export.js always gets a real Buffer,
    // regardless of what shape future puppeteer-core versions return.
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}

module.exports = { buildExportHtml, renderPdfBuffer, slug, CATEGORY_ORDER };
