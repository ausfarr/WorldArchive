const { logClaudeCost } = require("./costTracker");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Cheaper/faster model for mechanical/templating tasks that don't need
// full creative reasoning -- currently used for artPromptPrompt.js's
// art-prompt-writing call. $1/$5 per MTok.
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// The model every content-generation call (NPC/enemy/item/survivor/
// class/location/log/faction bios, plus every wizard step) uses UNLESS
// it explicitly passes its own `model` -- see callClaude()'s default
// param below. Reads from CONTENT_MODEL env var first so switching
// models going forward (e.g. back to Sonnet, or to a future release)
// is a Render dashboard change + restart, not a code edit + redeploy.
// Currently defaulted to Haiku after the July 2026 cost/quality
// comparison (see scripts/compareTextModels.js / the debug route) --
// Haiku's output quality and reliability were judged close enough to
// Sonnet 4.6 to justify Sonnet's ~2.5x latency and ~3x cost across every
// generation in the app. Revisit this default any time; it's one env
// var, not a code change.
const CONTENT_MODEL = process.env.CONTENT_MODEL || HAIKU_MODEL;

// systemPrompt accepts either:
//   - a plain string (unchanged from before -- most prompt builders that
//     haven't been split for caching yet)
//   - an array of content blocks, e.g.
//       [{ type: "text", text: STATIC_INSTRUCTIONS, cache_control: { type: "ephemeral" } },
//        { type: "text", text: dynamicWorldContext }]
//     which is how prompts/*ContentPrompt.js's cacheable builders shape
//     it -- see cacheableSystemPrompt() at the bottom of each of those
//     files. The API accepts `system` as either shape directly, so no
//     translation is needed here beyond passing it through as-is.
//
// model defaults to CONTENT_MODEL (Haiku, or whatever CONTENT_MODEL is
// set to) -- pass model: explicitly (e.g. an explicit Sonnet model
// string) for any call that specifically needs a different tier.
async function callClaude({ systemPrompt, userMessage, maxTokens = 2000, model = CONTENT_MODEL }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  logClaudeCost(data.usage, model);
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text content in Claude response");
  return textBlock.text;
}

// Escapes bare control characters (raw newlines, tabs, carriage returns)
// found INSIDE a JSON string value but never escaped by the model as
// \n/\t/\r. This is a different failure from the prose-prefix case
// above: the JSON braces are already correctly positioned, but a
// multi-sentence field (physicalDescription, a dialogue reply, etc.)
// contains an actual line break instead of an escaped one, which is
// exactly what produces a JSON.parse error citing a specific line/column
// deep inside the response rather than at position 0. Walks the string
// character by character tracking string/escape state so replacements
// only ever happen inside a string value, never in the JSON structure
// itself (commas, braces, colons outside strings are left untouched).
function sanitizeControlCharsInStrings(text) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      continue;
    }
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = false;
      result += ch;
      continue;
    }
    if (ch === "\n") { result += "\\n"; continue; }
    if (ch === "\r") { result += "\\r"; continue; }
    if (ch === "\t") { result += "\\t"; continue; }
    result += ch;
  }
  return result;
}

