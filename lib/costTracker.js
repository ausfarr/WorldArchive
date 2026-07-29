// lib/costTracker.js
//
// Two things happen on every Claude/Gemini call:
//   1. Console log + process-lifetime running total (original behavior,
//      unchanged) -- still useful for watching a live Render log during
//      a manual test pass.
//   2. A row written to the persisted `cost_log` table (migrations/
//      008_cost_log.sql), tagged with world_id/user_id/category via
//      lib/costContext.js's AsyncLocalStorage. This is the durable
//      ledger that survives redeploys and can be queried per-user --
//      see routes/adminCost.js.
//
// Persistence is fire-and-forget and fully isolated in a try/catch: a
// Supabase hiccup here must never break actual content generation, so
// insert failures are logged and swallowed, not thrown.
//
// Claude cost is computed from real token usage the API returns per call.
// Image cost is a flat estimate -- Gemini's image-generation responses
// don't reliably expose billed-token counts the same way text responses
// do, so this is a rough number, clearly labeled as an estimate in the
// log line (and in the persisted row) rather than presented as metered
// fact.

const { supabase } = require("./supabaseClient");
const { getCostContext } = require("./costContext");

// Writes one row to cost_log. Never throws -- callers fire this without
// awaiting it, same as the console logging it sits alongside.
async function persistCostRow({ provider, inputTokens, outputTokens, cost }) {
  try {
    const { worldId, userId, category } = getCostContext();
    if (!worldId) return; // no request context (e.g. a script run outside Express) -- skip
    const { error } = await supabase.from("cost_log").insert({
      world_id: worldId,
      user_id: userId || null,
      category: category || "unknown",
      provider,
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      estimated_cost_usd: Number(cost.toFixed(5))
    });
    if (error) console.error("[cost] Failed to persist cost_log row:", error.message);
  } catch (err) {
    console.error("[cost] Failed to persist cost_log row:", err.message);
  }
}

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

  persistCostRow({
    provider: "claude",
    // Persisted input_tokens includes cache write/read tokens folded in
    // with regular input tokens -- the per-token rate differs (see cost
    // math above) but the *count* of tokens Claude processed as input
    // doesn't, and splitting cache accounting into its own columns isn't
    // worth it for a cost-visibility table (unlike the console line,
    // which does show the cache breakdown since that's the interesting
    // part to eyeball live).
    inputTokens: inputTokens + cacheWriteTokens + cacheReadTokens,
    outputTokens,
    cost
  });

  return cost;
}

function logImageCost() {
  runningTotalUsd += IMAGE_COST_ESTIMATE_USD;
  console.log(
    `[cost] Image call: ~$${IMAGE_COST_ESTIMATE_USD.toFixed(4)} (flat estimate, not metered) ` +
    `| session total so far: $${runningTotalUsd.toFixed(4)}`
  );

  persistCostRow({
    provider: "gemini",
    inputTokens: null,
    outputTokens: null,
    cost: IMAGE_COST_ESTIMATE_USD
  });

  return IMAGE_COST_ESTIMATE_USD;
}

function getRunningTotal() {
  return runningTotalUsd;
}

module.exports = { logClaudeCost, logImageCost, getRunningTotal };
