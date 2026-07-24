// lib/costTracker.js
//
// Lightweight, in-memory API cost logging for manual testing during the
// beta period -- NOT persisted anywhere (resets on every server restart/
// deploy), and NOT tied to the generation_count cap in worldConfigRepo.js.
// Purpose: let Austin watch Railway's service logs during a manual test
// pass (wizard + N generations) and see roughly what it actually costs,
// before locking in a real cap number or a billing model. Once real
// metering (Phase 5) exists, this can be retired.
//
// Claude cost is computed from real token usage the API returns per call.
// Image cost is a flat estimate -- Gemini's image-generation responses
// don't reliably expose billed-token counts the same way text responses
// do, so this is a rough number, clearly labeled as an estimate in the
// log line rather than presented as metered fact.

// Per-million-token USD rates for the model in lib/claude.js (MODEL =
// "claude-sonnet-4-6"). Update here if the model or Anthropic's pricing
// changes -- this is the only place these numbers live.
const CLAUDE_INPUT_PER_MTOK = 3.0;
const CLAUDE_OUTPUT_PER_MTOK = 15.0;

// Flat per-image estimate for gemini-3.1-flash-image at the 16:9 aspect
// ratio this app always requests (see lib/imagegen.js). Rough midpoint
// of published per-image pricing for this model tier as of mid-2026 --
// not billed-token-accurate. Update if Google's pricing or the model
// changes.
const IMAGE_COST_ESTIMATE_USD = 0.08;

// Process-lifetime running total across every call this server instance
// has made. Resets to 0 on restart/redeploy -- intentional, this is meant
// to answer "what did today's test session cost," not to be a durable
// ledger (that's what real metering would be for).
let runningTotalUsd = 0;

function logClaudeCost(usage) {
  const inputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;
  const cost = (inputTokens / 1_000_000) * CLAUDE_INPUT_PER_MTOK +
    (outputTokens / 1_000_000) * CLAUDE_OUTPUT_PER_MTOK;
  runningTotalUsd += cost;
  console.log(
    `[cost] Claude call: ${inputTokens} in / ${outputTokens} out tokens ` +
    `= $${cost.toFixed(4)} | session total so far: $${runningTotalUsd.toFixed(4)}`
  );
  return cost;
}

function logImageCost() {
  runningTotalUsd += IMAGE_COST_ESTIMATE_USD;
  console.log(
    `[cost] Image call: ~$${IMAGE_COST_ESTIMATE_USD.toFixed(4)} (flat estimate, not metered) ` +
    `| session total so far: $${runningTotalUsd.toFixed(4)}`
  );
  return IMAGE_COST_ESTIMATE_USD;
}

function getRunningTotal() {
  return runningTotalUsd;
}

module.exports = { logClaudeCost, logImageCost, getRunningTotal };
