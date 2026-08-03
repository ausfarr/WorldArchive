// lib/dungeonMapCompositor.js
//
// Bakes the grid permanently into a battle map's PNG, server-side, so the
// stored image is one flattened file -- no separate SVG overlay, no
// client-side compositing, no cross-origin canvas complications. This is
// what makes a plain right-click "Save image as" on the rendered <img>
// actually include the grid, exactly like every other image already in
// the app (portraits, faction banners, etc.) -- see session addendum for
// the reasoning on why markers/tokens were dropped from this feature
// entirely (the DM manages those in whatever tool they actually run the
// table with; this app's job stops at "give them a clean, gridded map
// image").
//
// Reuses puppeteer-core + @sparticuz/chromium -- already a project
// dependency for lib/pdfExport.js's PDF rendering, not a new one. Same
// lazy-require pattern (keeps this large dependency out of every cold
// start that isn't compositing a map) and the same launch config.

const CANVAS_SIZE = 1024; // px -- square, matches the 1:1 aspect requested from Gemini

// Lazily required -- see lib/pdfExport.js's getPuppeteer() for the same
// pattern and the reasoning.
let _puppeteer = null;
let _chromium = null;
function getPuppeteer() {
  if (!_puppeteer) {
    _puppeteer = require("puppeteer-core");
    _chromium = require("@sparticuz/chromium");
  }
  return { puppeteer: _puppeteer, chromium: _chromium };
}

function buildCompositeHtml(base64Image, mimeType, gridSize) {
  const cell = CANVAS_SIZE / gridSize;
  const lines = [];
  for (let i = 0; i <= gridSize; i++) {
    const pos = (i * cell).toFixed(2);
    lines.push(`<line x1="${pos}" y1="0" x2="${pos}" y2="${CANVAS_SIZE}" />`);
    lines.push(`<line x1="0" y1="${pos}" x2="${CANVAS_SIZE}" y2="${pos}" />`);
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; }
  body { width: ${CANVAS_SIZE}px; height: ${CANVAS_SIZE}px; overflow: hidden; }
  #stage { position: relative; width: ${CANVAS_SIZE}px; height: ${CANVAS_SIZE}px; }
  #stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  #stage svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  #stage svg line { stroke: rgba(255,255,255,0.35); stroke-width: 1.5; }
</style>
</head>
<body>
  <div id="stage">
    <img src="data:${mimeType};base64,${base64Image}">
    <svg viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">${lines.join("")}</svg>
  </div>
</body>
</html>`;
}

// Takes the raw AI-generated image buffer + its mime type, returns a new
// PNG Buffer with the grid permanently composited on top at CANVAS_SIZE
// resolution. Never throws for a "grid didn't fit" reason -- gridSize is
// always a fixed, known-safe value (see routes/dungeonMap.js's
// DEFAULT_GRID_SIZE), so the only realistic failure mode is Chromium
// itself failing to launch, which should surface as a real error, not be
// swallowed here.
async function compositeGridOntoImage(imageBuffer, mimeType, gridSize) {
  const { puppeteer, chromium } = getPuppeteer();
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    defaultViewport: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    executablePath,
    headless: "shell"
  });
  try {
    const page = await browser.newPage();
    const html = buildCompositeHtml(imageBuffer.toString("base64"), mimeType, gridSize);
    await page.setContent(html, { waitUntil: "networkidle0" });
    const stage = await page.$("#stage");
    const screenshot = await stage.screenshot({ type: "png" });
    return Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
}

module.exports = { compositeGridOntoImage, CANVAS_SIZE };