// Strips accidental markdown code fences before JSON.parse, in case the
// model wraps its output despite instructions not to. Three fallback
// layers if the cleaned string still isn't valid JSON on its own:
//   1. Slice from the first '{' to the last '}' -- handles a model
//      prepending conversational preamble before the JSON.
//   2. Escape bare control characters inside string values -- handles a
//      model writing a real line break instead of an escaped \n inside
//      a prose field.
//   3. Both together, in case a response hits both failure modes at once.
// Falls through to the original JSON.parse error (the most informative
// one, pointing at the real problem) if none of these recover it.
function parseJsonResponse(text) {
  const cleaned = text.replace(/^```json\s*|^```\s*|```\s*$/gm, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (originalErr) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const sliced = start !== -1 && end !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;

    try {
      return JSON.parse(sliced);
    } catch (sliceErr) {
      try {
        return JSON.parse(sanitizeControlCharsInStrings(sliced));
      } catch (sanitizeErr) {
        throw originalErr;
      }
    }
  }
}

// Shared shape for splitting a system prompt into a cacheable static
// block (instructions/schema that never change) and a dynamic block
// (this world's setting/factions/roster, which does). See individual
// prompts/*ContentPrompt.js files for what's actually static per prompt
// -- this just standardizes the block shape so every file doesn't
// reimplement it slightly differently.
//
// cache_control on the static block only: everything up to and
// including a cache_control block is eligible for caching, so it must
// come first and the dynamic block must come after, uncached.
function buildCacheableSystemPrompt(staticText, dynamicText) {
  return [
    { type: "text", text: staticText, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicText }
  ];
}

// A value counts as "missing" for requiredKeys purposes if the key is
// absent, null, undefined, or a blank string -- but NOT an empty array or
// falsy-but-present value like `0`/`false`, since those can be genuine
// content (e.g. a faction with zero known relationships still returns
// "relationships": []). Only strings get the extra blank check, since an
// empty string is never meaningful content but an empty array/object can be.
function isMissingRequiredValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

// Thrown internally by parseAndValidate below when parsing succeeds but
// one or more requiredKeys are missing -- callClaudeExpectingJson's catch
// block checks for this specific error type to pick the "incomplete"
// retry framing over the generic "invalid JSON" one.
class IncompleteJsonError extends Error {
  constructor(missingKeys) {
    super(`Response was missing required field(s): ${missingKeys.join(", ")}`);
    this.missingKeys = missingKeys;
  }
}

function parseAndValidate(raw, requiredKeys) {
  const parsed = parseJsonResponse(raw);
  if (requiredKeys && requiredKeys.length) {
    const missing = requiredKeys.filter((key) => isMissingRequiredValue(parsed ? parsed[key] : undefined));
    if (missing.length) throw new IncompleteJsonError(missing);
  }
  return parsed;
}

// Wraps callClaude + parseJsonResponse with exactly one retry if parsing
// fails after all of parseJsonResponse's local repair attempts, OR (when
// `requiredKeys` is passed) if parsing succeeds but the result is missing
// one or more of those top-level keys. A second consecutive failure
// almost always means something structural rather than bad luck, so this
// deliberately retries once, not in a loop -- a loop would just spend
// more tokens chasing the same outcome. On retry, maxTokens is bumped 50%
// and the message explicitly flags the previous failure, since a
// truncated response (hit the token limit mid-JSON) is the most common
// real cause reaching this point -- parseJsonResponse's fallbacks handle
// malformed-but-complete JSON, not JSON missing its closing braces
// entirely. Every caller that generates structured content and expects
// JSON back should prefer this over the bare callClaude+parseJsonResponse
// pair, since a failure here means a generation-cap point and real token
// spend were already lost for nothing -- see
// session_addendum_campaign_structure_shipped.md's "not yet tested" note
// and the retry-once addendum for the context.
//
// requiredKeys exists because a truncated response doesn't always fail to
// parse -- parseJsonResponse's "slice to the last }" repair can produce
// valid JSON that's just missing whichever top-level keys the model
// hadn't gotten to yet when it hit maxTokens (schema-order-dependent: the
// LAST keys in a large schema are the ones most at risk). That silently
// slips past the parse-failure retry above with no error at all. Passing
// requiredKeys turns "parsed but incomplete" into the same retry path as
// "didn't parse" -- see lib/factionDeepLore.js's Deep Lore generation,
// the prompt that motivated this (session_addendum_beta_feedback_batch3.md,
// Fix 4).
async function callClaudeExpectingJson({ systemPrompt, userMessage, maxTokens = 2000, model = CONTENT_MODEL, requiredKeys = null }) {
  try {
    const raw = await callClaude({ systemPrompt, userMessage, maxTokens, model });
    return parseAndValidate(raw, requiredKeys);
  } catch (firstErr) {
    const retryMessage = firstErr instanceof IncompleteJsonError
      ? `${userMessage}\n\nIMPORTANT: your previous response was INCOMPLETE -- it was missing the following required field(s): ${firstErr.missingKeys.join(", ")}. Return the FULL JSON object again with EVERY field in the schema populated, including the ones you skipped last time -- no markdown, no code fences, no text before or after it.`
      : `${userMessage}\n\nIMPORTANT: your previous response could not be parsed as valid JSON. Return ONLY the JSON object this time -- no markdown, no code fences, no text before or after it -- and make sure it is fully complete with every opening brace/bracket closed.`;
    try {
      const raw = await callClaude({ systemPrompt, userMessage: retryMessage, maxTokens: Math.round(maxTokens * 1.5), model });
      return parseAndValidate(raw, requiredKeys);
    } catch (secondErr) {
      throw new Error(`${firstErr.message} (retry also failed: ${secondErr.message})`);
    }
  }
}

module.exports = { callClaude, parseJsonResponse, callClaudeExpectingJson, buildCacheableSystemPrompt, HAIKU_MODEL, CONTENT_MODEL };
