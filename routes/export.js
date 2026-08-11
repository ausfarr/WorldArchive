const express = require("express");
const { buildExportHtml, renderPdfBuffer } = require("../lib/pdfExport");

const router = express.Router();

// Kept in sync with entries.js's VALID_CATEGORIES -- duplicated rather
// than imported since entries.js doesn't currently export it; worth
// hoisting both into a shared constants module if a third route ever
// needs this list.
const VALID_CATEGORIES = new Set([
  "factions",
  "npcs",
  "enemies",
  "classes",
  "items",
  "logs",
  "survivors",
  "locations",
  "spells" // multi-ruleset genericization -- see entries.js's matching comment
]);

// Query param default is "include images" -- matches the checked-by-
// default checkbox in the frontend export controls. Only an explicit
// ?images=false turns them off.
function parseIncludeImages(req) {
  return req.query.images !== "false";
}

function sendPdfHeaders(res, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
}

// Whole-world export -- Settings tab "Download Whole World" button.
router.get("/export/world", async (req, res) => {
  try {
    const includeImages = parseIncludeImages(req);
    const built = await buildExportHtml(req.worldId, "world", {}, includeImages);
    const buffer = await renderPdfBuffer(built.html);
    sendPdfHeaders(res, built.filename);
    res.send(buffer);
  } catch (err) {
    console.error("World export failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Per-category export -- "Download PDF" button on each category tab
// (Factions, NPCs, etc.), above the entry grid.
router.get("/export/category/:category", async (req, res) => {
  if (!VALID_CATEGORIES.has(req.params.category)) {
    return res.status(400).json({ error: `Unknown category '${req.params.category}'.` });
  }
  try {
    const includeImages = parseIncludeImages(req);
    const built = await buildExportHtml(
      req.worldId,
      "category",
      { category: req.params.category },
      includeImages
    );
    const buffer = await renderPdfBuffer(built.html);
    sendPdfHeaders(res, built.filename);
    res.send(buffer);
  } catch (err) {
    console.error(`Category export (${req.params.category}) failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Per-entry export -- "Download PDF" button on each dossier/entry sheet.
router.get("/export/entry/:category/:id", async (req, res) => {
  if (!VALID_CATEGORIES.has(req.params.category)) {
    return res.status(400).json({ error: `Unknown category '${req.params.category}'.` });
  }
  try {
    const includeImages = parseIncludeImages(req);
    const built = await buildExportHtml(
      req.worldId,
      "entry",
      { category: req.params.category, entryId: req.params.id },
      includeImages
    );
    if (!built) return res.status(404).json({ error: "Entry not found." });
    const buffer = await renderPdfBuffer(built.html);
    sendPdfHeaders(res, built.filename);
    res.send(buffer);
  } catch (err) {
    console.error(`Entry export (${req.params.category}/${req.params.id}) failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Campaign Module export -- "Download PDF" button on a module's view
// page. A full session-prep packet (every referenced entry's complete
// sheet, in module order), not just the reference list -- see
// lib/pdfExport.js's "campaign" scope for why.
router.get("/export/campaign/:id", async (req, res) => {
  try {
    const includeImages = parseIncludeImages(req);
    const built = await buildExportHtml(req.worldId, "campaign", { moduleId: req.params.id }, includeImages);
    if (!built) return res.status(404).json({ error: "Campaign Module not found." });
    const buffer = await renderPdfBuffer(built.html);
    sendPdfHeaders(res, built.filename);
    res.send(buffer);
  } catch (err) {
    console.error(`Campaign Module export (${req.params.id}) failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
