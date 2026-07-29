// lib/costContext.js
//
// callClaude() and generateImage() are called from ~25 places across
// routes/*.js and lib/factionDeepLore.js, none of which currently pass
// any per-request identity through. Threading { worldId, userId,
// category } as new params through every one of those call sites (and
// every prompt builder that wraps them) would be a large, error-prone
// diff for what's fundamentally just a logging concern.
//
// Node's AsyncLocalStorage solves this without touching any call site:
// middleware/attachCostContext.js sets the context once per request,
// and it stays correctly attached across any async/await chain that
// follows within that request -- including the callClaude/generateImage
// calls buried inside route handlers and prompt builders. costTracker.js
// reads it back via getCostContext() at the point it logs a cost.
//
// Falls back to an empty object if read outside a request (e.g. a
// script run directly, not through Express) -- persistCostRow() in
// costTracker.js treats a missing worldId as "skip persistence, console
// log still happened" rather than throwing.

const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

function runWithCostContext(context, callback) {
  storage.run(context, callback);
}

function getCostContext() {
  return storage.getStore() || {};
}

module.exports = { runWithCostContext, getCostContext };
