// middleware/attachCostContext.js
//
// Mount AFTER resolveTenant (needs req.worldId/req.userId already set)
// and BEFORE every route router, so every /api request -- generation
// routes, wizard routes, map, everything -- carries its cost-logging
// context for the rest of the request. See lib/costContext.js for why
// this exists instead of passing new params through every callClaude/
// generateImage call site.
//
// Category is derived from the URL rather than passed explicitly, so
// adding this required zero changes to any route file. Order matters --
// more specific patterns first (e.g. "/generate-faction" would also
// match a naive "/generate" substring check, so exact route names are
// matched via a lookup table instead of substring matching).
const ROUTE_CATEGORY_MAP = {
  "/generate-npc": "npcs",
  "/generate-enemy": "enemies",
  "/generate-item": "items",
  "/generate-survivor": "survivors",
  "/generate-log": "logs",
  "/generate-class": "classes",
  "/generate-faction": "factions",
  "/generate-location": "locations",
  "/map/generate-backdrop": "map"
};

function deriveCategory(originalUrl) {
  const pathOnly = originalUrl.split("?")[0];
  for (const [route, category] of Object.entries(ROUTE_CATEGORY_MAP)) {
    if (pathOnly.endsWith(route)) return category;
  }
  if (pathOnly.includes("/wizard")) return "wizard";
  return "other";
}

const { runWithCostContext } = require("../lib/costContext");

function attachCostContext(req, res, next) {
  const context = {
    worldId: req.worldId,
    userId: req.userId,
    category: deriveCategory(req.originalUrl || req.url)
  };
  runWithCostContext(context, next);
}

module.exports = { attachCostContext };
