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

// Per-million-token USD rates, keyed by model string (see lib/claude.js's
// MODEL and HAIKU_MODEL constants). Update here if a model or Anthropic's
// pricing changes -- this is the only place these numbers live. Falls
// back to Sonnet's rate for any unrecognized model string rather than
// throwing, so a future model swap that forgets to update this table
// logs a plausible-but-wrong number instead of crashing generation.
const CLAUDE_RATES_PER_MTOK = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 }
};
const DEFAULT_RATE = CLAUDE_RATES_PER_MTOK["claude-sonnet-4-6"];

// Prompt caching (see lib/claude.js's cache_control support, added
// alongside this) bills the cacheable prefix differently from regular
// input tokens: writing to the cache costs 1.25x the normal input rate,
// reading from an existing cache costs 0.1x. Anthropic's published
// multipliers, not something we chose -- see
// https://docs.claude.com/en/docs/build-with-claude/prompt-caching
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

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

function logClaudeCost(usage, model) {
  const rate = CLAUDE_RATES_PER_MTOK[model] || DEFAULT_RATE;
  const inputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;
  // Present (nonzero) only on calls that used a cache_control block --
  // see prompts/*ContentPrompt.js for which prompts actually split their
  // system prompt into a cacheable static block + dynamic block.
  const cacheWriteTokens = usage?.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage?.cache_read_input_tokens || 0;

  const cost = (inputTokens / 1_000_000) * rate.input +
    (cacheWriteTokens / 1_000_000) * rate.input * CACHE_WRITE_MULTIPLIER +
    (cacheReadTokens / 1_000_000) * rate.input * CACHE_READ_MULTIPLIER +
    (outputTokens / 1_000_000) * rate.output;
  runningTotalUsd += cost;

  // What this call would have cost with no caching at all -- lets the
  // log line show the actual savings (or, on a cache-write call, the
  // small premium) instead of just the final number in isolation.
  const uncachedEquivalentCost =
    ((inputTokens + cacheWriteTokens + cacheReadTokens) / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output;
  const savings = uncachedEquivalentCost - cost;

  const cacheNote = cacheReadTokens > 0
    ? ` | cache: ${cacheReadTokens} read (saved $${savings.toFixed(4)})`
    : cacheWriteTokens > 0
      ? ` | cache: ${cacheWriteTokens} written (this call, +$${(savings * -1).toFixed(4)} premium; pays off on the next read within 5min)`
      : "";

  // Only note the model when it's NOT the default Sonnet call, so the
  // common case's log line doesn't get noisier than it needs to be.
  const modelNote = (model && model !== "claude-sonnet-4-6") ? ` [${model}]` : "";

  console.log(
    `[cost] Claude call${modelNote}: ${inputTokens} in / ${outputTokens} out tokens` +
    `${cacheNote} = $${cost.toFixed(4)} | session total so far: $${runningTotalUsd.toFixed(4)}`
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
